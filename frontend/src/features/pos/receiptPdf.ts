import type { OrderDto, OrderInvoiceDetailDto, OrderType, PaymentMethod, PaymentStatus } from '../../api/contracts';
import { createBrandedPrintHtml, escapeHtml } from '../../lib/pdfExport';

const currency = (amount: number) => `${amount.toLocaleString('vi-VN')} ₫`;

type ReceiptPdfOrder = {
  code: string;
  createdAt: string;
  paidAt?: string | null;
  orderType: OrderType;
  tableId?: number | null;
  tableNumber?: number | null;
  buzzerNumber?: number | null;
  deliveryPartner?: { name: string } | null;
  deliveryPartnerName?: string | null;
  deliveryAddress?: string | null;
  customerName?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  items: Array<{
    menuItemId: number;
    menuItemName: string;
    selectedModifiersJson?: unknown;
    notes?: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  totalAmount: number;
  discountAmount?: number;
  deliveryFee?: number;
  voucherCode?: string | null;
  vatAmount: number;
  finalAmount: number;
  paidAmount?: number;
  voidReason?: string | null;
  notes?: string | null;
};

type ReceiptModifier = { groupName: string; optionName: string; priceDelta: number };

function readModifiers(value: unknown): ReceiptModifier[] {
  if (!Array.isArray(value)) return [];
  return value.filter((modifier): modifier is ReceiptModifier => {
    if (typeof modifier !== 'object' || modifier === null) return false;
    const entry = modifier as Record<string, unknown>;
    return typeof entry.groupName === 'string' && typeof entry.optionName === 'string' && typeof entry.priceDelta === 'number';
  });
}

function formatReceiptDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : escapeHtml(date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

export function createReceiptPdfHtml(order: OrderDto | ReceiptPdfOrder): string {
  const date = formatReceiptDate(order.paidAt || order.createdAt);
  const deliveryPartnerName = order.deliveryPartner?.name || ('deliveryPartnerName' in order ? order.deliveryPartnerName : null);
  const customerName = 'customerName' in order ? order.customerName : null;
  const orderType = order.orderType === 'DINE_IN'
    ? `Dùng tại bàn ${order.tableNumber ?? order.tableId ?? '—'}`
    : order.orderType === 'DELIVERY'
      ? `Giao hàng${deliveryPartnerName ? ` · ${deliveryPartnerName}` : ''}${order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}`
      : `Mang đi${order.buzzerNumber ? ` · Số nhận ${order.buzzerNumber}` : ''}`;
  const paymentMethodLabels: Record<NonNullable<OrderDto['paymentMethod']>, string> = {
    CASH: 'Tiền mặt',
    BANK_TRANSFER: 'Chuyển khoản',
    CREDIT_CARD: 'Thẻ',
    E_WALLET: 'Ví điện tử'
  };
  const paymentMethod = order.paymentMethod ? paymentMethodLabels[order.paymentMethod] : 'Chưa ghi nhận';
  const paymentStatusLabels: Record<OrderDto['paymentStatus'], string> = {
    PAID: 'Đã thanh toán',
    VOIDED: 'Đã hủy',
    WAITING_CONFIRMATION: 'Chờ xác nhận',
    UNPAID: 'Chưa thanh toán'
  };
  const paymentStatus = paymentStatusLabels[order.paymentStatus];

  const items = order.items.map(item => {
    const modifiers = readModifiers(item.selectedModifiersJson).map(modifier =>
      `<div class="muted">${escapeHtml(modifier.groupName)}: ${escapeHtml(modifier.optionName)}${modifier.priceDelta > 0 ? ` (+${currency(modifier.priceDelta)})` : ''}</div>`
    ).join('');
    const note = item.notes ? `<div class="muted">Ghi chú: ${escapeHtml(item.notes)}</div>` : '';
    return `<tr><td><strong>${escapeHtml(item.menuItemName || `Món #${item.menuItemId}`)}</strong>${modifiers}${note}</td><td class="number">${item.quantity}</td><td class="number">${currency(item.unitPrice)}</td><td class="number">${currency(item.subtotal)}</td></tr>`;
  }).join('');

  const discount = order.discountAmount ?? 0;
  const deliveryFee = order.deliveryFee ?? 0;
  const cancellation = order.voidReason
    ? `<div class="notice">Đơn đã hủy - ${escapeHtml(order.voidReason)}</div>`
    : '';
  const orderNote = order.notes ? `<div class="notice">Ghi chú: ${escapeHtml(order.notes)}</div>` : '';
  const paidAmount = ('paidAmount' in order ? order.paidAmount : undefined) ?? (order.paymentStatus === 'PAID' ? order.finalAmount : 0);
  const outstandingAmount = Math.max(0, order.finalAmount - paidAmount);
  const content = `<main class="document">
    <header class="brand"><div class="brand-mark">CB</div><div><p class="brand-name">CRISPY BITE</p><div class="brand-caption">Fast food · Tươi ngon mỗi ngày</div></div><div class="document-type">Phiếu thanh toán<br><span class="muted">Bản lưu giao dịch</span></div></header>
    <h1 class="document-title">Hóa đơn bán hàng</h1><p class="document-subtitle">Cảm ơn bạn đã chọn Crispy Bite.</p>
    <section class="meta-grid"><div><span class="meta-label">Mã hóa đơn</span><span class="meta-value">${escapeHtml(order.code)}</span></div><div><span class="meta-label">Thời gian</span><span class="meta-value">${date}</span></div><div><span class="meta-label">Hình thức</span><span class="meta-value">${escapeHtml(orderType)}</span></div><div><span class="meta-label">Thanh toán</span><span class="meta-value">${escapeHtml(paymentStatus)} - ${escapeHtml(paymentMethod)}</span></div>${customerName ? `<div><span class="meta-label">Khách hàng</span><span class="meta-value">${escapeHtml(customerName)}</span></div>` : ''}</section>
    ${cancellation}${orderNote}
    <h2 class="section-title">Chi tiết đơn hàng</h2>
    <table><thead><tr><th>Món ăn</th><th class="number">SL</th><th class="number">Đơn giá</th><th class="number">Thành tiền</th></tr></thead><tbody>${items || '<tr><td colspan="4">Không có món hàng</td></tr>'}</tbody></table>
    <section class="summary avoid-break"><div class="summary-row"><span>Cộng tiền món</span><strong>${currency(order.totalAmount)}</strong></div>${discount > 0 ? `<div class="summary-row"><span>Giảm giá${order.voucherCode ? ` - ${escapeHtml(order.voucherCode)}` : ''}</span><strong>-${currency(discount)}</strong></div>` : ''}${deliveryFee > 0 ? `<div class="summary-row"><span>Phí giao hàng</span><strong>${currency(deliveryFee)}</strong></div>` : ''}<div class="summary-row"><span>Thuế GTGT</span><strong>${currency(order.vatAmount)}</strong></div>${paidAmount > 0 ? `<div class="summary-row"><span>Đã thanh toán</span><strong>${currency(paidAmount)}</strong></div>` : ''}${outstandingAmount > 0 ? `<div class="summary-row"><span>Còn phải thu</span><strong>${currency(outstandingAmount)}</strong></div>` : ''}<div class="summary-row summary-total"><span>Tổng thanh toán</span><span>${currency(order.finalAmount)}</span></div></section>
    <footer class="footer"><strong>Cảm ơn bạn, hẹn gặp lại!</strong>Vui lòng giữ lại phiếu này để đối chiếu giao dịch.</footer>
  </main>`;
  return createBrandedPrintHtml(`Hoa don ${order.code}`, content);
}

export function createOrderInvoicePdfHtml(invoice: OrderInvoiceDetailDto): string {
  return createReceiptPdfHtml({
    code: invoice.code,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
    orderType: invoice.orderType,
    tableNumber: invoice.tableNumber,
    buzzerNumber: invoice.buzzerNumber,
    deliveryPartnerName: invoice.deliveryPartnerName,
    deliveryAddress: invoice.deliveryAddress,
    customerName: invoice.customerName,
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    items: invoice.items.map(item => ({
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      selectedModifiersJson: item.selectedModifiers,
      notes: item.notes,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal
    })),
    totalAmount: invoice.totalGoods,
    discountAmount: invoice.discountAmount,
    deliveryFee: invoice.deliveryFee,
    voucherCode: invoice.voucherCode,
    vatAmount: invoice.vatAmount,
    finalAmount: invoice.finalAmount,
    paidAmount: invoice.paidAmount,
    voidReason: invoice.voidReason,
    notes: invoice.notes
  });
}
