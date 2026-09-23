import { randomUUID } from 'crypto';
import { FinancialAccount, FinancialAccountType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import {
  ActivateCashbookInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  FinancialAccountInput,
  FinancialAccountUpdate,
  PartyInput,
  financialAccountSchema
} from './cashbook.schemas';

type Actor = { id: number; name: string };
const AUTOMATIC_CATEGORY_CODES = new Set(['CUSTOMER_PAYMENT', 'SUPPLIER_REFUND', 'SUPPLIER_PAYMENT', 'CUSTOMER_REFUND']);

function maskIdentifier(value: string | null): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

function accountDto(account: FinancialAccount) {
  return {
    ...account,
    accountNumber: maskIdentifier(account.accountNumber),
    walletIdentifier: maskIdentifier(account.walletIdentifier)
  };
}

function normalizeAccountInput(input: FinancialAccountInput) {
  return {
    ...input,
    code: (input.code ?? `${input.type}-${randomUUID().slice(0, 8)}`).toUpperCase(),
    bankName: input.type === 'BANK' ? input.bankName : null,
    accountNumber: input.type === 'BANK' ? input.accountNumber : null,
    walletProvider: input.type === 'E_WALLET' ? input.walletProvider : null,
    walletIdentifier: input.type === 'E_WALLET' ? input.walletIdentifier : null
  };
}

async function lockAccountType(tx: Prisma.TransactionClient, type: FinancialAccountType) {
  await tx.$queryRawUnsafe('SELECT id FROM FinancialAccount WHERE type = ? FOR UPDATE', type);
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw ApiError.conflict('Mã đã tồn tại');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw ApiError.notFound('Dữ liệu không tồn tại');
  }
  throw error;
}

export class CashbookSettingsService {
  static async getSettings() {
    const [setting, accounts, categories] = await Promise.all([
      prisma.cashbookSetting.findUnique({ where: { id: 1 } }),
      this.listAccounts(),
      this.listCategories()
    ]);
    return { activatedAt: setting?.activatedAt ?? null, activatedByUserId: setting?.activatedByUserId ?? null, accounts, categories };
  }

  static async activate(input: ActivateCashbookInput, actor: Actor) {
    return prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE');
      const setting = await tx.cashbookSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      if (setting.activatedAt) throw ApiError.conflict('Sổ quỹ đã được kích hoạt');

      const cashDefault = await tx.financialAccount.findFirst({ where: { type: 'CASH', isDefault: true, isActive: true } });
      if (!cashDefault) throw ApiError.badRequest('Cần có một tài khoản tiền mặt mặc định đang hoạt động');
      const ids = input.accounts.map(item => item.id);
      if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Tài khoản số dư đầu kỳ bị trùng');
      const accounts = await tx.financialAccount.findMany({ where: { id: { in: ids }, isActive: true } });
      if (accounts.length !== ids.length) throw ApiError.badRequest('Có tài khoản không tồn tại hoặc đã ngừng hoạt động');
      if (await tx.cashVoucher.count()) throw ApiError.conflict('Không thể kích hoạt sau khi đã phát sinh phiếu');

      for (const item of input.accounts) {
        await tx.financialAccount.update({
          where: { id: item.id },
          data: { openingBalance: item.openingBalance, openingAt: input.activatedAt }
        });
      }
      const updated = await tx.cashbookSetting.update({
        where: { id: 1 }, data: { activatedAt: input.activatedAt, activatedByUserId: actor.id }
      });
      await AuditService.logInTransaction(tx, {
        action: 'CASHBOOK_ACTIVATED', targetType: 'CashbookSetting', targetId: 1,
        actorId: actor.id, actorName: actor.name,
        metadata: { activatedAt: input.activatedAt.toISOString(), accountIds: ids }
      });
      return updated;
    });
  }

  static async listAccounts() {
    const accounts = await prisma.financialAccount.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return accounts.map(accountDto);
  }

  static async saveAccount(id: number | null, input: FinancialAccountInput | FinancialAccountUpdate, actor: Actor) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = id === null ? null : await tx.financialAccount.findUnique({ where: { id } });
        if (id !== null && !existing) throw ApiError.notFound('Tài khoản không tồn tại');
        const parsed = existing
          ? financialAccountSchema.parse({
              code: existing.code,
              name: existing.name,
              type: existing.type,
              openingBalance: existing.openingBalance,
              bankName: existing.bankName,
              accountNumber: existing.accountNumber,
              walletProvider: existing.walletProvider,
              walletIdentifier: existing.walletIdentifier,
              isDefault: existing.isDefault,
              isActive: existing.isActive,
              ...input
            })
          : financialAccountSchema.parse(input);
        const data = normalizeAccountInput(parsed);
        await lockAccountType(tx, data.type);

        if (existing && data.openingBalance !== existing.openingBalance) {
          const hasVoucher = await tx.cashVoucher.findFirst({ where: { accountId: existing.id, status: 'POSTED' }, select: { id: true } });
          if (hasVoucher) throw ApiError.conflict('Số dư đầu kỳ đã khóa vì tài khoản đã phát sinh phiếu');
        }
        if (data.isDefault && data.isActive) {
          await tx.financialAccount.updateMany({
            where: { type: data.type, isDefault: true, ...(id === null ? {} : { id: { not: id } }) },
            data: { isDefault: false }
          });
        }
        if ((!data.isActive || !data.isDefault) && existing?.isDefault && existing.isActive) {
          const replacement = await tx.financialAccount.findFirst({
            where: { type: data.type, isActive: true, id: { not: existing.id } }, orderBy: { id: 'asc' }
          });
          if (replacement) await tx.financialAccount.update({ where: { id: replacement.id }, data: { isDefault: true } });
          else if (data.type === 'CASH') throw ApiError.badRequest('Phải duy trì một tài khoản tiền mặt mặc định đang hoạt động');
        }
        const saved = existing
          ? await tx.financialAccount.update({ where: { id: existing.id }, data })
          : await tx.financialAccount.create({ data });
        await AuditService.logInTransaction(tx, {
          action: existing ? 'FINANCIAL_ACCOUNT_UPDATED' : 'FINANCIAL_ACCOUNT_CREATED',
          targetType: 'FinancialAccount', targetId: saved.id, actorId: actor.id, actorName: actor.name,
          metadata: { code: saved.code, type: saved.type, isDefault: saved.isDefault, isActive: saved.isActive }
        });
        return accountDto(saved);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  static listCategories() {
    return prisma.cashFlowCategory.findMany({ orderBy: [{ direction: 'asc' }, { name: 'asc' }] });
  }

  static async saveCategory(id: number | null, input: CategoryCreateInput | CategoryUpdateInput, actor: Actor) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = id === null ? null : await tx.cashFlowCategory.findUnique({ where: { id } });
        if (id !== null && !existing) throw ApiError.notFound('Loại thu/chi không tồn tại');
        if (existing?.isSystem && AUTOMATIC_CATEGORY_CODES.has(existing.code) && input.isActive === false) {
          throw ApiError.badRequest('Không thể ngừng hoạt động loại thu/chi dùng cho đồng bộ tự động');
        }
        const data = existing ? input : {
          ...(input as CategoryCreateInput),
          code: ((input as CategoryCreateInput).code ?? `CUSTOM-${randomUUID().slice(0, 8)}`).toUpperCase(),
          isSystem: false
        };
        const saved = existing
          ? await tx.cashFlowCategory.update({ where: { id: existing.id }, data })
          : await tx.cashFlowCategory.create({ data: data as Prisma.CashFlowCategoryCreateInput });
        await AuditService.logInTransaction(tx, {
          action: existing ? 'CASH_FLOW_CATEGORY_UPDATED' : 'CASH_FLOW_CATEGORY_CREATED',
          targetType: 'CashFlowCategory', targetId: saved.id, actorId: actor.id, actorName: actor.name,
          metadata: { code: saved.code, direction: saved.direction, isActive: saved.isActive }
        });
        return saved;
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  static async listParties(query: string) {
    const rows = await prisma.financialParty.findMany({
      where: { isActive: true, ...(query ? { OR: [{ name: { contains: query } }, { phone: { contains: query } }] } : {}) },
      take: 50, orderBy: { name: 'asc' }
    });
    return rows.map(row => ({ ...row, type: 'OTHER' as const, sourceId: row.id }));
  }

  static async createParty(input: PartyInput, actor: Actor) {
    const party = await prisma.financialParty.create({ data: input });
    await AuditService.log({
      action: 'FINANCIAL_PARTY_CREATED', targetType: 'FinancialParty', targetId: party.id,
      actorId: actor.id, actorName: actor.name, metadata: { name: party.name }
    });
    return { ...party, type: 'OTHER' as const, sourceId: party.id };
  }

  static async searchCounterparties(query: string) {
    const contains = query ? { contains: query } : undefined;
    const [suppliers, users, parties] = await Promise.all([
      prisma.supplier.findMany({
        where: { isActive: true, ...(query ? { OR: [{ code: contains }, { name: contains }, { phone: contains }] } : {}) },
        take: 25, orderBy: { name: 'asc' }
      }),
      prisma.user.findMany({
        where: query ? { OR: [{ username: contains }, { name: contains }] } : undefined,
        take: 25, orderBy: { name: 'asc' }
      }),
      this.listParties(query)
    ]);
    return [
      ...suppliers.map(item => ({ type: 'SUPPLIER' as const, sourceId: item.id, code: item.code, name: item.name, phone: item.phone })),
      ...users.map(item => ({ type: 'USER' as const, sourceId: item.id, code: item.username, name: item.name, phone: null })),
      ...parties.map(item => ({ type: item.type, sourceId: item.id, code: null, name: item.name, phone: item.phone }))
    ];
  }

  static async listPurchaseInvoices(query: string) {
    const contains = query ? { contains: query } : undefined;
    const receipts = await prisma.purchaseReceipt.findMany({
      where: {
        status: 'POSTED',
        ...(query ? { OR: [{ receiptCode: contains }, { invoiceNumber: contains }, { supplier: { name: contains } }] } : {})
      },
      include: { supplier: { select: { id: true, name: true } } },
      take: 50,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }]
    });
    return receipts.map(item => ({
      id: item.id,
      receiptCode: item.receiptCode,
      invoiceNumber: item.invoiceNumber,
      invoiceDate: item.invoiceDate,
      supplierId: item.supplier?.id ?? null,
      supplierName: item.supplier?.name ?? null,
      payableAmount: Math.max(0, item.subtotalAmount - item.discountAmount - item.paidAmount)
    }));
  }
}
