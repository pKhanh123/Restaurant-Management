import { randomUUID } from 'crypto';
import { CashVoucherSourceType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitInventoryChanged } from './inventory.events';
import { purchaseReturnTotals } from './purchase-return.math';
import { serializePurchaseReturnCsv, serializePurchaseReturnWorkbook } from './purchase-return.export';
import { parsePurchaseReturnExcelBuffer } from './purchase-return.import';
import type { PurchaseReturnImportPreviewDto } from './purchase-return.types';
import type { PurchaseReturnInput, PurchaseReturnQuery } from './purchase-return.schemas';
import { CashbookPostingService } from '../cashbook/cashbook-posting.service';
import { emitCashbookChanged } from '../cashbook/cashbook.events';

export const returnInclude = { lines: { orderBy: { id: 'asc' as const } }, supplier: { select: { id: true, code: true, name: true, isActive: true } }, sourceReceipt: { select: { id: true, receiptCode: true } } } satisfies Prisma.PurchaseReturnInclude;
export type ReturnRecord = Prisma.PurchaseReturnGetPayload<{ include: typeof returnInclude }>;
export type ReturnActor = { id: number; name?: string };
type Tx = Prisma.TransactionClient;
const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 };
export const returnDto = (row: ReturnRecord) => ({ ...row, ...purchaseReturnTotals(row.lines, row.discountAmount, row.vatAmount, row.refundAmount) });

async function audit(tx: Tx, row: ReturnRecord, actor: ReturnActor, action: string) {
  await tx.auditLog.create({ data: { action: 'PURCHASE_RETURN_' + action, targetType: 'PurchaseReturn', targetId: row.id, actorId: actor.id, actorName: actor.name,
    metadata: { returnCode: row.returnCode, supplierId: row.supplierId, lineCount: row.lines.length, version: row.version, subtotalAmount: row.subtotalAmount, refundAmount: row.refundAmount } } });
}
function notify(row: ReturnRecord) {
  const sourceIds = row.lines.length ? row.lines.map(line => line.ingredientId) : (row.supplierId ? [row.supplierId] : []);
  if (!sourceIds.length) return;
  emitInventoryChanged({ sourceType: row.lines.length ? 'INGREDIENT' : 'SUPPLIER', sourceIds, reason: 'PURCHASE_RETURN_CHANGED', updatedAt: row.updatedAt.toISOString() });
}
async function lockedDraft(tx: Tx, id: number, expectedVersion: number) {
  await tx.$queryRaw`SELECT id FROM PurchaseReturn WHERE id = ${id} FOR UPDATE`;
  const row = await tx.purchaseReturn.findUnique({ where: { id }, include: returnInclude });
  if (!row) throw ApiError.notFound('Phiếu trả hàng không tồn tại');
  if (row.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể thực hiện thao tác này');
  if (row.version !== expectedVersion) throw ApiError.conflict('Phiếu đã được thay đổi. Hãy tải lại trước khi tiếp tục');
  return row;
}

async function snapshot(tx: Tx, input: PurchaseReturnInput, previous?: ReturnRecord) {
  if (input.supplierId && !await tx.supplier.findFirst({ where: { id: input.supplierId, isActive: true } })) throw ApiError.badRequest('Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động');
  const source = input.sourceReceiptId ? await tx.purchaseReceipt.findUnique({ where: { id: input.sourceReceiptId }, include: { lines: true } }) : null;
  if (input.sourceReceiptId && (!source || source.status !== 'POSTED' || source.supplierId !== input.supplierId)) throw ApiError.badRequest('Phiếu nhập nguồn phải hoàn thành và thuộc nhà cung cấp đã chọn');
  const ingredients = await tx.ingredient.findMany({ where: { id: { in: input.lines.map(line => line.ingredientId) }, isActive: true } });
  const old = previous && previous.supplierId === input.supplierId && previous.sourceReceiptId === input.sourceReceiptId ? previous.lines : [];
  const recent = input.supplierId && !source ? await tx.purchaseReceiptLine.findMany({ where: { ingredientId: { in: ingredients.map(item => item.id) }, purchaseReceipt: { supplierId: input.supplierId, status: 'POSTED' } }, orderBy: [{ purchaseReceipt: { receivedAt: 'desc' } }, { id: 'desc' }] }) : [];
  return input.lines.map(line => {
    const ingredient = ingredients.find(item => item.id === line.ingredientId);
    if (!ingredient) throw ApiError.badRequest('Hàng hóa không tồn tại hoặc đã ngừng hoạt động');
    const sourceLine = source?.lines.find(item => item.ingredientId === line.ingredientId);
    if (source && !sourceLine) throw ApiError.badRequest('Hàng hóa không thuộc phiếu nhập nguồn');
    const priceLine = sourceLine || recent.find(item => item.ingredientId === line.ingredientId);
    const previousLine = old.find(item => item.ingredientId === line.ingredientId);
    const referenceCost = priceLine ? Math.round((Math.round(priceLine.quantity * priceLine.unitCost) - priceLine.discountAmount) / priceLine.quantity) : ingredient.costPerUnit;
    return { ...line, ingredientSku: previousLine?.ingredientSku || ingredient.sku, ingredientName: previousLine?.ingredientName || ingredient.name, unit: previousLine?.unit || ingredient.unit,
      sourceReceiptLineId: sourceLine?.id || null, purchaseUnitCost: previousLine?.purchaseUnitCost ?? referenceCost, lineAmount: Math.round(line.quantity * line.returnUnitPrice) };
  });
}

export class PurchaseReturnService {
  static async list(query: PurchaseReturnQuery) {
    const where: Prisma.PurchaseReturnWhereInput = {};
    if (query.search) where.returnCode = { contains: query.search };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.sourceReceiptId) where.sourceReceiptId = query.sourceReceiptId;
    if (query.statuses) where.status = { in: query.statuses };
    if (query.from || query.to) {
      const returnedAt: Prisma.DateTimeFilter = {};
      if (query.from) returnedAt.gte = new Date(query.from + 'T00:00:00+07:00');
      if (query.to) returnedAt.lt = new Date(new Date(query.to + 'T00:00:00+07:00').getTime() + 86_400_000);
      where.returnedAt = returnedAt;
    }
    const [totalRows, rows, aggregate] = await prisma.$transaction([
      prisma.purchaseReturn.count({ where }),
      prisma.purchaseReturn.findMany({ where, include: returnInclude, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.purchaseReturn.aggregate({ where, _sum: { subtotalAmount: true, discountAmount: true, vatAmount: true, refundAmount: true } })
    ]);
    const totalSubtotal = aggregate._sum.subtotalAmount || 0;
    const totalDiscount = aggregate._sum.discountAmount || 0;
    const totalVat = aggregate._sum.vatAmount || 0;
    return {
      items: rows.map(returnDto),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)) },
      summary: { totalSubtotal, totalDiscount, totalVat, totalRefund: aggregate._sum.refundAmount || 0, totalDue: totalSubtotal - totalDiscount + totalVat }
    };
  }
  static async detail(id: number) {
    const row = await prisma.purchaseReturn.findUnique({ where: { id }, include: returnInclude });
    if (!row) throw ApiError.notFound('Phiếu trả hàng không tồn tại');
    return returnDto(row);
  }
  static async export(query: PurchaseReturnQuery, format: 'csv' | 'xlsx'): Promise<Buffer> {
    const where: Prisma.PurchaseReturnWhereInput = {};
    if (query.search) where.returnCode = { contains: query.search };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.statuses) where.status = { in: query.statuses };
    if (query.from || query.to) { const returnedAt: Prisma.DateTimeFilter = {}; if (query.from) returnedAt.gte = new Date(query.from + 'T00:00:00+07:00'); if (query.to) returnedAt.lt = new Date(new Date(query.to + 'T00:00:00+07:00').getTime() + 86_400_000); where.returnedAt = returnedAt; }
    const rows = await prisma.purchaseReturn.findMany({ where, include: { supplier: { select: { name: true } } }, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }] });
    const exportRows = rows.map(row => ({ code: row.returnCode, returnedAt: row.returnedAt, supplier: row.supplier?.name || '', subtotal: row.subtotalAmount, discount: row.discountAmount, vat: row.vatAmount, payable: row.subtotalAmount - row.discountAmount + row.vatAmount, refund: row.refundAmount, note: row.note || '', status: row.status }));
    return format === 'csv' ? serializePurchaseReturnCsv(exportRows) : serializePurchaseReturnWorkbook(exportRows);
  }
  static async previewImport(fileBase64: string, fileName: string): Promise<PurchaseReturnImportPreviewDto> {
    let parsed;
    try { parsed = parsePurchaseReturnExcelBuffer(Buffer.from(fileBase64, 'base64')); } catch (error) { throw ApiError.badRequest(error instanceof Error ? error.message : 'File Excel không hợp lệ'); }
    if (!parsed.length) throw ApiError.badRequest('File Excel không có dữ liệu hợp lệ để nhập');
    const ingredients = await prisma.ingredient.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, unit: true, currentStock: true, costPerUnit: true } });
    const bySku = new Map(ingredients.map(item => [item.sku.toUpperCase(), item])); const seen = new Set<string>(); const validRows: PurchaseReturnImportPreviewDto['validRows'] = []; const errorRows: PurchaseReturnImportPreviewDto['errorRows'] = [];
    for (const row of parsed) { const item = bySku.get(row.sku.toUpperCase()); const common = { rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit, quantity: row.quantity, returnUnitPrice: row.returnUnitPrice }; if (seen.has(row.sku.toUpperCase())) { errorRows.push({ ...common, error: 'Mã hàng chỉ được xuất hiện một lần trong file' }); continue; } seen.add(row.sku.toUpperCase()); if (!item) { errorRows.push({ ...common, error: 'Mã hàng không tồn tại hoặc đã ngừng hoạt động' }); continue; } if (row.unit && row.unit.toLowerCase() !== item.unit.toLowerCase()) { errorRows.push({ ...common, error: 'Đơn vị tính không khớp với hệ thống' }); continue; } if (!Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > item.currentStock) { errorRows.push({ ...common, error: 'Số lượng trả phải lớn hơn 0 và không vượt tồn kho' }); continue; } if (!Number.isSafeInteger(row.returnUnitPrice) || row.returnUnitPrice < 0) { errorRows.push({ ...common, error: 'Giá trả phải là số nguyên không âm' }); continue; } validRows.push({ ...common, ingredientId: item.id, ingredientSku: item.sku, ingredientName: item.name, unit: item.unit, currentStock: item.currentStock, costPerUnit: item.costPerUnit }); }
    return { fileName, totalRows: parsed.length, validRows, errorRows };
  }
  static async create(input: PurchaseReturnInput, actor: ReturnActor) {
    const totals = purchaseReturnTotals(input.lines, input.discountAmount, input.vatAmount, input.refundAmount);
    const row = await prisma.$transaction(async tx => {
      const lines = await snapshot(tx, input);
      const { lines: _lines, ...header } = input;
      const created = await tx.purchaseReturn.create({ data: { ...header, subtotalAmount: totals.subtotalAmount, returnCode: 'PENDING-' + randomUUID(), createdByUserId: actor.id, createdByName: actor.name, lines: { create: lines } } });
      const saved = await tx.purchaseReturn.update({ where: { id: created.id }, data: { returnCode: 'THN' + String(created.id).padStart(6, '0') }, include: returnInclude });
      await audit(tx, saved, actor, 'CREATED');
      return saved;
    }, txOptions);
    notify(row); return returnDto(row);
  }
  static async update(id: number, input: PurchaseReturnInput, expectedVersion: number, actor: ReturnActor) {
    const totals = purchaseReturnTotals(input.lines, input.discountAmount, input.vatAmount, input.refundAmount);
    const row = await prisma.$transaction(async tx => {
      const previous = await lockedDraft(tx, id, expectedVersion);
      const lines = await snapshot(tx, input, previous);
      const { lines: _lines, ...header } = input;
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { ...header, subtotalAmount: totals.subtotalAmount, version: { increment: 1 }, lines: { deleteMany: {}, create: lines } }, include: returnInclude });
      await audit(tx, updated, actor, 'UPDATED'); return updated;
    }, txOptions);
    notify(row); return returnDto(row);
  }
  static async cancel(id: number, expectedVersion: number, actor: ReturnActor) {
    const row = await prisma.$transaction(async tx => {
      await lockedDraft(tx, id, expectedVersion);
      const cancelled = await tx.purchaseReturn.update({ where: { id }, data: { status: 'CANCELLED', version: { increment: 1 }, cancelledAt: new Date(), cancelledByUserId: actor.id }, include: returnInclude });
      await audit(tx, cancelled, actor, 'CANCELLED'); return cancelled;
    }, txOptions);
    notify(row); return returnDto(row);
  }
  static async complete(id: number, expectedVersion: number, actor: ReturnActor) {
    const outcome = await prisma.$transaction(async tx => {
      const current = await lockedDraft(tx, id, expectedVersion);
      if (!current.supplier?.isActive || !current.lines.length) throw ApiError.badRequest('Cần nhà cung cấp đang hoạt động và ít nhất một dòng hàng');
      purchaseReturnTotals(current.lines, current.discountAmount, current.vatAmount, current.refundAmount);
      if (current.sourceReceiptId) {
        await tx.$queryRaw`SELECT id FROM PurchaseReceipt WHERE id = ${current.sourceReceiptId} FOR UPDATE`;
        const source = await tx.purchaseReceipt.findUnique({ where: { id: current.sourceReceiptId }, include: { lines: true } });
        if (!source || source.status !== 'POSTED' || source.supplierId !== current.supplierId) throw ApiError.badRequest('Phiếu nhập nguồn không hợp lệ');
        const returned = await tx.purchaseReturnLine.groupBy({ by: ['ingredientId'], where: { purchaseReturn: { sourceReceiptId: source.id, status: 'COMPLETED' } }, _sum: { quantity: true } });
        for (const line of current.lines) {
          const original = source.lines.find(item => item.id === line.sourceReceiptLineId && item.ingredientId === line.ingredientId);
          const used = returned.find(item => item.ingredientId === line.ingredientId)?._sum.quantity || 0;
          if (!original || line.quantity + used > original.quantity + 1e-9) throw ApiError.conflict('Số lượng trả của ' + line.ingredientName + ' vượt số còn được trả theo phiếu nhập');
        }
      }
      const ids = current.lines.map(line => line.ingredientId).sort((a, b) => a - b);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Ingredient WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: ids }, isActive: true } });
      for (const line of current.lines) {
        const ingredient = ingredients.find(item => item.id === line.ingredientId);
        if (!ingredient) throw ApiError.badRequest('Hàng hóa ' + line.ingredientName + ' đã ngừng hoạt động');
        const cost = Math.round(line.quantity * ingredient.costPerUnit);
        if (!Number.isSafeInteger(cost) || cost > 2_000_000_000) throw ApiError.badRequest('Giá vốn dòng hàng vượt giới hạn');
        const changed = await tx.ingredient.updateMany({ where: { id: ingredient.id, currentStock: { gte: line.quantity } }, data: { currentStock: { decrement: line.quantity } } });
        if (changed.count !== 1) throw ApiError.conflict('Số lượng trả của ' + line.ingredientName + ' vượt tồn kho hiện tại');
        await tx.purchaseReturnLine.update({ where: { id: line.id }, data: { stockCostPerUnit: ingredient.costPerUnit, stockCostAmount: cost } });
        await tx.inventoryTransaction.create({ data: { ingredientId: ingredient.id, purchaseReturnId: id, type: 'PURCHASE_RETURN', quantity: -line.quantity, costAmount: -cost, note: 'Trả hàng nhập ' + current.returnCode, createdByUserId: actor.id } });
      }
      const completedAt = new Date();
      const completed = await tx.purchaseReturn.update({ where: { id }, data: { status: 'COMPLETED', version: { increment: 1 }, completedAt, completedByUserId: actor.id }, include: returnInclude });
      const cashVoucher = completed.refundAmount > 0 ? await CashbookPostingService.post(tx, {
        direction: 'RECEIPT',
        paymentMethod: completed.refundMethod,
        accountId: completed.refundMethod === 'CASH' ? undefined : (completed.financialAccountId ?? undefined),
        categoryCode: 'SUPPLIER_REFUND',
        amount: completed.refundAmount,
        occurredAt: completedAt,
        sourceType: CashVoucherSourceType.PURCHASE_RETURN,
        sourceId: completed.id,
        sourceCode: completed.returnCode,
        counterpartyType: 'SUPPLIER',
        counterpartyId: completed.supplierId,
        counterpartyName: completed.supplier?.name,
        affectsBusinessResult: false
      }, { id: actor.id, name: actor.name ?? 'Hệ thống' }) : null;
      await audit(tx, completed, actor, 'COMPLETED'); return { row: completed, cashVoucher };
    }, txOptions);
    notify(outcome.row);
    if (outcome.cashVoucher) emitCashbookChanged({ voucherIds: [outcome.cashVoucher.id], reason: 'SOURCE_POSTED', updatedAt: new Date().toISOString() });
    return returnDto(outcome.row);
  }
}
