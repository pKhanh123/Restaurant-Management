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
  }
}
