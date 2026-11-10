import type { CashVoucherDto, CashbookListDto } from '../../api/cashbook';

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}\u00a0₫`;
}

export function getCashbookSummaryCards(balance: CashbookListDto['balanceSummary'], filtered: CashbookListDto['filteredSummary']) {
  return [
    { key: 'balance', label: 'Số dư thực của quỹ', amount: balance.closingBalance, detail: `Số dư đầu kỳ ${formatVnd(balance.openingBalance)}` },
    { key: 'receipts', label: 'Tổng thu theo bộ lọc', amount: filtered.totalReceipts, detail: `Theo ${filtered.rowCount} chứng từ` },
    { key: 'payments', label: 'Tổng chi theo bộ lọc', amount: filtered.totalPayments, detail: `Theo ${filtered.rowCount} chứng từ` },
    { key: 'movement', label: 'Thuần theo bộ lọc', amount: filtered.netMovement, detail: 'Không phải số dư quỹ' }
  ] as const;
}

export function getVoucherRelationshipLabel(voucher: Pick<CashVoucherDto, 'id' | 'reversalOf' | 'reversal'>): string | null {
  if (voucher.reversalOf) return `Bút toán đảo của ${voucher.reversalOf.code}`;
  if (voucher.reversal) return `Đã được đảo bởi ${voucher.reversal.code}`;
  return null;
}

export function getVoucherStatusLabel(status: CashVoucherDto['status']): string {
  return status === 'POSTED' ? 'Đã ghi sổ' : 'Đã hủy';
}

const sourceTypeLabels: Record<string, string> = {
  MANUAL: 'Phiếu thủ công', RESERVATION_DEPOSIT: 'Thu cọc đặt bàn', RESERVATION_REFUND: 'Hoàn cọc đặt bàn',
  ORDER_PAYMENT: 'Thanh toán đơn hàng', SALES_RETURN_REFUND: 'Hoàn tiền trả hàng',
  PURCHASE_RECEIPT_PAYMENT: 'Thanh toán nhập hàng', SUPPLIER_PAYMENT: 'Thanh toán công nợ nhà cung cấp',
  PURCHASE_RETURN_REFUND: 'Nhận hoàn tiền trả hàng', PAYROLL_PAYMENT: 'Chi lương', REVERSAL: 'Bút toán đảo'
};

export function getVoucherSourceTypeLabel(sourceType: string): string {
  return sourceTypeLabels[sourceType] ?? sourceType;
}
