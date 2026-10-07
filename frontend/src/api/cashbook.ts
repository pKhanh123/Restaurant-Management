import { getApiBaseUrl } from './config';
import type {
  ApiErrorResponse,
  CashbookActivationInput,
  CashbookCounterpartyDto,
  CashbookFilter,
  CashbookListDto,
  CashbookPurchaseInvoiceDto,
  CashbookSettingsDto,
  CashFlowCategoryDto,
  CashFlowCategoryInput,
  CashVoucherDto,
  CashVoucherInput,
  FinancialAccountDto,
  FinancialAccountInput
} from './contracts';

function authHeaders(token?: string | null, json = false): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {})
  };
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

async function unwrap<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) await throwApiError(response, fallback);
  return (await response.json() as { data: T }).data;
}

export function buildCashbookQuery(filter: CashbookFilter = {}, includePagination = true): string {
  const params = new URLSearchParams();
  if (filter.search?.trim()) params.set('q', filter.search.trim());
  if (filter.direction) params.set('direction', filter.direction);
  if (filter.status) params.set('status', filter.status);
  if (filter.accountId !== undefined) params.set('accountId', String(filter.accountId));
  if (filter.accountType) params.set('accountType', filter.accountType);
  if (filter.categoryId !== undefined) params.set('categoryId', String(filter.categoryId));
  if (filter.affectsBusinessResult !== undefined) params.set('affectsBusinessResult', String(filter.affectsBusinessResult));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (includePagination && filter.page !== undefined) params.set('page', String(filter.page));
  if (includePagination && filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchCashbookApi(token: string | null, filter: CashbookFilter = {}): Promise<CashbookListDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers${buildCashbookQuery(filter)}`, { headers: authHeaders(token) });
  return unwrap(response, 'Lỗi tải sổ quỹ');
}

export async function fetchCashbookSettingsApi(token: string | null): Promise<CashbookSettingsDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/settings`, { headers: authHeaders(token) }), 'Lỗi tải cấu hình sổ quỹ');
}

export async function activateCashbookApi(token: string | null, input: CashbookActivationInput): Promise<CashbookSettingsDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/activate`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi kích hoạt sổ quỹ');
}

export async function fetchFinancialAccountsApi(token: string | null): Promise<FinancialAccountDto[]> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/accounts`, { headers: authHeaders(token) }), 'Lỗi tải tài khoản quỹ');
}

export async function createFinancialAccountApi(token: string | null, input: FinancialAccountInput): Promise<FinancialAccountDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/accounts`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi tạo tài khoản quỹ');
}

export async function updateFinancialAccountApi(token: string | null, id: number, input: Partial<FinancialAccountInput>): Promise<FinancialAccountDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/accounts/${id}`, {
    method: 'PATCH', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi cập nhật tài khoản quỹ');
}

export async function fetchCashFlowCategoriesApi(token: string | null): Promise<CashFlowCategoryDto[]> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/categories`, { headers: authHeaders(token) }), 'Lỗi tải loại thu chi');
}

export async function createCashFlowCategoryApi(token: string | null, input: CashFlowCategoryInput): Promise<CashFlowCategoryDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/categories`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi tạo loại thu chi');
}

export async function updateCashFlowCategoryApi(token: string | null, id: number, input: Partial<Omit<CashFlowCategoryInput, 'code' | 'direction'>>): Promise<CashFlowCategoryDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/categories/${id}`, {
    method: 'PATCH', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi cập nhật loại thu chi');
}

export async function fetchCashbookCounterpartiesApi(token: string | null, search = ''): Promise<CashbookCounterpartyDto[]> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/counterparties${query}`, { headers: authHeaders(token) }), 'Lỗi tìm người nộp/nhận');
}

export async function createFinancialPartyApi(token: string | null, input: { name: string; phone?: string | null; note?: string | null }): Promise<CashbookCounterpartyDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/parties`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi tạo người nộp/nhận');
}

export async function fetchCashbookPurchaseInvoicesApi(token: string | null, search = ''): Promise<CashbookPurchaseInvoiceDto[]> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/purchase-invoices${query}`, { headers: authHeaders(token) }), 'Lỗi tải hóa đơn đầu vào');
}

export async function createCashVoucherApi(token: string | null, input: CashVoucherInput): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify(input)
  }), 'Lỗi tạo phiếu thu/chi');
}

export async function fetchCashVoucherDetailApi(token: string | null, id: number): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers/${id}`, { headers: authHeaders(token) }), 'Lỗi tải phiếu thu/chi');
}

export async function fetchCashVoucherPrintApi(token: string | null, id: number): Promise<CashVoucherDto> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers/${id}/print`, { headers: authHeaders(token) }), 'Lỗi tải dữ liệu in phiếu');
}

export async function cancelCashVoucherApi(token: string | null, id: number, reason: string): Promise<{ cancelled: CashVoucherDto; reversal: CashVoucherDto }> {
  return unwrap(await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers/${id}/cancel`, {
    method: 'POST', headers: authHeaders(token, true), body: JSON.stringify({ reason })
  }), 'Lỗi hủy phiếu thu/chi');
}

export async function downloadCashbookExportApi(token: string | null, filter: CashbookFilter = {}, format: 'csv' | 'xlsx' = 'xlsx'): Promise<Blob> {
  const query = buildCashbookQuery(filter, false);
  const separator = query ? '&' : '?';
  const response = await fetch(`${getApiBaseUrl()}/api/cashbook/vouchers/export${query}${separator}format=${format}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi xuất sổ quỹ');
  return response.blob();
}
