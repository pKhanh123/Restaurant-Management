import { CashVoucherDirection, CashVoucherSourceType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { signedAmount } from './cashbook.domain';
import { emitCashbookChanged } from './cashbook.events';
import { CashbookExportRow } from './cashbook.export';
import {
  CashbookActor,
  CashbookPostingService,
  translateCashbookTransactionError
} from './cashbook-posting.service';
import { VoucherCreateInput, VoucherListQuery } from './cashbook.schemas';

function rangeWhere(query: VoucherListQuery): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;
  return { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
}

function accountWhere(query: VoucherListQuery): Prisma.CashVoucherWhereInput {
  return {
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.accountType ? { account: { type: query.accountType } } : {})
  };
}

function itemWhere(query: VoucherListQuery): Prisma.CashVoucherWhereInput {
  return {
    ...accountWhere(query),
    sourceType: { not: CashVoucherSourceType.REVERSAL },
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.affectsBusinessResult === undefined ? {} : { affectsBusinessResult: query.affectsBusinessResult }),
    ...(rangeWhere(query) ? { occurredAt: rangeWhere(query) } : {}),
    ...(query.q ? {
      OR: [
        { code: { contains: query.q } },
        { sourceCode: { contains: query.q } },
        { counterpartyName: { contains: query.q } },
        { note: { contains: query.q } }
      ]
    } : {})
  };
}

async function summary(query: VoucherListQuery) {
  const accountFilter: Prisma.FinancialAccountWhereInput = {
    ...(query.accountId ? { id: query.accountId } : {}),
    ...(query.accountType ? { type: query.accountType } : {})
  };
  const accounts = await prisma.financialAccount.findMany({ where: accountFilter, select: { id: true, openingBalance: true } });
  const accountIds = accounts.map(item => item.id);
  const initial = accounts.reduce((total, item) => total + item.openingBalance, 0);
  const common = accountIds.length ? { accountId: { in: accountIds } } : { accountId: -1 };
  const before = query.from
    ? await prisma.cashVoucher.findMany({ where: { ...common, occurredAt: { lt: query.from } }, select: { direction: true, amount: true } })
    : [];
  const openingBalance = before.reduce((total, item) => total + signedAmount(item.direction, item.amount), initial);
  const rows = await prisma.cashVoucher.findMany({
    where: { ...common, ...(rangeWhere(query) ? { occurredAt: rangeWhere(query) } : {}) },
    select: { direction: true, amount: true }
  });
  const totalReceipt = rows.filter(item => item.direction === 'RECEIPT').reduce((sum, item) => sum + item.amount, 0);
  const totalPayment = rows.filter(item => item.direction === 'PAYMENT').reduce((sum, item) => sum + item.amount, 0);
  return { openingBalance, totalReceipt, totalPayment, closingBalance: openingBalance + totalReceipt - totalPayment };
}

export class CashbookService {
  static async createManual(input: VoucherCreateInput, actor: CashbookActor) {
    try {
      const voucher = await prisma.$transaction(async tx => {
        const category = await tx.cashFlowCategory.findUnique({ where: { id: input.categoryId } });
        if (!category) throw ApiError.badRequest('Loại thu/chi không tồn tại');
        const receipt = input.linkedPurchaseReceiptId
          ? await tx.purchaseReceipt.findUnique({ where: { id: input.linkedPurchaseReceiptId } })
          : null;
        if (input.linkedPurchaseReceiptId && receipt?.status !== 'POSTED') {
          throw ApiError.badRequest('Hóa đơn đầu vào không tồn tại hoặc chưa ghi nhận');
        }
        const posted = await CashbookPostingService.post(tx, {
          direction: input.direction,
          paymentMethod: input.paymentMethod,
          accountId: input.accountId,
          categoryCode: category.code,
          amount: input.amount,
          occurredAt: input.occurredAt,
          sourceType: CashVoucherSourceType.MANUAL,
          sourceKey: `MANUAL:${randomUUID()}`,
          counterpartyType: input.counterpartyType,
          counterpartyId: input.counterpartyId,
          counterpartyName: input.counterpartyName,
          note: input.note,
          affectsBusinessResult: input.affectsBusinessResult,
          linkedPurchaseReceiptId: receipt?.id,
          sourceInvoiceNumber: receipt?.invoiceNumber,
          sourceInvoiceDate: receipt?.invoiceDate
        }, actor);
        if (!posted) throw ApiError.conflict('Sổ quỹ chưa kích hoạt hoặc thời gian phiếu trước ngày bắt đầu');
        return posted;
      });
      emitCashbookChanged({ voucherIds: [voucher.id], reason: 'VOUCHER_POSTED', updatedAt: new Date().toISOString() });
      return voucher;
    } catch (error) {
      translateCashbookTransactionError(error);
    }
  }

  static async cancel(id: number, reason: string, actor: CashbookActor) {
    try {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM CashVoucher WHERE id = ? FOR UPDATE', id);
        const original = await tx.cashVoucher.findUnique({ where: { id } });
        if (!original) throw ApiError.notFound('Phiếu thu/chi không tồn tại');
        if (original.sourceType !== CashVoucherSourceType.MANUAL) throw ApiError.badRequest('Phiếu tự động chỉ được đảo từ chứng từ nguồn');
        if (original.status !== 'POSTED') throw ApiError.conflict('Phiếu đã được hủy');
        if (await tx.cashVoucher.findUnique({ where: { reversalOfId: id } })) throw ApiError.conflict('Phiếu đã có bút toán đảo');
        const reversal = await CashbookPostingService.reverseLocked(tx, original, actor, reason);
        const cancelled = await tx.cashVoucher.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: reason }
        });
        await AuditService.logInTransaction(tx, {
          action: 'CASH_VOUCHER_CANCELLED', targetType: 'CashVoucher', targetId: id,
          actorId: actor.id, actorName: actor.name,
          metadata: { reason, reversalId: reversal.id }
        });
        return { cancelled, reversal };
      });
      emitCashbookChanged({ voucherIds: [result.cancelled.id, result.reversal.id], reason: 'VOUCHER_CANCELLED', updatedAt: new Date().toISOString() });
      return result;
    } catch (error) {
      translateCashbookTransactionError(error);
    }
  }

  static async list(query: VoucherListQuery) {
    const where = itemWhere(query);
    const [items, total, totals] = await Promise.all([
      prisma.cashVoucher.findMany({
        where,
        include: { account: true, category: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      prisma.cashVoucher.count({ where }),
      summary(query)
    ]);
    return { items, summary: totals, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  static async detail(id: number) {
    const voucher = await prisma.cashVoucher.findUnique({
      where: { id },
      include: { account: true, category: true, reversal: true, reversalOf: true, linkedPurchaseReceipt: true }
    });
    if (!voucher) throw ApiError.notFound('Phiếu thu/chi không tồn tại');
    return voucher;
  }

  static async exportRows(query: VoucherListQuery): Promise<CashbookExportRow[]> {
    const rows = await prisma.cashVoucher.findMany({
      where: itemWhere(query),
      include: { account: true, category: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]
    });
    return rows.map(item => ({
      code: item.code,
      occurredAt: item.occurredAt,
      categoryName: item.category.name,
      accountName: item.account.name,
      counterpartyName: item.counterpartyName,
      signedValue: signedAmount(item.direction, item.amount),
      note: item.note,
      status: item.status
    }));
  }
}
