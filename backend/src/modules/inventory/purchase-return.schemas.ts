import { z } from 'zod';

export const returnMoney = z.number().int().min(0).max(2_000_000_000);
export const returnQuantity = z.number().finite().positive().max(1_000_000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Số lượng tối đa 3 chữ số thập phân');
export const returnDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');
const lines = z.array(z.object({ ingredientId: z.number().int().positive(), quantity: returnQuantity, returnUnitPrice: returnMoney })).max(500).refine(rows => new Set(rows.map(row => row.ingredientId)).size === rows.length, 'Mỗi hàng hóa chỉ xuất hiện một lần');
export const createPurchaseReturnSchema = z.object({
  supplierId: z.number().int().positive().nullable().default(null),
  sourceReceiptId: z.number().int().positive().nullable().default(null),
  returnedAt: z.coerce.date().optional(), lines: lines.default([]),
  discountAmount: returnMoney.default(0), vatAmount: returnMoney.default(0), refundAmount: returnMoney.default(0),
  refundMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']).default('CASH'),
  financialAccountId: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional()
});
export const returnVersionSchema = z.object({ expectedVersion: z.number().int().positive() });
export const updatePurchaseReturnSchema = createPurchaseReturnSchema.extend({ expectedVersion: z.number().int().positive() });
export const purchaseReturnQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  supplierId: z.coerce.number().int().positive().optional(), sourceReceiptId: z.coerce.number().int().positive().optional(),
  from: returnDate.optional(), to: returnDate.optional(),
  statuses: z.string().transform(value => value.split(',')).pipe(z.array(z.enum(['DRAFT', 'COMPLETED', 'CANCELLED'])).min(1)).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50)
}).refine(value => !value.from || !value.to || value.from <= value.to, 'Ngày bắt đầu phải trước ngày kết thúc');
export const purchaseReturnImportSchema = z.object({
  fileName: z.string().trim().max(255).regex(/\.xlsx?$/i),
  fileBase64: z.string().min(1).max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  supplierId: z.number().int().positive().optional(), sourceReceiptId: z.number().int().positive().optional()
});
export type PurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
export type PurchaseReturnQuery = z.infer<typeof purchaseReturnQuerySchema>;
