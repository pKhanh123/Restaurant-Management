import { randomUUID } from 'node:crypto';
import { CashVoucherDirection, CashVoucherSourceType, Prisma, type CashVoucher, type FinancialAccountType } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import {
  assertPostingTimePolicy, assertVndAmount, manualSourceKey, requiredAccountType,
  type CashbookActorRole, type CashbookPaymentMethod
} from './cashbook.domain';
import { CashbookBalanceService } from './cashbook-balance.service';
import { sourceTransactionKey } from './cashbook.domain';
import { cashbookSourceDirections } from './cashbook.source-map';

export interface CashbookPostingActor { id: number; name?: string | null; role: CashbookActorRole }

export interface CashbookPostingInput {
  direction: CashVoucherDirection;
  amount: number;
  accountId: number;
  categoryId: number;
  paymentMethod?: CashbookPaymentMethod | null;
  occurredAt: Date;
  occurrenceTimeWasRequested?: boolean;
  reason?: string | null;
  sourceType: CashVoucherSourceType;
  sourceTransactionId?: number | null;
  clientRequestId?: string | null;
  sourceCode?: string | null;
  counterpartyType?: string | null;
  counterpartyId?: number | null;
  counterpartyName?: string | null;
  note?: string | null;
  affectsBusinessResult?: boolean;
  linkedPurchaseReceiptId?: number | null;
  sourceInvoiceNumber?: string | null;
  sourceInvoiceDate?: Date | null;
}

export function normalizeCashbookPersistenceError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      throw ApiError.conflict('Sổ quỹ vừa được thay đổi bởi giao dịch khác. Vui lòng tải lại và thử lại.', 'CASHBOOK_CONCURRENCY_CONFLICT');
    }
    if (error.code === 'P2002') {
      throw ApiError.conflict('Giao dịch Sổ quỹ trùng với chứng từ đã tồn tại.', 'CASHBOOK_DUPLICATE');
    }
  }
  throw error;
}

export async function resolveCashbookAccountForPayment(
  tx: Prisma.TransactionClient,
  paymentMethod: CashbookPaymentMethod,
  requestedAccountId?: number | null
): Promise<number | null> {
  // Fence source transactions against activation: a payment may be committed either
  // before activation (outside the ledger) or after activation (inside it), never in-between.
  const settings = await tx.$queryRaw<Array<{ activatedAt: Date | null }>>`
    SELECT activatedAt FROM CashbookSetting WHERE id = 1 FOR SHARE
  `;
  const setting = settings[0];
  const expectedType = requiredAccountType(paymentMethod);
  const account = requestedAccountId
    ? await tx.financialAccount.findUnique({ where: { id: requestedAccountId } })
    : expectedType === 'CASH'
      ? await tx.financialAccount.findFirst({ where: { type: 'CASH', isDefault: true, isActive: true } })
      : null;
  if (!account) {
    if (setting?.activatedAt) throw ApiError.badRequest('Cần chọn tài khoản tài chính nhận khoản thanh toán.');
    return null;
  }
  if (!account.isActive) throw ApiError.conflict('Tài khoản tài chính đã ngừng hoạt động.', 'CASHBOOK_ACCOUNT_INACTIVE');
  if (account.type !== expectedType) {
    throw ApiError.conflict('Tài khoản nhận tiền không khớp phương thức thanh toán.', 'CASHBOOK_PAYMENT_METHOD_ACCOUNT_MISMATCH');
  }
  return account.id;
}

function voucherCode(direction: CashVoucherDirection, now: Date): string {
  const prefix = direction === CashVoucherDirection.RECEIPT ? 'PT' : 'PC';
  const date = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function sourceKey(input: CashbookPostingInput, actor: CashbookPostingActor): string {
  if (input.sourceType === CashVoucherSourceType.MANUAL) {
    if (!input.clientRequestId) throw ApiError.badRequest('Phiếu thủ công cần Idempotency-Key.');
    return manualSourceKey(actor.id, input.clientRequestId);
  }
  if (input.sourceType === CashVoucherSourceType.REVERSAL) {
    throw ApiError.badRequest('Phiếu đảo phải được tạo qua quy trình reversal.');
  }
  if (!input.sourceTransactionId) throw ApiError.badRequest('Phiếu tự động cần ID giao dịch tiền nguồn.');
  return sourceTransactionKey(input.sourceType, input.sourceTransactionId);
}

function runDomainValidation<T>(validation: () => T): T {
  try { return validation(); }
  catch (error) {
    if (error instanceof Error) throw ApiError.badRequest(error.message);
    throw error;
  }
}

async function assertSameReplay(tx: Prisma.TransactionClient, existing: CashVoucher, input: CashbookPostingInput): Promise<CashVoucher> {
  const category = await tx.cashFlowCategory.findUnique({ where: { id: input.categoryId }, select: { affectsBusinessResultDefault: true } });
  const affectsBusinessResult = input.affectsBusinessResult ?? category?.affectsBusinessResultDefault;
  if (existing.direction !== input.direction || existing.amount !== input.amount || existing.accountId !== input.accountId ||
      existing.categoryId !== input.categoryId || existing.paymentMethod !== (input.paymentMethod ?? null) ||
      existing.sourceCode !== (input.sourceCode ?? null) || existing.counterpartyType !== (input.counterpartyType ?? null) ||
      existing.counterpartyId !== (input.counterpartyId ?? null) || existing.counterpartyName !== (input.counterpartyName ?? null) ||
      existing.note !== (input.note ?? null) || existing.affectsBusinessResult !== affectsBusinessResult ||
      existing.linkedPurchaseReceiptId !== (input.linkedPurchaseReceiptId ?? null) ||
      existing.sourceInvoiceNumber !== (input.sourceInvoiceNumber ?? null) ||
      (existing.sourceInvoiceDate?.getTime() ?? null) !== (input.sourceInvoiceDate?.getTime() ?? null) ||
      (input.sourceType !== CashVoucherSourceType.MANUAL || input.occurrenceTimeWasRequested) &&
        existing.occurredAt.getTime() !== input.occurredAt.getTime()) {
    throw ApiError.conflict('Khóa idempotency đã được dùng cho nội dung phiếu khác.', 'CASHBOOK_SOURCE_REPLAY_MISMATCH');
  }
  return existing;
}

export class CashbookPostingService {
  static async post(tx: Prisma.TransactionClient, input: CashbookPostingInput, actor: CashbookPostingActor): Promise<CashVoucher | null> {
    const stableKey = runDomainValidation(() => sourceKey(input, actor));
    const previous = await tx.cashVoucher.findUnique({ where: { sourceKey: stableKey } });
    if (previous) return assertSameReplay(tx, previous, input);

    const now = new Date();
    // Read the setting from the locking query itself. A plain follow-up SELECT can keep
    // seeing the pre-activation snapshot under REPEATABLE READ after waiting on this fence.
    const settings = await tx.$queryRaw<Array<{ activatedAt: Date | null }>>`
      SELECT activatedAt FROM CashbookSetting WHERE id = 1 FOR SHARE
    `;
    const setting = settings[0];
    if (!setting?.activatedAt) return null;
    const occurredAt = input.occurredAt;
    if (input.sourceType === CashVoucherSourceType.MANUAL) {
      runDomainValidation(() => assertPostingTimePolicy({ role: actor.role, occurredAt, now, activatedAt: setting.activatedAt!, reason: input.reason ?? undefined }));
    } else if (!Number.isFinite(occurredAt.getTime()) || occurredAt < setting.activatedAt || occurredAt > now) {
      throw ApiError.conflict('Thời điểm giao dịch nguồn nằm ngoài thời gian hoạt động của Sổ quỹ.', 'CASHBOOK_SETTING_INACTIVE');
    }
    const amount = runDomainValidation(() => assertVndAmount(input.amount));
    if (input.sourceType !== CashVoucherSourceType.MANUAL && input.sourceType !== CashVoucherSourceType.REVERSAL &&
        cashbookSourceDirections[input.sourceType] !== input.direction) {
      throw ApiError.conflict('Chiều giao dịch không khớp loại sự kiện nguồn.', 'CASHBOOK_CATEGORY_DIRECTION_MISMATCH');
    }

    // Serialize ledger mutations and validate account state from the same current read.
    // A plain Prisma read here could observe an older snapshot after waiting for this lock.
    const accounts = await tx.$queryRaw<Array<{ id: number; type: FinancialAccountType; isActive: boolean }>>`
      SELECT id, type, isActive
      FROM FinancialAccount
      WHERE id = ${input.accountId}
      FOR UPDATE
    `;
    const account = accounts[0];
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản quỹ.', 'CASHBOOK_ACCOUNT_NOT_FOUND');
    if (!account.isActive) throw ApiError.conflict('Tài khoản quỹ đã ngừng hoạt động.', 'CASHBOOK_ACCOUNT_INACTIVE');
    if (input.paymentMethod && requiredAccountType(input.paymentMethod) !== account.type) {
      throw ApiError.conflict('Phương thức thanh toán không khớp loại tài khoản quỹ.', 'CASHBOOK_PAYMENT_METHOD_ACCOUNT_MISMATCH');
    }
    const category = await tx.cashFlowCategory.findUnique({ where: { id: input.categoryId } });
    if (!category?.isActive) throw ApiError.notFound('Không tìm thấy danh mục thu chi đang hoạt động.', 'CASHBOOK_CATEGORY_NOT_FOUND');
    if (category.direction !== input.direction) {
      throw ApiError.conflict('Danh mục không khớp chiều thu/chi của phiếu.', 'CASHBOOK_CATEGORY_DIRECTION_MISMATCH');
    }
    if (input.sourceType === CashVoucherSourceType.MANUAL && category.isSystem) {
      throw ApiError.badRequest('Danh mục hệ thống không dùng cho phiếu thủ công.');
    }
    if (input.sourceType !== CashVoucherSourceType.MANUAL && input.affectsBusinessResult !== undefined &&
        input.affectsBusinessResult !== category.affectsBusinessResultDefault) {
      throw ApiError.badRequest('Phiếu tự động phải dùng mặc định của danh mục.');
    }
    if (input.sourceType === CashVoucherSourceType.MANUAL && input.affectsBusinessResult !== undefined &&
        input.affectsBusinessResult !== category.affectsBusinessResultDefault &&
        (actor.role !== 'ADMIN' || !input.reason?.trim())) {
      throw ApiError.forbidden('Chỉ quản trị viên được đổi cách tính kết quả kinh doanh và phải nêu lý do.');
    }

    await CashbookBalanceService.assertDeltaPreservesRunningBalance(
      tx, account.id, occurredAt, input.direction === CashVoucherDirection.RECEIPT ? amount : -amount
    );
    const data: Prisma.CashVoucherCreateInput = {
      code: voucherCode(input.direction, now),
      direction: input.direction,
      amount,
      occurredAt,
      account: { connect: { id: account.id } },
      category: { connect: { id: category.id } },
      createdBy: { connect: { id: actor.id } },
      sourceType: input.sourceType,
      sourceKey: stableKey,
      sourceTransactionId: input.sourceTransactionId ?? null,
      clientRequestId: input.sourceType === CashVoucherSourceType.MANUAL ? input.clientRequestId : null,
      paymentMethod: input.paymentMethod ?? null,
      handlerName: actor.name ?? null,
      sourceCode: input.sourceCode ?? null,
      counterpartyType: input.counterpartyType ?? null,
      counterpartyId: input.counterpartyId ?? null,
      counterpartyName: input.counterpartyName ?? null,
      note: input.note ?? null,
      affectsBusinessResult: input.sourceType === CashVoucherSourceType.MANUAL
        ? (input.affectsBusinessResult ?? category.affectsBusinessResultDefault)
        : category.affectsBusinessResultDefault,
      linkedPurchaseReceipt: input.linkedPurchaseReceiptId ? { connect: { id: input.linkedPurchaseReceiptId } } : undefined,
      sourceInvoiceNumber: input.sourceInvoiceNumber ?? null,
      sourceInvoiceDate: input.sourceInvoiceDate ?? null
    };
    try {
      return await tx.cashVoucher.create({ data });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const replay = await tx.cashVoucher.findUnique({ where: { sourceKey: stableKey } });
      if (replay) return assertSameReplay(tx, replay, input);
      throw ApiError.conflict('Phiếu vừa được tạo bởi một yêu cầu khác.', 'CASHBOOK_SOURCE_REPLAY_MISMATCH');
    }
  }

  static async reverseSourceTransaction(
    tx: Prisma.TransactionClient,
    sourceType: CashVoucherSourceType,
    sourceTransactionId: number,
    actor: CashbookPostingActor,
    reason: string
  ): Promise<CashVoucher> {
    if (!reason.trim()) throw ApiError.badRequest('Cần nêu lý do đảo phiếu.');
    const original = await tx.cashVoucher.findUnique({
      where: { sourceKey: sourceTransactionKey(sourceType, sourceTransactionId) }
    });
    if (!original) throw ApiError.notFound('Không tìm thấy phiếu nguồn cần đảo.', 'CASHBOOK_REVERSAL_NOT_FOUND');
    return this.reverseVoucher(tx, original, actor, reason);
  }

  static async reverseManualVoucher(
    tx: Prisma.TransactionClient, voucherId: number, actor: CashbookPostingActor, reason: string
  ): Promise<CashVoucher> {
    if (actor.role !== 'ADMIN') throw ApiError.forbidden('Chỉ quản trị viên được hủy phiếu thủ công.');
    if (!reason.trim()) throw ApiError.badRequest('Cần nêu lý do hủy phiếu.');
    const original = await tx.cashVoucher.findUnique({ where: { id: voucherId } });
    if (!original || original.sourceType !== CashVoucherSourceType.MANUAL) {
      throw ApiError.notFound('Không tìm thấy phiếu thủ công cần hủy.', 'CASHBOOK_REVERSAL_NOT_FOUND');
    }
    return this.reverseVoucher(tx, original, actor, reason);
  }

  private static async reverseVoucher(
    tx: Prisma.TransactionClient, original: CashVoucher, actor: CashbookPostingActor, reason: string
  ): Promise<CashVoucher> {
    if (!reason.trim()) throw ApiError.badRequest('Cần nêu lý do đảo phiếu.');
    if (original.status === 'CANCELLED') throw ApiError.conflict('Phiếu đã được hủy trước đó.', 'CASHBOOK_REVERSAL_ALREADY_EXISTS');
    if (original.sourceType === CashVoucherSourceType.MANUAL && actor.role !== 'ADMIN') {
      throw ApiError.forbidden('Chỉ quản trị viên được hủy phiếu thủ công.');
    }
    await tx.$queryRaw`SELECT id FROM FinancialAccount WHERE id = ${original.accountId} FOR UPDATE`;
    const alreadyReversed = await tx.cashVoucher.findUnique({ where: { reversalOfId: original.id } });
    if (alreadyReversed) throw ApiError.conflict('Phiếu đã được đảo trước đó.', 'CASHBOOK_REVERSAL_ALREADY_EXISTS');
    const reversalKey = `REVERSAL:${original.id}`;
    const now = new Date();
    await CashbookBalanceService.assertDeltaPreservesRunningBalance(
      tx, original.accountId, now,
      original.direction === CashVoucherDirection.RECEIPT ? -original.amount : original.amount
    );
    const reversal = await tx.cashVoucher.create({
      data: {
        code: voucherCode(original.direction === CashVoucherDirection.RECEIPT ? CashVoucherDirection.PAYMENT : CashVoucherDirection.RECEIPT, now),
        direction: original.direction === CashVoucherDirection.RECEIPT ? CashVoucherDirection.PAYMENT : CashVoucherDirection.RECEIPT,
        amount: original.amount,
        occurredAt: now,
        account: { connect: { id: original.accountId } },
        category: { connect: { code: original.direction === CashVoucherDirection.RECEIPT ? 'REVERSAL_PAYMENT' : 'REVERSAL_RECEIPT' } },
        createdBy: { connect: { id: actor.id } },
        sourceType: CashVoucherSourceType.REVERSAL,
        sourceKey: reversalKey,
        reversalOf: { connect: { id: original.id } },
        paymentMethod: original.paymentMethod,
        handlerName: actor.name ?? null,
        counterpartyType: original.counterpartyType,
        counterpartyId: original.counterpartyId,
        counterpartyName: original.counterpartyName,
        note: reason.trim(),
        affectsBusinessResult: original.affectsBusinessResult,
        cancelledAt: now,
        cancelledBy: { connect: { id: actor.id } },
        cancelReason: reason.trim()
      }
    });
    await tx.cashVoucher.update({
      where: { id: original.id },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledBy: { connect: { id: actor.id } }, cancelReason: reason.trim() }
    });
    return reversal;
  }
}
