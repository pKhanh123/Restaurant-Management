import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitToAll } from '../../lib/socket';
import { CashbookBalanceService } from './cashbook-balance.service';
import { cashbookChangedEvent } from './cashbook.events';
import { CashbookPostingService, normalizeCashbookPersistenceError, type CashbookPostingActor } from './cashbook-posting.service';
import type { CashbookListQuery, CancelVoucherInput, ManualVoucherInput } from './cashbook.schemas';

function voucherWhere(query: CashbookListQuery, accountIds?: number[]): Prisma.CashVoucherWhereInput {
  return {
    ...(query.search ? { OR: [
      { code: { contains: query.search } }, { note: { contains: query.search } },
      { counterpartyName: { contains: query.search } }, { sourceCode: { contains: query.search } },
      { sourceInvoiceNumber: { contains: query.search } }
    ] } : {}),
    ...(accountIds ? { accountId: { in: accountIds } } : query.accountIds ? { accountId: { in: query.accountIds } } : {}),
    ...(query.accountTypes?.length ? { account: { type: { in: query.accountTypes } } } : {}),
    ...(query.from || query.to ? { occurredAt: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {})
    } } : {}),
    ...(query.directions?.length ? { direction: { in: query.directions } } : {}),
    ...(query.categoryIds?.length ? { categoryId: { in: query.categoryIds } } : {}),
    ...(query.statuses?.length ? { status: { in: query.statuses } } : {}),
    ...(query.affectsBusinessResult !== undefined ? { affectsBusinessResult: query.affectsBusinessResult } : {}),
    ...(query.createdByUserIds?.length ? { createdByUserId: { in: query.createdByUserIds } } : {})
  };
}

export class CashbookService {
  static async list(query: CashbookListQuery) {
    const page = query.page;
    const pageSize = query.pageSize;
    const accountWhere: Prisma.FinancialAccountWhereInput = {
      ...(query.accountIds?.length ? { id: { in: query.accountIds } } : {}),
      ...(query.accountTypes?.length ? { type: { in: query.accountTypes } } : {})
    };
    const accounts = await prisma.financialAccount.findMany({ where: accountWhere, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const accountIds = accounts.map(account => account.id);
    const where = voucherWhere(query, accountIds);
    const [rows, rowCount, grouped] = await Promise.all([
      prisma.cashVoucher.findMany({
        where,
        include: {
          account: { select: { id: true, code: true, name: true, type: true } }, category: true,
          createdBy: { select: { id: true, name: true, username: true } },
          handler: { select: { id: true, name: true, username: true } },
          cancelledBy: { select: { id: true, name: true, username: true } },
          reversalOf: { select: { id: true, code: true, direction: true, amount: true } },
          reversal: { select: { id: true, code: true, occurredAt: true, amount: true } }
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.cashVoucher.count({ where }),
      prisma.cashVoucher.groupBy({ by: ['direction'], where, _sum: { amount: true }, _count: { _all: true } })
    ]);
    const receipts = grouped.find(value => value.direction === 'RECEIPT');
    const payments = grouped.find(value => value.direction === 'PAYMENT');
    const end = query.to ? new Date(query.to) : new Date();
    const openingAt = query.from ? new Date(new Date(query.from).getTime() - 1) : null;
    const [openingBalances, closingBalances] = await Promise.all([
      Promise.all(accounts.map(account => openingAt
        ? CashbookBalanceService.balanceAt(prisma as unknown as Prisma.TransactionClient, account.id, openingAt)
        : Promise.resolve(account.openingAt <= end ? account.openingBalance : 0))),
      Promise.all(accounts.map(account => CashbookBalanceService.balanceAt(prisma as unknown as Prisma.TransactionClient, account.id, end)))
    ]);
    const openingBalance = openingBalances.reduce((sum, amount) => sum + amount, 0);
    const closingBalance = closingBalances.reduce((sum, amount) => sum + amount, 0);
    return {
      items: rows,
      page,
      pageSize,
      balanceSummary: { openingBalance, closingBalance, accountCount: accounts.length, from: query.from ?? null, to: query.to ?? end.toISOString() },
      filteredSummary: {
        rowCount,
        totalReceipts: receipts?._sum.amount ?? 0,
        totalPayments: payments?._sum.amount ?? 0,
        netMovement: (receipts?._sum.amount ?? 0) - (payments?._sum.amount ?? 0)
      }
    };
  }

  static async getVoucher(id: number) {
    const voucher = await prisma.cashVoucher.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } }, category: true,
        createdBy: { select: { id: true, name: true, username: true } },
        handler: { select: { id: true, name: true, username: true } },
        cancelledBy: { select: { id: true, name: true, username: true } },
        reversalOf: true, reversal: true
      }
    });
    if (!voucher) throw ApiError.notFound('Không tìm thấy phiếu Sổ quỹ.');
    return voucher;
  }

  static async createManual(input: ManualVoucherInput, actor: CashbookPostingActor) {
    const isReplay = await prisma.cashVoucher.findUnique({
      where: { sourceKey: `MANUAL:${actor.id}:${input.clientRequestId}` }, select: { id: true }
    });
    const voucher = await prisma.$transaction(async tx => {
      const result = await CashbookPostingService.post(tx, {
        ...input,
        occurredAt: actor.role === 'CASHIER' || !input.occurredAt ? new Date() : new Date(input.occurredAt),
        occurrenceTimeWasRequested: actor.role === 'ADMIN' && Boolean(input.occurredAt),
        sourceInvoiceDate: input.sourceInvoiceDate ? new Date(input.sourceInvoiceDate) : null,
        sourceType: 'MANUAL',
        paymentMethod: input.paymentMethod ?? null
      }, actor);
      if (!result) throw ApiError.conflict('Sổ quỹ chưa được kích hoạt.', 'CASHBOOK_SETTING_INACTIVE');
      if (!isReplay) await AuditService.logInTransaction(tx, {
        action: 'CASHBOOK_VOUCHER_CREATED', targetType: 'CashVoucher', targetId: result.id,
        actorId: actor.id, actorName: actor.name ?? null, metadata: { direction: result.direction, amount: result.amount, accountId: result.accountId, reason: input.reason ?? null }
      });
      return result;
    }).catch(normalizeCashbookPersistenceError);
    emitToAll('cashbook:changed', cashbookChangedEvent(voucher, new Date()));
    return voucher;
  }

  static async cancelManual(id: number, input: CancelVoucherInput, actor: CashbookPostingActor) {
    if (actor.role !== 'ADMIN') throw ApiError.forbidden('Chỉ quản trị viên được hủy phiếu.');
    const reversal = await prisma.$transaction(async tx => {
      const original = await tx.cashVoucher.findUnique({ where: { id } });
      if (!original) throw ApiError.notFound('Không tìm thấy phiếu Sổ quỹ.');
      if (original.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
        throw ApiError.conflict('Phiếu đã được thay đổi. Vui lòng tải lại trước khi hủy.', 'CONFLICT');
      }
      if (original.sourceType !== 'MANUAL') throw ApiError.conflict('Phiếu tự động chỉ được đảo theo nghiệp vụ nguồn.');
      const result = await CashbookPostingService.reverseManualVoucher(tx, id, actor, input.reason);
      await AuditService.logInTransaction(tx, {
        action: 'CASHBOOK_VOUCHER_CANCELLED', targetType: 'CashVoucher', targetId: id,
        actorId: actor.id, actorName: actor.name ?? null,
        metadata: { reversalId: result.id, reason: input.reason }
      });
      return result;
    }).catch(normalizeCashbookPersistenceError);
    emitToAll('cashbook:changed', cashbookChangedEvent(reversal, new Date()));
    return reversal;
  }

  static async export(query: CashbookListQuery, format: 'csv' | 'xlsx') {
    const accountWhere: Prisma.FinancialAccountWhereInput = {
      ...(query.accountIds?.length ? { id: { in: query.accountIds } } : {}),
      ...(query.accountTypes?.length ? { type: { in: query.accountTypes } } : {})
    };
    const accounts = await prisma.financialAccount.findMany({ where: accountWhere, select: { id: true } });
    const rows = await prisma.cashVoucher.findMany({
      where: voucherWhere(query, accounts.map(account => account.id)),
      include: { account: { select: { id: true, code: true, name: true, type: true } }, category: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }]
    });
    const { utils, write } = await import('xlsx');
    const sheet = utils.json_to_sheet(rows.map(row => ({
      Mã: row.code, Ngày: row.occurredAt, Loại: row.direction === 'RECEIPT' ? 'Thu' : 'Chi',
      Tài_khoản: row.account.name, Danh_mục: row.category.name, Số_tiền: row.amount,
      Trạng_thái: row.status, Đối_tượng: row.counterpartyName, Nội_dung: row.note,
      Loại_nguồn: row.sourceType, Mã_chứng_từ_nguồn: row.sourceCode, Mã_giao_dịch_nguồn: row.sourceTransactionId,
      Số_hóa_đơn: row.sourceInvoiceNumber, Ngày_hóa_đơn: row.sourceInvoiceDate?.toISOString() ?? null,
      Mã_phiếu_gốc: row.reversalOfId
    })));
    if (format === 'csv') return { contentType: 'text/csv; charset=utf-8', filename: 'so-quy.csv', body: `\uFEFF${utils.sheet_to_csv(sheet)}` };
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, 'So quy');
    return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'so-quy.xlsx', body: write(book, { type: 'buffer', bookType: 'xlsx' }) };
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
