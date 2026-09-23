import { CashVoucher, CashVoucherSourceType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitInventoryChanged } from './inventory.events';
import { calculateNewWeightedAverageCost } from './inventory.math';
import { calculatePurchaseReceiptTotals } from './purchase-receipt.math';
import { parsePurchaseReceiptExcelBuffer } from './inventory.excel';
import {
  PurchaseReceiptExportRow,
  serializePurchaseReceiptCsv,
  serializePurchaseReceiptWorkbook
} from './purchase-receipt.export';
import {
  CreatePurchaseReceiptInput,
  PurchaseReceiptLineInput,
  PurchaseReceiptListQuery,
  UpdatePurchaseReceiptInput
} from './purchase-receipt.schemas';
import {
  PurchaseReceiptActor,
  PurchaseReceiptDto,
  PurchaseReceiptImportPreviewDto,
  PurchaseReceiptListDataDto
} from './purchase-receipt.types';
import { CashbookPostingService } from '../cashbook/cashbook-posting.service';
import { emitCashbookChanged } from '../cashbook/cashbook.events';

const RECEIPT_CODE_PREFIX = 'PN';
const RECEIPT_CODE_RETRY_LIMIT = 2;

const receiptInclude = {
  supplier: { select: { id: true, code: true, name: true, isActive: true } },
  lines: { orderBy: { id: 'asc' as const } }
} satisfies Prisma.PurchaseReceiptInclude;

type ReceiptRecord = Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>;
type TransactionClient = Prisma.TransactionClient;

function formatReceiptCode(sequence: number): string {
  return `${RECEIPT_CODE_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

async function generateNextReceiptCode(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextCodeNumber: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(receiptCode, 3) AS UNSIGNED)), 0) + 1 AS nextCodeNumber
    FROM PurchaseReceipt
    WHERE receiptCode REGEXP '^PN[0-9]+$'
  `;
  const sequence = Number(rows[0]?.nextCodeNumber ?? 1);
  return formatReceiptCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}

function isReceiptCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(value => typeof value === 'string' && value.toLowerCase().includes('receiptcode'));
}

function calculateTotals(lines: ReadonlyArray<{ quantity: number; unitCost: number; discountAmount: number }>, discountAmount: number, paidAmount: number) {
  try {
    return calculatePurchaseReceiptTotals({ lines, discountAmount, paidAmount });
  } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : 'Giá trị phiếu nhập không hợp lệ');
  }
}

function calculateLineAmount(line: { quantity: number; unitCost: number; discountAmount: number }): number {
  return calculateTotals([line], 0, 0).subtotalAmount;
}

function receiptWhere(query: PurchaseReceiptListQuery): Prisma.PurchaseReceiptWhereInput {
  const statuses = query.statuses ?? (query.status ? [query.status] : undefined);
  const where: Prisma.PurchaseReceiptWhereInput = {};

  if (statuses?.length) where.status = { in: statuses };
  if (query.from || query.to) {
    const receivedAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const from = new Date(query.from);
      from.setUTCHours(0, 0, 0, 0);
      receivedAt.gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      to.setUTCHours(23, 59, 59, 999);
      receivedAt.lte = to;
    }
    where.receivedAt = receivedAt;
  }
  if (query.search) {
    const search = query.search.trim();
    where.OR = [
      { receiptCode: { contains: search } },
      { invoiceNumber: { contains: search } },
      { supplier: { is: { code: { contains: search } } } },
      { supplier: { is: { name: { contains: search } } } }
    ];
  }
  return where;
}

function payableAmount(subtotalAmount: number, discountAmount: number): number {
  return Math.max(0, subtotalAmount - discountAmount);
}

function toExportRow(receipt: {
  receiptCode: string;
  receivedAt: Date;
  subtotalAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: string;
  supplier: { name: string } | null;
}): PurchaseReceiptExportRow {
  const payable = payableAmount(receipt.subtotalAmount, receipt.discountAmount);
  return {
    receiptCode: receipt.receiptCode,
    receivedAt: receipt.receivedAt,
    supplierName: receipt.supplier?.name ?? '',
    subtotalAmount: receipt.subtotalAmount,
    discountAmount: receipt.discountAmount,
    payableAmount: payable,
    paidAmount: receipt.paidAmount,
    outstandingAmount: Math.max(0, payable - receipt.paidAmount),
    status: receipt.status
  };
}

function toReceiptDto(receipt: ReceiptRecord): PurchaseReceiptDto {
  const totals = calculateTotals(receipt.lines, receipt.discountAmount, receipt.paidAmount);
  return {
    id: receipt.id,
    receiptCode: receipt.receiptCode,
    supplierId: receipt.supplierId,
    supplier: receipt.supplier,
    receivedAt: receipt.receivedAt,
    invoiceNumber: receipt.invoiceNumber,
    invoiceDate: receipt.invoiceDate,
    status: receipt.status,
    subtotalAmount: receipt.subtotalAmount,
    discountAmount: receipt.discountAmount,
    payableAmount: totals.payableAmount,
    paidAmount: receipt.paidAmount,
    paymentMethod: receipt.paymentMethod,
    financialAccountId: receipt.financialAccountId,
    outstandingAmount: totals.outstandingAmount,
    note: receipt.note,
    createdByUserId: receipt.createdByUserId,
    postedByUserId: receipt.postedByUserId,
    postedAt: receipt.postedAt,
    cancelledByUserId: receipt.cancelledByUserId,
    cancelledAt: receipt.cancelledAt,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    lines: receipt.lines.map(line => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientSku: line.ingredientSku,
      ingredientName: line.ingredientName,
      unit: line.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
      lineAmount: calculateLineAmount(line),
      note: line.note
    }))
  };
}

async function requireActiveSupplier(tx: TransactionClient, supplierId: number): Promise<void> {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, isActive: true }, select: { id: true } });
  if (!supplier) throw ApiError.badRequest('Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động');
}

async function snapshotLines(tx: TransactionClient, lines: PurchaseReceiptLineInput[]) {
  if (lines.length === 0) return [];
  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: lines.map(line => line.ingredientId) }, isActive: true }
  });
  const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
  return lines.map(line => {
    const ingredient = ingredientById.get(line.ingredientId);
    if (!ingredient) throw ApiError.badRequest(`Nguyên liệu ID ${line.ingredientId} không tồn tại hoặc đã ngừng hoạt động`);
    return {
      ingredientId: ingredient.id,
      ingredientSku: ingredient.sku,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
      note: line.note ?? null
    };
  });
}

async function getTransitionFailure(id: number): Promise<never> {
  const receipt = await prisma.purchaseReceipt.findUnique({ where: { id }, select: { status: true } });
  if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
  throw ApiError.conflict('Chỉ phiếu tạm mới có thể thực hiện thao tác này');
}

export class PurchaseReceiptService {
  static async list(query: PurchaseReceiptListQuery): Promise<PurchaseReceiptListDataDto> {
    if (query.from && query.to && query.from > query.to) {
      throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    }
    const where = receiptWhere(query);
    const skip = (query.page - 1) * query.pageSize;
    const [totalRows, receipts, totals] = await Promise.all([
      prisma.purchaseReceipt.count({ where }),
      prisma.purchaseReceipt.findMany({
        where,
        skip,
        take: query.pageSize,
        include: receiptInclude,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.purchaseReceipt.aggregate({ where, _sum: { subtotalAmount: true, discountAmount: true } })
    ]);
    return {
      items: receipts.map(toReceiptDto),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize))
      },
      totalPayableAmount: payableAmount(totals._sum.subtotalAmount ?? 0, totals._sum.discountAmount ?? 0)
    };
  }

  static async export(query: PurchaseReceiptListQuery, format: 'csv' | 'xlsx'): Promise<Buffer> {
    if (query.from && query.to && query.from > query.to) {
      throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    }
    const rows = await prisma.purchaseReceipt.findMany({
      where: receiptWhere(query),
      select: {
        receiptCode: true,
        receivedAt: true,
        subtotalAmount: true,
        discountAmount: true,
        paidAmount: true,
        status: true,
        supplier: { select: { name: true } }
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }]
    });
    const exportRows = rows.map(toExportRow);
    return format === 'csv'
      ? serializePurchaseReceiptCsv(exportRows)
      : serializePurchaseReceiptWorkbook(exportRows);
  }

  static async previewImport(fileBase64: string, fileName: string): Promise<PurchaseReceiptImportPreviewDto> {
    const parsedRows = parsePurchaseReceiptExcelBuffer(Buffer.from(fileBase64, 'base64'));
    if (parsedRows.length === 0) {
      throw ApiError.badRequest('File Excel không có dữ liệu hợp lệ để nhập');
    }

    const ingredients = await prisma.ingredient.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, unit: true }
    });
    const ingredientBySku = new Map(ingredients.map(ingredient => [ingredient.sku.toUpperCase(), ingredient]));
    const validRows: PurchaseReceiptImportPreviewDto['validRows'] = [];
    const errorRows: PurchaseReceiptImportPreviewDto['errorRows'] = [];

    for (const row of parsedRows) {
      const ingredient = ingredientBySku.get(row.sku.toUpperCase());
      if (!ingredient) {
        errorRows.push({
          rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit,
          quantity: row.quantity, costPerUnit: row.costPerUnit,
          error: `Mã nguyên liệu '${row.sku}' không tồn tại hoặc đã ngừng hoạt động`
        });
        continue;
      }
      if (row.unit && row.unit.toLowerCase() !== ingredient.unit.toLowerCase()) {
        errorRows.push({
          rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit,
          quantity: row.quantity, costPerUnit: row.costPerUnit,
          error: `Đơn vị tính '${row.unit}' không khớp với hệ thống ('${ingredient.unit}')`
        });
        continue;
      }
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        errorRows.push({
          rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit,
          quantity: row.quantity, costPerUnit: row.costPerUnit,
          error: 'Số lượng nhập phải lớn hơn 0'
        });
        continue;
      }
      if (!Number.isInteger(row.costPerUnit) || row.costPerUnit < 0) {
        errorRows.push({
          rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit,
          quantity: row.quantity, costPerUnit: row.costPerUnit,
          error: 'Đơn giá phải là số nguyên và không được nhỏ hơn 0'
        });
        continue;
      }
      validRows.push({
        rowNumber: row.rowNumber,
        ingredientId: ingredient.id,
        ingredientSku: ingredient.sku,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        quantity: row.quantity,
        unitCost: row.costPerUnit,
        discountAmount: 0,
        note: row.note ?? null
      });
    }

    return { fileName, totalRows: parsedRows.length, validRows, errorRows };
  }

  static async getById(id: number): Promise<PurchaseReceiptDto> {
    const receipt = await prisma.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
    if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
    return toReceiptDto(receipt);
  }

  static async create(input: CreatePurchaseReceiptInput, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    let lastError: unknown;
    for (let attempt = 0; attempt < RECEIPT_CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const receipt = await prisma.$transaction(async tx => {
          if (input.supplierId !== null) await requireActiveSupplier(tx, input.supplierId);
          const lines = await snapshotLines(tx, input.lines);
          const totals = calculateTotals(lines, input.discountAmount, input.paidAmount);
          const receiptCode = await generateNextReceiptCode(tx);
          return tx.purchaseReceipt.create({
            data: {
              receiptCode,
              supplierId: input.supplierId,
              receivedAt: input.receivedAt ?? new Date(),
              invoiceNumber: input.invoiceNumber ?? null,
              invoiceDate: input.invoiceDate ?? null,
              subtotalAmount: totals.subtotalAmount,
              discountAmount: input.discountAmount,
              paidAmount: input.paidAmount,
              paymentMethod: input.paymentMethod,
              financialAccountId: input.paymentMethod === 'CASH' ? null : (input.financialAccountId ?? null),
              note: input.note ?? null,
              createdByUserId: actor.id,
              lines: { create: lines }
            },
            include: receiptInclude
          });
        });
        const dto = toReceiptDto(receipt);
        await AuditService.log({
          action: 'PURCHASE_RECEIPT_CREATED', targetType: 'PurchaseReceipt', targetId: dto.id,
          actorId: actor.id, actorName: actor.name,
          metadata: { receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount, lineCount: dto.lines.length }
        });
        return dto;
      } catch (error) {
        if (!isReceiptCodeConflict(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw ApiError.conflict('Không thể tạo mã phiếu nhập tự động, vui lòng thử lại');
    throw ApiError.internal();
  }

  static async update(id: number, input: UpdatePurchaseReceiptInput, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    const receipt = await prisma.$transaction(async tx => {
      const current = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
      if (!current) throw ApiError.notFound('Phiếu nhập không tồn tại');
      if (current.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');

      if (input.supplierId !== undefined && input.supplierId !== null) {
        await requireActiveSupplier(tx, input.supplierId);
      }
      const lines = input.lines === undefined
        ? current.lines.map(line => ({
            ingredientId: line.ingredientId,
            ingredientSku: line.ingredientSku,
            ingredientName: line.ingredientName,
            unit: line.unit,
            quantity: line.quantity,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            note: line.note
          }))
        : await snapshotLines(tx, input.lines);
      const discountAmount = input.discountAmount ?? current.discountAmount;
      const paidAmount = input.paidAmount ?? current.paidAmount;
      const totals = calculateTotals(lines, discountAmount, paidAmount);

      const claimed = await tx.purchaseReceipt.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          supplierId: input.supplierId,
          receivedAt: input.receivedAt,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          subtotalAmount: totals.subtotalAmount,
          discountAmount,
          paidAmount,
          paymentMethod: input.paymentMethod,
          financialAccountId: input.paymentMethod === 'CASH' ? null : input.financialAccountId,
          note: input.note
        }
      });
      if (claimed.count !== 1) throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');

      if (input.lines !== undefined) {
        await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceiptId: id } });
        if (lines.length > 0) {
          await tx.purchaseReceiptLine.createMany({
            data: lines.map(line => ({ ...line, purchaseReceiptId: id }))
          });
        }
      }
      const updated = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
      if (!updated) throw ApiError.notFound('Phiếu nhập không tồn tại');
      return updated;
    });
    const dto = toReceiptDto(receipt);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_UPDATED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: {
        receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount,
        payableAmount: dto.payableAmount, lineCount: dto.lines.length, updatedFields: Object.keys(input)
      }
    });
    return dto;
  }

  static async cancel(id: number, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    const updated = await prisma.purchaseReceipt.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CANCELLED', cancelledByUserId: actor.id, cancelledAt: new Date() }
    });
    if (updated.count !== 1) return getTransitionFailure(id);
    const dto = await this.getById(id);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_CANCELLED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: { receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount, lineCount: dto.lines.length }
    });
    return dto;
  }

  static async postReceipt(id: number, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    let outcome: { receipt: ReceiptRecord; ingredientIds: number[]; cashVoucher: CashVoucher | null };
    try {
      outcome = await prisma.$transaction(async tx => {
        const claimed = await tx.purchaseReceipt.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'POSTED', postedByUserId: actor.id, postedAt: new Date() }
        });
        if (claimed.count !== 1) {
          const current = await tx.purchaseReceipt.findUnique({ where: { id }, select: { id: true } });
          if (!current) throw ApiError.notFound('Phiếu nhập không tồn tại');
          throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
        }

        const receipt = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
        if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
        if (!receipt.supplierId || !receipt.supplier?.isActive) {
          throw ApiError.badRequest('Phiếu nhập cần một nhà cung cấp đang hoạt động');
        }
        if (receipt.lines.length === 0) {
          throw ApiError.badRequest('Phiếu nhập cần ít nhất một nguyên liệu');
        }
        const totals = calculateTotals(receipt.lines, receipt.discountAmount, receipt.paidAmount);
        const ingredientIds = [...new Set(receipt.lines.map(line => line.ingredientId))].sort((left, right) => left - right);

        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM Ingredient
          WHERE id IN (${Prisma.join(ingredientIds)})
          ORDER BY id
          FOR UPDATE
        `);
        const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds } } });
        const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));

        for (const line of receipt.lines) {
          const ingredient = ingredientById.get(line.ingredientId);
          if (!ingredient) throw ApiError.badRequest(`Nguyên liệu '${line.ingredientName}' không còn tồn tại`);
          if (!ingredient.isActive) throw ApiError.badRequest(`Nguyên liệu '${line.ingredientName}' đã ngừng hoạt động`);
          const lineNetAmount = calculateLineAmount(line);
          const incomingCost = Math.round(lineNetAmount / line.quantity);
          const next = calculateNewWeightedAverageCost({
            currentStock: ingredient.currentStock,
            currentCost: ingredient.costPerUnit,
            incomingQty: line.quantity,
            incomingCost
          });
          await tx.ingredient.update({
            where: { id: ingredient.id },
            data: { currentStock: next.newStock, costPerUnit: next.newCost }
          });
          await tx.inventoryTransaction.create({
            data: {
              ingredientId: ingredient.id,
              purchaseReceiptId: receipt.id,
              type: 'STOCK_IN',
              quantity: line.quantity,
              costAmount: lineNetAmount,
              note: line.note ?? `Nhập theo phiếu ${receipt.receiptCode}`,
              createdByUserId: actor.id
            }
          });
        }

        const posted = await tx.purchaseReceipt.update({
          where: { id },
          data: { subtotalAmount: totals.subtotalAmount },
          include: receiptInclude
        });
        const cashVoucher = posted.paidAmount > 0 ? await CashbookPostingService.post(tx, {
          direction: 'PAYMENT',
          paymentMethod: posted.paymentMethod,
          accountId: posted.paymentMethod === 'CASH' ? undefined : (posted.financialAccountId ?? undefined),
          categoryCode: 'SUPPLIER_PAYMENT',
          amount: posted.paidAmount,
          occurredAt: posted.postedAt ?? new Date(),
          sourceType: CashVoucherSourceType.PURCHASE_RECEIPT,
          sourceId: posted.id,
          sourceCode: posted.receiptCode,
          counterpartyType: 'SUPPLIER',
          counterpartyId: posted.supplierId,
          counterpartyName: posted.supplier?.name,
          affectsBusinessResult: false,
          linkedPurchaseReceiptId: posted.id,
          sourceInvoiceNumber: posted.invoiceNumber,
          sourceInvoiceDate: posted.invoiceDate
        }, actor) : null;
        return { receipt: posted, ingredientIds, cashVoucher };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        const current = await prisma.purchaseReceipt.findUnique({ where: { id }, select: { status: true } });
        if (current && current.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
      }
      throw error;
    }

    const dto = toReceiptDto(outcome.receipt);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_POSTED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: {
        receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount,
        payableAmount: dto.payableAmount, paidAmount: dto.paidAmount,
        outstandingAmount: dto.outstandingAmount, lineCount: dto.lines.length
      }
    });
    emitInventoryChanged({
      sourceType: 'INGREDIENT',
      sourceIds: outcome.ingredientIds,
      reason: 'PURCHASE_RECEIPT_POSTED',
      updatedAt: dto.updatedAt.toISOString()
    });
    if (outcome.cashVoucher) {
      emitCashbookChanged({ voucherIds: [outcome.cashVoucher.id], reason: 'SOURCE_POSTED', updatedAt: new Date().toISOString() });
    }
    return dto;
  }
}
