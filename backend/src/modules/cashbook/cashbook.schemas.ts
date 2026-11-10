import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

const id = z.number().int().positive();
const dateTime = z.string().datetime({ offset: true });
const direction = z.enum(['RECEIPT', 'PAYMENT']);
const status = z.enum(['POSTED', 'CANCELLED']);
const accountType = z.enum(['CASH', 'BANK', 'E_WALLET']);
const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']);

function listOf<S extends z.ZodTypeAny>(schema: S, max: number) {
  return z.preprocess(value => {
    if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
    return value;
  }, z.array(schema).max(max)).optional();
}

const listQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  accountTypes: listOf(accountType, 3),
  accountIds: listOf(z.coerce.number().int().positive(), 100),
  from: dateTime.optional(),
  to: dateTime.optional(),
  directions: listOf(direction, 2),
  categoryIds: listOf(z.coerce.number().int().positive(), 200),
  statuses: listOf(status, 2),
  affectsBusinessResult: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean()).optional(),
  createdByUserIds: listOf(z.coerce.number().int().positive(), 200),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
}).strict().superRefine((value, context) => {
  if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Ngày bắt đầu phải trước ngày kết thúc' });
  }
});

const manualVoucherSchema = z.object({
  direction,
  amount: z.number().int().positive().max(2_000_000_000),
  accountId: id,
  categoryId: id,
  paymentMethod: paymentMethod.nullable().optional(),
  occurredAt: dateTime.optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  counterpartyType: z.string().trim().min(1).max(50).nullable().optional(),
  counterpartyId: id.nullable().optional(),
  counterpartyName: z.string().trim().min(1).max(160).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  affectsBusinessResult: z.boolean().optional(),
  linkedPurchaseReceiptId: id.nullable().optional(),
  sourceInvoiceNumber: z.string().trim().max(100).nullable().optional(),
  sourceInvoiceDate: dateTime.nullable().optional()
}).strict();

const cancelVoucherSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  expectedUpdatedAt: dateTime
}).strict();

const exportQuerySchema = z.object({ format: z.enum(['csv', 'xlsx']).default('csv') }).strict();
const accountFields = {
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  type: accountType,
  bankName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(100).nullable().optional(),
  walletProvider: z.string().trim().max(120).nullable().optional(),
  walletIdentifier: z.string().trim().max(100).nullable().optional(),
  isDefault: z.boolean().optional()
};
const accountCreateSchema = z.object(accountFields).strict();
const accountUpdateSchema = z.object({
  name: accountFields.name.optional(), bankName: accountFields.bankName,
  accountNumber: accountFields.accountNumber, walletProvider: accountFields.walletProvider,
  walletIdentifier: accountFields.walletIdentifier, isDefault: accountFields.isDefault,
  isActive: z.boolean().optional()
}).strict().refine(value => Object.values(value).some(item => item !== undefined));
const categoryCreateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120), direction,
  affectsBusinessResultDefault: z.boolean().default(false)
}).strict();
const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  affectsBusinessResultDefault: z.boolean().optional(), isActive: z.boolean().optional()
}).strict().refine(value => Object.values(value).some(item => item !== undefined));
const activationSchema = z.object({
  accounts: z.array(z.object({ accountId: id, openingBalance: z.number().int().min(0).max(2_000_000_000), openingAt: dateTime }).strict()).min(1).max(50)
}).strict();
const partySchema = z.object({ name: z.string().trim().min(2).max(160), phone: z.string().trim().max(30).nullable().optional(), note: z.string().trim().max(500).nullable().optional() }).strict();
const searchQuerySchema = z.object({ search: z.string().trim().max(160).default(''), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const routeIdSchema = z.coerce.number().int().positive();
const keySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, message: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.badRequest(message);
  return result.data;
}

export type CashbookListQuery = z.output<typeof listQuerySchema> & {
  accountTypes?: Array<z.infer<typeof accountType>>;
  directions?: Array<z.infer<typeof direction>>;
  statuses?: Array<z.infer<typeof status>>;
};
export type ManualVoucherInput = z.output<typeof manualVoucherSchema> & { clientRequestId: string };
export type CancelVoucherInput = z.output<typeof cancelVoucherSchema>;
export type CashbookAccountCreateInput = z.output<typeof accountCreateSchema>;
export type CashbookAccountUpdateInput = z.output<typeof accountUpdateSchema>;
export type CashbookCategoryCreateInput = z.output<typeof categoryCreateSchema>;
export type CashbookCategoryUpdateInput = z.output<typeof categoryUpdateSchema>;
export type CashbookActivationInput = z.output<typeof activationSchema>;
export type CashbookPartyInput = z.output<typeof partySchema>;
export type CashbookSearchQuery = z.output<typeof searchQuerySchema>;

export function parseCashbookListQuery(value: unknown): CashbookListQuery {
  const result = parse(listQuerySchema, value, 'Bộ lọc Sổ quỹ không hợp lệ');
  return {
    ...result,
    accountTypes: result.accountTypes ? [...new Set(result.accountTypes)] : undefined,
    accountIds: result.accountIds ? [...new Set(result.accountIds)].sort((a, b) => a - b) : undefined,
    directions: result.directions ? [...new Set(result.directions)] : undefined,
    categoryIds: result.categoryIds ? [...new Set(result.categoryIds)].sort((a, b) => a - b) : undefined,
    statuses: result.statuses ? [...new Set(result.statuses)] : undefined,
    createdByUserIds: result.createdByUserIds ? [...new Set(result.createdByUserIds)].sort((a, b) => a - b) : undefined
  };
}

export function parseManualVoucherInput(value: unknown, idempotencyKey: unknown): ManualVoucherInput {
  return { ...parse(manualVoucherSchema, value, 'Thông tin phiếu thu/chi không hợp lệ'), clientRequestId: parse(keySchema, idempotencyKey, 'Idempotency-Key không hợp lệ') };
}

export function parseCancelVoucherInput(value: unknown): CancelVoucherInput {
  return parse(cancelVoucherSchema, value, 'Thông tin hủy phiếu không hợp lệ');
}

export function parseCashbookRouteId(value: unknown): number {
  return parse(routeIdSchema, value, 'Mã phiếu không hợp lệ');
}

export function parseCashbookExportQuery(value: unknown) {
  return parse(exportQuerySchema, value, 'Định dạng xuất Sổ quỹ không hợp lệ');
}

export function parseCashbookAccountCreateInput(value: unknown): CashbookAccountCreateInput { return parse(accountCreateSchema, value, 'Thông tin tài khoản quỹ không hợp lệ'); }
export function parseCashbookAccountUpdateInput(value: unknown): CashbookAccountUpdateInput { return parse(accountUpdateSchema, value, 'Thông tin tài khoản quỹ không hợp lệ'); }
export function parseCashbookCategoryCreateInput(value: unknown): CashbookCategoryCreateInput { return parse(categoryCreateSchema, value, 'Thông tin danh mục thu chi không hợp lệ'); }
export function parseCashbookCategoryUpdateInput(value: unknown): CashbookCategoryUpdateInput { return parse(categoryUpdateSchema, value, 'Thông tin danh mục thu chi không hợp lệ'); }
export function parseCashbookActivationInput(value: unknown): CashbookActivationInput { return parse(activationSchema, value, 'Số dư đầu kỳ không hợp lệ'); }
export function parseCashbookPartyInput(value: unknown): CashbookPartyInput { return parse(partySchema, value, 'Thông tin đối tượng thu chi không hợp lệ'); }
export function parseCashbookSearchQuery(value: unknown): CashbookSearchQuery { return parse(searchQuerySchema, value, 'Từ khóa tìm kiếm không hợp lệ'); }
