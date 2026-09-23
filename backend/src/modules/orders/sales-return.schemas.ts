import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');

const salesReturnQueryShape = {
  search: z.string().trim().max(120).optional(),
  from: dateOnly.optional(), to: dateOnly.optional(),
  statuses: z.string().transform(value => value.split(',').map(item => item.trim()).filter(Boolean)).pipe(z.array(z.enum(['COMPLETED', 'CANCELLED'])).min(1)).optional(),
  tableId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
};
const salesReturnQueryBaseSchema = z.object(salesReturnQueryShape);
export const salesReturnQuerySchema = salesReturnQueryBaseSchema.refine(value => !value.from || !value.to || value.from <= value.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });

export const salesReturnCreateSchema = z.object({
  orderId: z.number().int().positive(),
  lines: z.array(z.object({ orderItemId: z.number().int().positive(), quantity: z.number().int().positive() })).min(1).max(100)
    .refine(lines => new Set(lines.map(line => line.orderItemId)).size === lines.length, 'Mỗi dòng món chỉ được xuất hiện một lần'),
  refundMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']).default('CASH'),
  financialAccountId: z.number().int().positive().optional(),
  refundedAmount: z.number().int().nonnegative().optional(),
  note: z.string().trim().max(1000).optional()
});

export const salesReturnCandidateQuerySchema = z.object(salesReturnQueryShape).omit({ statuses: true });
export const salesReturnIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const salesReturnExportSchema = z.object({ ...salesReturnQueryShape, format: z.enum(['csv', 'xlsx']).default('csv') }).refine(value => !value.from || !value.to || value.from <= value.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });
export type SalesReturnQuery = z.infer<typeof salesReturnQuerySchema>;
export type SalesReturnCreateInput = z.infer<typeof salesReturnCreateSchema>;
export type SalesReturnCandidateQuery = z.infer<typeof salesReturnCandidateQuerySchema>;
