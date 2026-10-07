import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCashbookQuery,
  createCashVoucherApi,
  downloadCashbookExportApi,
  fetchCashbookApi
} from './cashbook';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('cashbook API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('serializes every list filter in a stable order', () => {
    expect(buildCashbookQuery({
      search: ' PT0001 ',
      direction: 'RECEIPT',
      status: 'POSTED',
      accountId: 3,
      accountType: 'BANK',
      categoryId: 7,
      affectsBusinessResult: false,
      from: '2026-09-01T00:00:00.000+07:00',
      to: '2026-09-30T23:59:59.999+07:00',
      page: 2,
      pageSize: 25
    })).toBe('?q=PT0001&direction=RECEIPT&status=POSTED&accountId=3&accountType=BANK&categoryId=7&affectsBusinessResult=false&from=2026-09-01T00%3A00%3A00.000%2B07%3A00&to=2026-09-30T23%3A59%3A59.999%2B07%3A00&page=2&pageSize=25');
  });

  it('loads vouchers with JWT auth and unwraps the data envelope', async () => {
    const data = { items: [], summary: {}, pagination: {} };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });

    await expect(fetchCashbookApi('token', { accountType: 'CASH', page: 1 })).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/cashbook/vouchers?accountType=CASH&page=1',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('posts a manual voucher as JSON', async () => {
    const voucher = { id: 11, code: 'PT000011' };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: voucher }) });
    const input = {
      direction: 'RECEIPT' as const,
      paymentMethod: 'CASH' as const,
      categoryId: 2,
      amount: 150_000,
      occurredAt: '2026-09-23T11:23:00.000+07:00',
      counterpartyName: 'Khách lẻ',
      affectsBusinessResult: true
    };

    await expect(createCashVoucherApi('token', input)).resolves.toEqual(voucher);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/cashbook/vouchers', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
  });

  it('exports filters without pagination and keeps backend errors', async () => {
    const blob = new Blob(['cashbook']);
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => blob });
    await expect(downloadCashbookExportApi('token', { direction: 'PAYMENT', page: 4, pageSize: 10 }, 'xlsx')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.test/api/cashbook/vouchers/export?direction=PAYMENT&format=xlsx',
      { headers: { Authorization: 'Bearer token' } }
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: 'Sổ quỹ chưa được kích hoạt' } })
    });
    await expect(fetchCashbookApi('token')).rejects.toThrow('Sổ quỹ chưa được kích hoạt');
  });
});
