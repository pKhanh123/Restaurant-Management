import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./config', () => ({ getApiBaseUrl: () => 'http://cashbook.test' }));
import { buildCashbookQuery, cancelCashVoucherApi, createCashVoucherApi, fetchCashbookApi } from './cashbook';

describe('cashbook API contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes the backend list filter contract and separates pagination', () => {
    expect(buildCashbookQuery({
      search: '  cọc  ', accountTypes: ['CASH', 'BANK'], accountIds: [2, 5],
      from: '2026-10-01T00:00:00.000Z', directions: ['RECEIPT', 'PAYMENT'],
      categoryIds: [8], statuses: ['POSTED'], affectsBusinessResult: false,
      createdByUserIds: [4], page: 2, pageSize: 50
    })).toBe('?search=c%E1%BB%8Dc&accountTypes=CASH%2CBANK&accountIds=2%2C5&from=2026-10-01T00%3A00%3A00.000Z&directions=RECEIPT%2CPAYMENT&categoryIds=8&statuses=POSTED&affectsBusinessResult=false&createdByUserIds=4&page=2&pageSize=50');
    expect(buildCashbookQuery({ directions: ['RECEIPT'], page: 1 }, false)).toBe('?directions=RECEIPT');
  });

  it('uses the current list endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });
    vi.stubGlobal('fetch', fetchMock);
    await fetchCashbookApi('token', { directions: ['PAYMENT'] });
    expect(fetchMock.mock.calls[0][0]).toContain('/api/cashbook?directions=PAYMENT');
  });

  it('sends stable idempotency key for manual voucher creation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 7 } }) });
    vi.stubGlobal('fetch', fetchMock);
    await createCashVoucherApi('token', { direction: 'RECEIPT', amount: 1000, accountId: 1, categoryId: 2 }, 'cashbook-key-123');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/cashbook/vouchers');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'Idempotency-Key': 'cashbook-key-123' });
  });

  it('sends optimistic concurrency timestamp when cancelling', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 9 } }) });
    vi.stubGlobal('fetch', fetchMock);
    await cancelCashVoucherApi('token', 9, 'Nhập nhầm', '2026-10-02T08:00:00.000Z');
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ reason: 'Nhập nhầm', expectedUpdatedAt: '2026-10-02T08:00:00.000Z' }));
  });
});
