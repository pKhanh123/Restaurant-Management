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
import {
  CashVoucher,
  CashVoucherDirection,
  CashVoucherSourceType,
  FinancialAccount,
  PaymentMethod,
  Prisma
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { assertVndAmount, requiredAccountType, signedAmount, voucherSourceKey } from './cashbook.domain';

export type CashbookActor = { id: number | null; name: string };

export type CashbookPostingInput = {
  direction: CashVoucherDirection;
  accountId?: number;
  paymentMethod: PaymentMethod;
  categoryCode: string;
  amount: number;
  occurredAt: Date;
  sourceType: CashVoucherSourceType;
  sourceId?: number;
  sourceCode?: string;
  sourceKey?: string;
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
  affectsBusinessResult: boolean;
  linkedPurchaseReceiptId?: number | null;
  sourceInvoiceNumber?: string | null;
  sourceInvoiceDate?: Date | null;
};

function voucherCode(direction: CashVoucherDirection): string {
  const prefix = direction === CashVoucherDirection.RECEIPT ? 'PT' : 'PC';
  return `${prefix}${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function translatePostingError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
    throw ApiError.conflict('Giao dịch Sổ quỹ bị trùng hoặc xung đột, vui lòng tải lại');
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
async function lockAndResolveAccount(
  tx: Prisma.TransactionClient,
  input: Pick<CashbookPostingInput, 'accountId' | 'paymentMethod'>
): Promise<FinancialAccount> {
  const type = requiredAccountType(input.paymentMethod);
  const rows = input.accountId
    ? await tx.$queryRawUnsafe<FinancialAccount[]>('SELECT * FROM FinancialAccount WHERE id = ? FOR UPDATE', input.accountId)
    : await tx.$queryRawUnsafe<FinancialAccount[]>(
        'SELECT * FROM FinancialAccount WHERE type = ? AND isDefault = true AND isActive = true ORDER BY id LIMIT 1 FOR UPDATE',
        type
      );
  const account = rows[0] ?? null;
  if (!account || !account.isActive) throw ApiError.badRequest('Tài khoản tiền không tồn tại hoặc đã ngừng hoạt động');
  if (account.type !== type) throw ApiError.badRequest('Tài khoản không phù hợp với phương thức thanh toán');
  if (type === 'CASH' && !account.isDefault) throw ApiError.badRequest('Phiếu tiền mặt phải dùng quỹ tiền mặt mặc định');
  return account;
}

export async function accountLedgerBalance(tx: Prisma.TransactionClient, account: FinancialAccount): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ direction: CashVoucherDirection; amount: number }>>(
    'SELECT direction, amount FROM CashVoucher WHERE accountId = ? LOCK IN SHARE MODE',
    account.id
  );
  return rows.reduce((balance, row) => balance + signedAmount(row.direction, row.amount), account.openingBalance);
}

export class CashbookPostingService {
  static async post(
    tx: Prisma.TransactionClient,
    input: CashbookPostingInput,
    actor: CashbookActor
  ): Promise<CashVoucher | null> {
    try {
      assertVndAmount(input.amount);
      const settings = await tx.$queryRawUnsafe<Array<{ activatedAt: Date | null }>>(
        'SELECT activatedAt FROM CashbookSetting WHERE id = 1 LOCK IN SHARE MODE'
      );
      const activatedAt = settings[0]?.activatedAt ?? null;
      if (!activatedAt || input.occurredAt < activatedAt) return null;

      const account = await lockAndResolveAccount(tx, input);
      const categories = await tx.$queryRawUnsafe<Array<{ id: number; direction: CashVoucherDirection; isActive: boolean }>>(
        'SELECT id, direction, isActive FROM CashFlowCategory WHERE code = ? LOCK IN SHARE MODE',
        input.categoryCode
      );
      const category = categories[0] ?? null;
      if (!category || !category.isActive) throw ApiError.badRequest('Loại thu/chi không tồn tại hoặc đã ngừng hoạt động');
      if (category.direction !== input.direction) throw ApiError.badRequest('Loại thu/chi không cùng chiều với phiếu');

      const sourceKey = input.sourceKey ?? (
        input.sourceId === undefined
          ? `${input.sourceType}:${randomUUID()}`
          : voucherSourceKey(input.sourceType, input.sourceId)
      );
      if (await tx.cashVoucher.findUnique({ where: { sourceKey }, select: { id: true } })) {
        throw ApiError.conflict('Nghiệp vụ nguồn đã được ghi Sổ quỹ');
      }
      const balance = await accountLedgerBalance(tx, account);
      if (input.direction === CashVoucherDirection.PAYMENT && balance < input.amount) {
        throw ApiError.conflict('Số dư tài khoản không đủ để lập phiếu chi');
      }

      const voucher = await tx.cashVoucher.create({
        data: {
          code: voucherCode(input.direction),
          direction: input.direction,
          occurredAt: input.occurredAt,
          amount: input.amount,
          accountId: account.id,
          categoryId: category.id,
          paymentMethod: input.paymentMethod,
          handlerUserId: actor.id,
          handlerName: actor.name,
          counterpartyType: input.counterpartyType ?? null,
          counterpartyId: input.counterpartyId ?? null,
          counterpartyName: input.counterpartyName ?? null,
          note: input.note ?? null,
          affectsBusinessResult: input.affectsBusinessResult,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          sourceCode: input.sourceCode ?? null,
          sourceKey,
          linkedPurchaseReceiptId: input.linkedPurchaseReceiptId ?? null,
          sourceInvoiceNumber: input.sourceInvoiceNumber ?? null,
          sourceInvoiceDate: input.sourceInvoiceDate ?? null,
          createdByUserId: actor.id
        }
      });
      await AuditService.logInTransaction(tx, {
        action: 'CASH_VOUCHER_POSTED', targetType: 'CashVoucher', targetId: voucher.id,
        actorId: actor.id, actorName: actor.name,
        metadata: { code: voucher.code, direction: voucher.direction, amount: voucher.amount, sourceType: voucher.sourceType }
      });
      return voucher;
    } catch (error) {
      translatePostingError(error);
    }
  }

  static async reverseSystemVoucher(
    tx: Prisma.TransactionClient,
    sourceType: CashVoucherSourceType,
    sourceId: number,
    actor: CashbookActor
  ): Promise<CashVoucher | null> {
    const sourceKey = voucherSourceKey(sourceType, sourceId);
    await tx.$queryRawUnsafe('SELECT id FROM CashVoucher WHERE sourceKey = ? FOR UPDATE', sourceKey);
    const original = await tx.cashVoucher.findUnique({ where: { sourceKey } });
    if (!original) return null;
    if (original.status !== 'POSTED' || await tx.cashVoucher.findUnique({ where: { reversalOfId: original.id } })) {
      throw ApiError.conflict('Phiếu nguồn đã được đảo trước đó');
    }
    const reversal = await this.reverseLocked(tx, original, actor, 'Chứng từ nguồn bị hủy');
    await tx.cashVoucher.update({
      where: { id: original.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: 'Chứng từ nguồn bị hủy' }
    });
    await AuditService.logInTransaction(tx, {
      action: 'CASH_VOUCHER_SOURCE_REVERSED', targetType: 'CashVoucher', targetId: original.id,
      actorId: actor.id, actorName: actor.name, metadata: { sourceType, sourceId, reversalId: reversal.id }
    });
    return reversal;
  }

  static async reverseLocked(
    tx: Prisma.TransactionClient,
    original: CashVoucher,
    actor: CashbookActor,
    reason: string
  ): Promise<CashVoucher> {
    await tx.$queryRawUnsafe('SELECT id FROM FinancialAccount WHERE id = ? FOR UPDATE', original.accountId);
    const account = await tx.financialAccount.findUniqueOrThrow({ where: { id: original.accountId } });
    const direction = original.direction === CashVoucherDirection.RECEIPT
      ? CashVoucherDirection.PAYMENT
      : CashVoucherDirection.RECEIPT;
    if (direction === CashVoucherDirection.PAYMENT && await accountLedgerBalance(tx, account) < original.amount) {
      throw ApiError.conflict('Không đủ số dư để đảo phiếu thu này');
    }
    return tx.cashVoucher.create({
      data: {
        code: voucherCode(direction),
        direction,
        occurredAt: new Date(),
        amount: original.amount,
        accountId: original.accountId,
        categoryId: original.categoryId,
        paymentMethod: original.paymentMethod,
        handlerUserId: actor.id,
        handlerName: actor.name,
        counterpartyType: original.counterpartyType,
        counterpartyId: original.counterpartyId,
        counterpartyName: original.counterpartyName,
        note: reason,
        affectsBusinessResult: original.affectsBusinessResult,
        sourceType: CashVoucherSourceType.REVERSAL,
        sourceId: original.id,
        sourceCode: original.code,
        sourceKey: voucherSourceKey(CashVoucherSourceType.REVERSAL, original.id),
        reversalOfId: original.id,
        createdByUserId: actor.id
      }
    });
  }
}

export function translateCashbookTransactionError(error: unknown): never {
  translatePostingError(error);
}
