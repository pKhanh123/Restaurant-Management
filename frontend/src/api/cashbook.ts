import { getApiBaseUrl } from './config';
import type { ApiErrorResponse } from './contracts';

export type CashbookDirection = 'RECEIPT' | 'PAYMENT';
export type CashbookStatus = 'POSTED' | 'CANCELLED';
export type FinancialAccountType = 'CASH' | 'BANK' | 'E_WALLET';
export type CashbookPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'E_WALLET';

export interface CashbookFilter {
  search?: string;
  accountTypes?: FinancialAccountType[];
  accountIds?: number[];
  from?: string;
  to?: string;
  directions?: CashbookDirection[];
  categoryIds?: number[];
  statuses?: CashbookStatus[];
  affectsBusinessResult?: boolean;
  createdByUserIds?: number[];
  page?: number;
  pageSize?: number;
}

export interface FinancialAccountDto {
  id: number; code: string; name: string; type: FinancialAccountType; openingBalance: number; openingAt: string;
  bankName: string | null; accountNumber: string | null; walletProvider: string | null; walletIdentifier: string | null;
  isDefault: boolean; isActive: boolean;
}

export interface CashFlowCategoryDto {
  id: number; code: string; name: string; direction: CashbookDirection; affectsBusinessResultDefault: boolean;
  isSystem: boolean; isActive: boolean;
}

export interface CashbookSettingsDto {
  activatedAt: string | null; activatedByUserId: number | null; accounts: FinancialAccountDto[]; categories: CashFlowCategoryDto[];
}

export interface FinancialAccountCreateInput {
  code: string; name: string; type: FinancialAccountType; bankName?: string | null; accountNumber?: string | null;
  walletProvider?: string | null; walletIdentifier?: string | null; isDefault?: boolean;
}
export interface CashFlowCategoryCreateInput {
  code: string; name: string; direction: CashbookDirection; affectsBusinessResultDefault?: boolean;
}

export interface CashVoucherDto {
  id: number; code: string; direction: CashbookDirection; status: CashbookStatus; occurredAt: string; amount: number;
  accountId: number; categoryId: number; paymentMethod: CashbookPaymentMethod | null; note: string | null;
  counterpartyName: string | null; updatedAt: string; sourceType: string; sourceTransactionId: number | null; sourceCode: string | null;
  sourceInvoiceNumber: string | null; sourceInvoiceDate: string | null; account?: Pick<FinancialAccountDto, 'id' | 'code' | 'name' | 'type'>;
  category?: CashFlowCategoryDto; reversalOf?: Pick<CashVoucherDto, 'id' | 'code' | 'direction' | 'amount'> | null;
  reversal?: Pick<CashVoucherDto, 'id' | 'code' | 'occurredAt' | 'amount'> | null;
  [key: string]: unknown;
}

export interface CashbookListDto {
  items: CashVoucherDto[]; page: number; pageSize: number;
  balanceSummary: { openingBalance: number; closingBalance: number; accountCount: number; from: string | null; to: string | null };
  filteredSummary: { rowCount: number; totalReceipts: number; totalPayments: number; netMovement: number };
}

export interface ManualCashVoucherInput {
  direction: CashbookDirection; amount: number; accountId: number; categoryId: number;
  paymentMethod?: CashbookPaymentMethod | null; occurredAt?: string; reason?: string;
  counterpartyType?: string | null; counterpartyId?: number | null; counterpartyName?: string | null;
  note?: string | null; affectsBusinessResult?: boolean; linkedPurchaseReceiptId?: number | null;
  sourceInvoiceNumber?: string | null; sourceInvoiceDate?: string | null;
}

type QueryValue = string | number | boolean | Array<string | number> | undefined;

export function buildCashbookQuery(filter: CashbookFilter = {}, includePagination = true): string {
  const params = new URLSearchParams();
  const values: Record<string, QueryValue> = {
    search: filter.search?.trim() || undefined,
    accountTypes: filter.accountTypes,
    accountIds: filter.accountIds,
    from: filter.from,
    to: filter.to,
    directions: filter.directions,
    categoryIds: filter.categoryIds,
    statuses: filter.statuses,
    affectsBusinessResult: filter.affectsBusinessResult,
    createdByUserIds: filter.createdByUserIds,
    page: includePagination ? filter.page : undefined,
    pageSize: includePagination ? filter.pageSize : undefined
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function headers(token?: string | null, json = false): Record<string, string> {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function unwrap<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
    throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
  }
  return (await response.json() as { data: T }).data;
}

const root = () => `${getApiBaseUrl()}/api/cashbook`;

export async function fetchCashbookApi(token: string | null, filter: CashbookFilter = {}): Promise<CashbookListDto> {
  return unwrap(await fetch(`${root()}${buildCashbookQuery(filter)}`, { headers: headers(token) }), 'Lỗi tải sổ quỹ');
}

export async function fetchCashbookSettingsApi(token: string | null): Promise<CashbookSettingsDto> {
  return unwrap(await fetch(`${root()}/settings`, { headers: headers(token) }), 'Lỗi tải cấu hình sổ quỹ');
}

export async function getDefaultCashbookAccountId(token: string | null, method: CashbookPaymentMethod): Promise<number | null> {
  const settings = await fetchCashbookSettingsApi(token);
  const type: FinancialAccountType = method === 'CASH' ? 'CASH' : method === 'E_WALLET' ? 'E_WALLET' : 'BANK';
  return settings.accounts.find(account => account.isActive && account.type === type && account.isDefault)?.id ?? null;
}

export async function createCashbookAccountApi(token: string | null, input: FinancialAccountCreateInput): Promise<FinancialAccountDto> {
  return unwrap(await fetch(`${root()}/accounts`, { method: 'POST', headers: headers(token, true), body: JSON.stringify(input) }), 'Lỗi tạo tài khoản quỹ');
}

export async function createCashFlowCategoryApi(token: string | null, input: CashFlowCategoryCreateInput): Promise<CashFlowCategoryDto> {
  return unwrap(await fetch(`${root()}/categories`, { method: 'POST', headers: headers(token, true), body: JSON.stringify(input) }), 'Lỗi tạo danh mục thu chi');
}

export async function createCashVoucherApi(token: string | null, input: ManualCashVoucherInput, idempotencyKey: string): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${root()}/vouchers`, {
    method: 'POST', headers: { ...headers(token, true), 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input)
  }), 'Lỗi tạo phiếu thu/chi');
}

export async function fetchCashVoucherDetailApi(token: string | null, id: number): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${root()}/vouchers/${id}`, { headers: headers(token) }), 'Lỗi tải chi tiết phiếu');
}

export async function cancelCashVoucherApi(token: string | null, id: number, reason: string, expectedUpdatedAt: string): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${root()}/vouchers/${id}/cancel`, {
    method: 'POST', headers: headers(token, true), body: JSON.stringify({ reason, expectedUpdatedAt })
  }), 'Lỗi hủy phiếu thu/chi');
}

export async function fetchCashbookCounterpartiesApi(token: string | null, search = '', page = 1, pageSize = 25) {
  const params = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: String(pageSize) });
  return unwrap<{ items: Array<{ id: number; name: string; phone?: string | null; type: string }>; page: number; pageSize: number; total: number }>(
    await fetch(`${root()}/counterparties?${params}`, { headers: headers(token) }), 'Lỗi tìm người nộp/nhận'
  );
}

export async function fetchCashbookPurchaseInvoicesApi(token: string | null, search = '') {
  const params = new URLSearchParams({ search: search.trim() });
  return unwrap<Array<{ id: number; receiptCode: string; invoiceNumber: string | null; invoiceDate: string | null; supplierId: number; supplier: { name: string } }>>(
    await fetch(`${root()}/purchase-invoices?${params}`, { headers: headers(token) }), 'Lỗi tải hóa đơn đầu vào'
  );
}

export async function activateCashbookApi(token: string | null, input: { accounts: Array<{ accountId: number; openingBalance: number; openingAt: string }> }) {
  return unwrap(await fetch(`${root()}/activate`, { method: 'POST', headers: headers(token, true), body: JSON.stringify(input) }), 'Lỗi kích hoạt Sổ quỹ');
}

export async function downloadCashbookExportApi(token: string | null, filter: CashbookFilter, format: 'csv' | 'xlsx'): Promise<Blob> {
  const query = buildCashbookQuery(filter, false);
  const response = await fetch(`${root()}/export${query}${query ? '&' : '?'}format=${format}`, { headers: headers(token) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
    throw new Error(payload?.error?.message || `Lỗi xuất sổ quỹ (${response.status})`);
  }
  return response.blob();
}
