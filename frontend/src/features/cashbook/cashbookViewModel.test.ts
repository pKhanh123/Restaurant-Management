import { describe, expect, it } from 'vitest';
import { getCashbookSummaryCards, getVoucherRelationshipLabel } from './cashbookViewModel';

describe('cashbook view model', () => {
  it('keeps actual account balance separate from filtered movement totals', () => {
    expect(getCashbookSummaryCards({ openingBalance: 500_000, closingBalance: 700_000, accountCount: 2, from: null, to: null }, {
      rowCount: 3, totalReceipts: 400_000, totalPayments: 200_000, netMovement: 200_000
    })).toEqual([
      { key: 'balance', label: 'Số dư thực của quỹ', amount: 700_000, detail: 'Số dư đầu kỳ 500.000 ₫' },
      { key: 'receipts', label: 'Tổng thu theo bộ lọc', amount: 400_000, detail: 'Theo 3 chứng từ' },
      { key: 'payments', label: 'Tổng chi theo bộ lọc', amount: 200_000, detail: 'Theo 3 chứng từ' },
      { key: 'movement', label: 'Thuần theo bộ lọc', amount: 200_000, detail: 'Không phải số dư quỹ' }
    ]);
  });

  it('labels both sides of a reversal so it can be reconciled', () => {
    expect(getVoucherRelationshipLabel({ id: 2, reversalOf: { id: 1, code: 'PT-001', direction: 'RECEIPT', amount: 1 }, reversal: null })).toBe('Bút toán đảo của PT-001');
    expect(getVoucherRelationshipLabel({ id: 1, reversalOf: null, reversal: { id: 2, code: 'PC-002', occurredAt: '2026-10-01T00:00:00.000Z', amount: 1 } })).toBe('Đã được đảo bởi PC-002');
    expect(getVoucherRelationshipLabel({ id: 3, reversalOf: null, reversal: null })).toBeNull();
  });
});
