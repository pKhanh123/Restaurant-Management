import { Prisma, type FinancialAccountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitToAll } from '../../lib/socket';
import { normalizeCashbookPersistenceError } from './cashbook-posting.service';
import type {
  CashbookAccountCreateInput, CashbookAccountUpdateInput, CashbookActivationInput,
  CashbookCategoryCreateInput, CashbookCategoryUpdateInput, CashbookPartyInput
} from './cashbook.schemas';

interface SettingsActor { id: number; name: string }

function changed(accountIds: number[], reason: string) {
  emitToAll('cashbook:changed', { accountIds, voucherId: null, reason, updatedAt: new Date().toISOString() });
}

export class CashbookSettingsService {
  static async workspace(canViewSensitiveAccountDetails = false) {
    const [setting, accounts, categories] = await Promise.all([
      prisma.cashbookSetting.findUnique({ where: { id: 1 } }),
      prisma.financialAccount.findMany({ orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }] }),
      prisma.cashFlowCategory.findMany({ orderBy: [{ direction: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }] })
    ]);
    return {
      activatedAt: setting?.activatedAt ?? null,
      activatedByUserId: setting?.activatedByUserId ?? null,
      accounts: accounts.map(account => canViewSensitiveAccountDetails ? account : {
        ...account,
        accountNumber: account.accountNumber ? `••••${account.accountNumber.slice(-4)}` : null,
        walletIdentifier: account.walletIdentifier ? `••••${account.walletIdentifier.slice(-4)}` : null
      }),
      categories
    };
  }

  static async createAccount(input: CashbookAccountCreateInput, actor: SettingsActor) {
    const account = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
      const setting = await tx.cashbookSetting.findUnique({ where: { id: 1 } });
      let saved = await tx.financialAccount.create({ data: {
        ...input, isDefault: false, openingBalance: 0,
        openingAt: setting?.activatedAt ? new Date() : undefined
      } });
      if (input.isDefault) saved = await this.setDefaultInTransaction(tx, saved.id, saved.type);
      await AuditService.logInTransaction(tx, {
        action: 'CASHBOOK_ACCOUNT_CREATED', targetType: 'FinancialAccount', targetId: saved.id,
        actorId: actor.id, actorName: actor.name, metadata: { code: saved.code, type: saved.type }
      });
      return saved;
    }).catch(normalizeCashbookPersistenceError);
    changed([account.id], 'account-created');
    return account;
  }

  private static async setDefaultInTransaction(tx: Prisma.TransactionClient, accountId: number, type: FinancialAccountType) {
    await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
    await tx.financialAccount.updateMany({ where: { type, isDefault: true }, data: { isDefault: false } });
    return tx.financialAccount.update({ where: { id: accountId }, data: { isDefault: true, isActive: true } });
  }

  static async updateAccount(id: number, input: CashbookAccountUpdateInput, actor: SettingsActor) {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.financialAccount.findUnique({ where: { id } });
      if (!current) throw ApiError.notFound('Không tìm thấy tài khoản quỹ.');
      if (input.isActive === false && current.isDefault) {
        throw ApiError.conflict('Không thể ngừng tài khoản mặc định; hãy chuyển mặc định trước.');
      }
      if (input.isDefault === false && current.isDefault) {
        throw ApiError.conflict('Hãy chọn tài khoản mặc định thay thế trước khi bỏ mặc định hiện tại.');
      }
      const updated = input.isDefault
        ? await this.setDefaultInTransaction(tx, id, current.type)
        : await tx.financialAccount.update({ where: { id }, data: input });
      await AuditService.logInTransaction(tx, {
        action: input.isActive === false ? 'CASHBOOK_ACCOUNT_DEACTIVATED' : input.isDefault ? 'CASHBOOK_ACCOUNT_DEFAULT_CHANGED' : 'CASHBOOK_ACCOUNT_UPDATED',
        targetType: 'FinancialAccount', targetId: id, actorId: actor.id, actorName: actor.name,
        metadata: { before: current, after: updated }
      });
      return updated;
    }).catch(normalizeCashbookPersistenceError);
    changed([id], 'account-updated');
    return result;
  }

  static async createCategory(input: CashbookCategoryCreateInput, actor: SettingsActor) {
    const category = await prisma.$transaction(async tx => {
      const created = await tx.cashFlowCategory.create({ data: { ...input, isSystem: false } });
      await AuditService.logInTransaction(tx, { action: 'CASHBOOK_CATEGORY_CREATED', targetType: 'CashFlowCategory', targetId: created.id, actorId: actor.id, actorName: actor.name, metadata: { code: created.code } });
      return created;
    }).catch(normalizeCashbookPersistenceError);
    changed([], 'category-created');
    return category;
  }

  static async updateCategory(id: number, input: CashbookCategoryUpdateInput, actor: SettingsActor) {
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.cashFlowCategory.findUnique({ where: { id } });
      if (!current) throw ApiError.notFound('Không tìm thấy danh mục thu chi.');
      if (current.isSystem) throw ApiError.conflict('Danh mục hệ thống được bảo vệ, không thể chỉnh sửa.');
      const saved = await tx.cashFlowCategory.update({ where: { id }, data: input });
      await AuditService.logInTransaction(tx, { action: 'CASHBOOK_CATEGORY_UPDATED', targetType: 'CashFlowCategory', targetId: id, actorId: actor.id, actorName: actor.name, metadata: { before: current, after: saved } });
      return saved;
    }).catch(normalizeCashbookPersistenceError);
    changed([], 'category-updated');
    return updated;
  }

  static async activate(input: CashbookActivationInput, actor: SettingsActor) {
    const activated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
      const setting = await tx.cashbookSetting.findUnique({ where: { id: 1 } });
      if (!setting || setting.activatedAt) throw ApiError.conflict('Sổ quỹ đã được kích hoạt hoặc thiếu cấu hình.');
      const ids = input.accounts.map(row => row.accountId);
      if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Tài khoản đầu kỳ bị lặp.');
      const accounts = await tx.financialAccount.findMany({ where: { id: { in: ids }, isActive: true } });
      if (accounts.length !== ids.length) throw ApiError.badRequest('Danh sách có tài khoản không tồn tại hoặc đã ngừng hoạt động.');
      const allActiveAccounts = await tx.financialAccount.count({ where: { isActive: true } });
      if (ids.length !== allActiveAccounts) throw ApiError.badRequest('Cần khai báo số dư đầu kỳ cho mọi tài khoản đang hoạt động.');
      const activatedAt = new Date();
      if (input.accounts.some(opening => new Date(opening.openingAt) > activatedAt)) {
        throw ApiError.badRequest('Ngày bắt đầu số dư không được ở tương lai.');
      }
      for (const opening of input.accounts) {
        await tx.financialAccount.update({
          where: { id: opening.accountId },
          data: { openingBalance: opening.openingBalance, openingAt: new Date(opening.openingAt) }
        });
      }
      const saved = await tx.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt, activatedByUserId: actor.id } });
      await AuditService.logInTransaction(tx, {
        action: 'CASHBOOK_ACTIVATED', targetType: 'CashbookSetting', targetId: 1,
        actorId: actor.id, actorName: actor.name,
        metadata: { activatedAt, openingBalances: input.accounts }
      });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(normalizeCashbookPersistenceError);
    changed(input.accounts.map(row => row.accountId), 'activated');
    return activated;
  }

  static async createParty(input: CashbookPartyInput, actor: SettingsActor) {
    const party = await prisma.$transaction(async tx => {
      const created = await tx.financialParty.create({ data: input });
      await AuditService.logInTransaction(tx, { action: 'CASHBOOK_PARTY_CREATED', targetType: 'FinancialParty', targetId: created.id, actorId: actor.id, actorName: actor.name, metadata: { name: created.name } });
      return created;
    }).catch(normalizeCashbookPersistenceError);
    return party;
  }

  static async counterparties(search: string, page: number, pageSize: number) {
    const contains = search.trim();
    const skip = (page - 1) * pageSize;
    const fetchSize = Math.min(page * pageSize, 500);
    const [suppliers, deliveryPartners, employees, parties] = await Promise.all([
      prisma.supplier.findMany({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) }, take: fetchSize, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
      prisma.deliveryPartner.findMany({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) }, take: fetchSize, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
      prisma.employee.findMany({ where: contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}, take: fetchSize, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, status: true } }),
      prisma.financialParty.findMany({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) }, take: fetchSize, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } })
    ]);
    const [supplierCount, partnerCount, employeeCount, partyCount] = await Promise.all([
      prisma.supplier.count({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) } }),
      prisma.deliveryPartner.count({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) } }),
      prisma.employee.count({ where: contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {} }),
      prisma.financialParty.count({ where: { isActive: true, ...(contains ? { OR: [{ name: { contains } }, { phone: { contains } }] } : {}) } })
    ]);
    const items = [
      ...suppliers.map(row => ({ ...row, type: 'SUPPLIER' })),
      ...deliveryPartners.map(row => ({ ...row, type: 'DELIVERY_PARTNER' })),
      ...employees.map(row => ({ ...row, type: 'EMPLOYEE' })),
      ...parties.map(row => ({ ...row, type: 'FINANCIAL_PARTY' }))
    ];
    return { items: items.sort((a, b) => a.name.localeCompare(b.name, 'vi')).slice(skip, skip + pageSize), page, pageSize, total: supplierCount + partnerCount + employeeCount + partyCount };
  }

  static async purchaseInvoices(search: string) {
    return prisma.purchaseReceipt.findMany({
      where: { status: 'POSTED', invoiceNumber: { not: null, ...(search.trim() ? { contains: search.trim() } : {}) } },
      take: 30, orderBy: { receivedAt: 'desc' },
      select: { id: true, receiptCode: true, invoiceNumber: true, invoiceDate: true, supplierId: true, supplier: { select: { name: true } } }
    });
  }

  static async parties(search: string, page: number, pageSize: number) {
    const where = { isActive: true, ...(search.trim() ? { name: { contains: search.trim() } } : {}) };
    const [items, total] = await Promise.all([
      prisma.financialParty.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
      prisma.financialParty.count({ where })
    ]);
    return { items, total, page, pageSize };
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
