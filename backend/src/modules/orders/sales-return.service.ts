import { CashVoucherSourceType, PaymentMethod, Prisma, OrderReturnStatus, PaymentStatus, OrderStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { emitInventoryChanged } from '../inventory/inventory.events';
import type { SalesReturnCandidateQuery, SalesReturnCreateInput, SalesReturnQuery } from './sales-return.schemas';
import type { SalesReturnExportRow } from './sales-return.export';
import { CashbookPostingService } from '../cashbook/cashbook-posting.service';
import { emitCashbookChanged } from '../cashbook/cashbook.events';

async function getPrisma(): Promise<PrismaClient> { return (await import('../../config/prisma')).prisma; }
const returnInclude = { lines: { orderBy: { id: 'asc' as const } }, order: { select: { id: true, code: true, table: { select: { tableNumber: true } } } } } satisfies Prisma.OrderReturnInclude;
type ReturnRecord = Prisma.OrderReturnGetPayload<{ include: typeof returnInclude }>;
type Actor = { id: number; name?: string };
const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 };

function dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const result: Prisma.DateTimeFilter = {};
  if (from) result.gte = new Date(`${from}T00:00:00+07:00`);
  if (to) result.lt = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000);
  return result;
}

function toDto(row: ReturnRecord) {
  return {
    id: row.id, returnCode: row.returnCode, orderId: row.orderId, sourceOrderCode: row.order.code, returnedAt: row.returnedAt,
    tableNumber: row.order.table?.tableNumber ?? null, customerName: null, status: row.status,
    totalRefundDue: row.totalRefundDue, refundedAmount: row.refundedAmount, refundMethod: row.refundMethod, note: row.note,
    createdByUserId: row.createdByUserId, createdByName: row.createdByName, completedAt: row.completedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    lines: row.lines.map(line => ({ id: line.id, orderItemId: line.orderItemId, menuItemId: line.menuItemId, menuItemSku: line.menuItemSku, menuItemName: line.menuItemName, quantity: line.quantity, unitPrice: line.unitPrice, lineAmount: line.lineAmount }))
  };
}

function baseWhere(query: SalesReturnQuery | SalesReturnCandidateQuery): Prisma.OrderReturnWhereInput {
  const where: Prisma.OrderReturnWhereInput = {};
  if (query.search) where.returnCode = { contains: query.search };
  if (query.tableId) where.order = { tableId: query.tableId };
  const returnedAt = dateFilter(query.from, query.to); if (returnedAt) where.returnedAt = returnedAt;
  return where;
}

function orderWhere(query: SalesReturnCandidateQuery): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { status: OrderStatus.COMPLETED, paymentStatus: PaymentStatus.PAID };
  if (query.search) where.code = { contains: query.search };
  if (query.tableId) where.tableId = query.tableId;
  const createdAt = dateFilter(query.from, query.to); if (createdAt) where.createdAt = createdAt;
  return where;
}

export class SalesReturnService {
  static async candidates(query: SalesReturnCandidateQuery) {
    const prisma = await getPrisma();
    const orders = await prisma.order.findMany({ where: orderWhere(query), include: { table: { select: { tableNumber: true } }, items: { include: { menuItem: { select: { sku: true, name: true } } }, orderBy: { id: 'asc' } }, returns: { where: { status: OrderReturnStatus.COMPLETED }, include: { lines: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const items = orders.map(order => {
      const returnedByItem = new Map<number, number>();
      for (const item of order.returns.flatMap(returnRow => returnRow.lines)) returnedByItem.set(item.orderItemId, (returnedByItem.get(item.orderItemId) ?? 0) + item.quantity);
      const remainingItems = order.items.map(item => { const returnedQuantity = returnedByItem.get(item.id) ?? 0; return { orderItemId: item.id, menuItemId: item.menuItemId, sku: item.menuItem.sku, menuItemName: item.menuItem.name, soldQuantity: item.quantity, returnedQuantity, remainingQuantity: item.quantity - returnedQuantity, unitPrice: Math.floor(item.subtotal / item.quantity), subtotal: item.subtotal }; }).filter(item => item.remainingQuantity > 0);
      return { orderId: order.id, code: order.code, createdAt: order.createdAt, orderType: order.orderType, tableNumber: order.table?.tableNumber ?? null, customerName: null, finalAmount: order.finalAmount, remainingItems };
    }).filter(order => order.remainingItems.length > 0);
    const start = (query.page - 1) * query.pageSize;
    const page = items.slice(start, start + query.pageSize);
    return { items: page, pagination: { page: query.page, pageSize: query.pageSize, totalRows: items.length, totalPages: Math.max(1, Math.ceil(items.length / query.pageSize)) } };
  }

  static async list(query: SalesReturnQuery) {
    const prisma = await getPrisma(); const where = baseWhere(query);
    if (query.statuses) where.status = { in: query.statuses };
    const [totalRows, rows, aggregate] = await Promise.all([
      prisma.orderReturn.count({ where }), prisma.orderReturn.findMany({ where, include: returnInclude, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.orderReturn.aggregate({ where, _sum: { totalRefundDue: true, refundedAmount: true } })
    ]);
    return { items: rows.map(toDto), pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)) }, summary: { totalRefundDue: aggregate._sum.totalRefundDue ?? 0, totalRefunded: aggregate._sum.refundedAmount ?? 0 } };
  }

  static async detail(id: number) { const prisma = await getPrisma(); const row = await prisma.orderReturn.findUnique({ where: { id }, include: returnInclude }); if (!row) throw ApiError.notFound('Phiếu trả hàng không tồn tại'); return toDto(row); }

  static async exportRows(query: SalesReturnQuery): Promise<SalesReturnExportRow[]> { const prisma = await getPrisma(); const where = baseWhere(query); if (query.statuses) where.status = { in: query.statuses }; const rows = await prisma.orderReturn.findMany({ where, include: returnInclude, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }] }); return rows.map(row => ({ returnCode: row.returnCode, orderCode: row.order.code, returnedAt: row.returnedAt.toISOString(), tableNumber: row.order.table?.tableNumber ?? null, customerName: null, totalRefundDue: row.totalRefundDue, refundedAmount: row.refundedAmount, status: row.status })); }

  static async create(input: SalesReturnCreateInput, actor: Actor) {
    const prisma = await getPrisma();
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${input.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: { include: { menuItem: true } }, table: true } });
      if (!order) throw ApiError.notFound('Hóa đơn không tồn tại');
      if (order.status !== OrderStatus.COMPLETED || order.paymentStatus !== PaymentStatus.PAID) throw ApiError.conflict('Chỉ hóa đơn đã hoàn thành và đã thanh toán mới được trả hàng');
      const itemIds = input.lines.map(line => line.orderItemId);
      const sourceItems = order.items.filter(item => itemIds.includes(item.id));
      if (sourceItems.length !== itemIds.length) throw ApiError.badRequest('Có dòng món không thuộc hóa đơn được chọn');
      const previous = await tx.orderReturnLine.groupBy({ by: ['orderItemId'], where: { orderReturn: { orderId: order.id, status: OrderReturnStatus.COMPLETED }, orderItemId: { in: itemIds } }, _sum: { quantity: true } });
      const previousQty = new Map(previous.map(row => [row.orderItemId, row._sum.quantity ?? 0]));
      const lines = input.lines.map(inputLine => {
        const item = sourceItems.find(source => source.id === inputLine.orderItemId)!; const returned = previousQty.get(item.id) ?? 0;
        if (returned + inputLine.quantity > item.quantity) throw ApiError.conflict(`Số lượng trả món ${item.menuItem.name} vượt số lượng còn được trả`);
        const unitPrice = Math.floor(item.subtotal / item.quantity); return { orderItemId: item.id, menuItemId: item.menuItemId, menuItemSku: item.menuItem.sku, menuItemName: item.menuItem.name, quantity: inputLine.quantity, unitPrice, lineAmount: inputLine.quantity * unitPrice };
      });
      const totalRefundDue = lines.reduce((sum, line) => sum + line.lineAmount, 0); const refundedAmount = input.refundedAmount ?? totalRefundDue;
      if (refundedAmount !== totalRefundDue) throw ApiError.badRequest('Số tiền đã trả phải bằng số tiền hệ thống tính trong MVP');
      const returnedAt = new Date();
      const created = await tx.orderReturn.create({ data: { returnCode: 'PENDING-' + randomUUID(), orderId: order.id, returnedAt, totalRefundDue, refundedAmount, refundMethod: input.refundMethod, note: input.note ?? null, createdByUserId: actor.id, createdByName: actor.name ?? null, completedAt: returnedAt, lines: { create: lines } }, include: returnInclude });
      const saved = await tx.orderReturn.update({ where: { id: created.id }, data: { returnCode: 'THD' + String(created.id).padStart(6, '0') }, include: returnInclude });
      const bomByIngredient = new Map<number, { quantity: number; costPerUnit: number }>();
      const boms = await tx.menuItemIngredient.findMany({ where: { menuItemId: { in: [...new Set(lines.map(line => line.menuItemId))] } }, include: { ingredient: true } });
      for (const line of lines) for (const bom of boms.filter(row => row.menuItemId === line.menuItemId)) { const current = bomByIngredient.get(bom.ingredientId) ?? { quantity: 0, costPerUnit: bom.ingredient.costPerUnit }; current.quantity += bom.quantityRequired * line.quantity; bomByIngredient.set(bom.ingredientId, current); }
      const ingredientIds = [...bomByIngredient.keys()].sort((a, b) => a - b);
      if (ingredientIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM Ingredient WHERE id IN (${Prisma.join(ingredientIds)}) ORDER BY id FOR UPDATE`);
      for (const ingredientId of ingredientIds) { const change = bomByIngredient.get(ingredientId)!; const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } }); if (!ingredient) continue; const cost = Math.round(change.quantity * ingredient.costPerUnit); await tx.ingredient.update({ where: { id: ingredientId }, data: { currentStock: { increment: change.quantity } } }); await tx.inventoryTransaction.create({ data: { ingredientId, orderReturnId: saved.id, type: 'SALES_RETURN', quantity: change.quantity, costAmount: cost, note: 'Trả hàng bán ' + saved.returnCode, createdByUserId: actor.id } }); }
      const menuChanges: Array<{ menuItemId: number; stockQuantity: number; trackStock: boolean; isAvailable: boolean }> = [];
      for (const line of lines) { const menu = await tx.menuItem.findUnique({ where: { id: line.menuItemId } }); if (menu?.trackStock) { const updated = await tx.menuItem.update({ where: { id: menu.id }, data: { stockQuantity: { increment: line.quantity } }, select: { id: true, stockQuantity: true, trackStock: true, isAvailable: true } }); menuChanges.push({ menuItemId: updated.id, stockQuantity: updated.stockQuantity, trackStock: updated.trackStock, isAvailable: updated.isAvailable }); } }
      const cashVoucher = refundedAmount > 0 ? await CashbookPostingService.post(tx, {
        direction: 'PAYMENT',
        paymentMethod: input.refundMethod as PaymentMethod,
        accountId: input.refundMethod === 'CASH' ? undefined : input.financialAccountId,
        categoryCode: 'CUSTOMER_REFUND',
        amount: refundedAmount,
        occurredAt: returnedAt,
        sourceType: CashVoucherSourceType.SALES_RETURN,
        sourceId: saved.id,
        sourceCode: saved.returnCode,
        affectsBusinessResult: false
      }, { id: actor.id, name: actor.name ?? 'Hệ thống' }) : null;
      await tx.auditLog.create({ data: { action: 'ORDER_RETURN_COMPLETED', targetType: 'OrderReturn', targetId: saved.id, actorId: actor.id, actorName: actor.name, metadata: { returnCode: saved.returnCode, orderId: order.id, totalRefundDue, lineCount: lines.length } } });
      return { row: saved, ingredientIds, menuChanges, cashVoucher };
    }, txOptions);
    if (outcome.ingredientIds.length) emitInventoryChanged({ sourceType: 'INGREDIENT', sourceIds: outcome.ingredientIds, reason: 'SALES_RETURN', updatedAt: outcome.row.updatedAt.toISOString() });
    if (outcome.menuChanges.length) emitToAll('menu:stockChanged', { items: outcome.menuChanges });
    if (outcome.cashVoucher) emitCashbookChanged({ voucherIds: [outcome.cashVoucher.id], reason: 'SOURCE_POSTED', updatedAt: new Date().toISOString() });
    emitToAll('order:returnCompleted', { returnId: outcome.row.id, returnCode: outcome.row.returnCode, orderId: outcome.row.orderId });
    return toDto(outcome.row);
  }
}
