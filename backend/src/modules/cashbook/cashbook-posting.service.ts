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

export type CashbookActor = { id: number; name: string };

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

async function lockAndResolveAccount(
  tx: Prisma.TransactionClient,
  input: Pick<CashbookPostingInput, 'accountId' | 'paymentMethod'>
): Promise<FinancialAccount> {
  const type = requiredAccountType(input.paymentMethod);
  if (input.accountId) {
    await tx.$queryRawUnsafe('SELECT id FROM FinancialAccount WHERE id = ? FOR UPDATE', input.accountId);
  } else {
    await tx.$queryRawUnsafe('SELECT id FROM FinancialAccount WHERE type = ? FOR UPDATE', type);
  }
  const account = input.accountId
    ? await tx.financialAccount.findUnique({ where: { id: input.accountId } })
    : await tx.financialAccount.findFirst({ where: { type, isDefault: true, isActive: true }, orderBy: { id: 'asc' } });
  if (!account || !account.isActive) throw ApiError.badRequest('Tài khoản tiền không tồn tại hoặc đã ngừng hoạt động');
  if (account.type !== type) throw ApiError.badRequest('Tài khoản không phù hợp với phương thức thanh toán');
  if (type === 'CASH' && !account.isDefault) throw ApiError.badRequest('Phiếu tiền mặt phải dùng quỹ tiền mặt mặc định');
  return account;
}

export async function accountLedgerBalance(tx: Prisma.TransactionClient, account: FinancialAccount): Promise<number> {
  const rows = await tx.cashVoucher.findMany({ where: { accountId: account.id }, select: { direction: true, amount: true } });
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
      const category = await tx.cashFlowCategory.findUnique({ where: { code: input.categoryCode } });
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
    const original = await tx.cashVoucher.findUnique({ where: { sourceKey: voucherSourceKey(sourceType, sourceId) } });
    if (!original) return null;
    return this.reverseLocked(tx, original, actor, 'Chứng từ nguồn bị hủy');
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
