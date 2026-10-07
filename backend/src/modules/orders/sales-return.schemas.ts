import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');

const salesReturnQueryShape = {
  search: z.preprocess(value => (value === '' || value === null ? undefined : value), z.string().trim().max(120).optional()),
  from: z.preprocess(value => {
    if (!value || value === '' || value === null) return undefined;
    if (typeof value === 'string' && value.includes('T')) return value.slice(0, 10);
    return value;
  }, dateOnly.optional()),
  to: z.preprocess(value => {
    if (!value || value === '' || value === null) return undefined;
    if (typeof value === 'string' && value.includes('T')) return value.slice(0, 10);
    return value;
  }, dateOnly.optional()),
  statuses: z.preprocess(value => {
    if (value === undefined || value === null || value === '') return undefined;
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean);
  }, z.array(z.enum(['COMPLETED', 'CANCELLED'])).min(1).optional()),
  tableId: z.preprocess(value => (value === '' || value === null || value === undefined ? undefined : value), z.coerce.number().int().positive().optional()),
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

const salesReturnIdempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export function parseSalesReturnIdempotencyKey(value: unknown): string {
  const result = salesReturnIdempotencyKeySchema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Idempotency-Key phiếu trả hàng không hợp lệ');
  return result.data;
}

export const salesReturnCandidateQuerySchema = z.object(salesReturnQueryShape).omit({ statuses: true });
export const salesReturnIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const salesReturnExportSchema = z.object({ ...salesReturnQueryShape, format: z.enum(['csv', 'xlsx']).default('csv') }).refine(value => !value.from || !value.to || value.from <= value.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });
export type SalesReturnQuery = z.infer<typeof salesReturnQuerySchema>;
export type SalesReturnCreateInput = z.infer<typeof salesReturnCreateSchema>;
export type SalesReturnCandidateQuery = z.infer<typeof salesReturnCandidateQuerySchema>;
