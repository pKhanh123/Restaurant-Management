import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { CashVoucherDto } from '../../api/contracts';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

function money(value: number) { return new Intl.NumberFormat('vi-VN').format(value) + ' ₫'; }

export function cashVoucherHtml(voucher: CashVoucherDto) {
  const direction = voucher.direction === 'RECEIPT' ? 'PHIẾU THU' : 'PHIẾU CHI';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#172033;padding:32px}h1{text-align:center;color:#0878f9;margin-bottom:4px}
    .code{text-align:center;margin-bottom:28px}.row{display:flex;border-bottom:1px solid #dde4ee;padding:10px 0}.label{width:180px;color:#5e6b7d}.value{font-weight:600;flex:1}
    .amount{font-size:24px;color:${voucher.direction === 'RECEIPT' ? '#0878f9' : '#dc2626'}}.signatures{display:flex;justify-content:space-between;margin-top:72px;text-align:center}
  </style></head><body><h1>${direction}</h1><div class="code">Mã phiếu: ${escapeHtml(voucher.code)}</div>
  <div class="row"><div class="label">Thời gian</div><div class="value">${escapeHtml(new Date(voucher.occurredAt).toLocaleString('vi-VN'))}</div></div>
  <div class="row"><div class="label">Loại thu/chi</div><div class="value">${escapeHtml(voucher.category?.name || voucher.sourceCode || 'Khác')}</div></div>
  <div class="row"><div class="label">Tài khoản</div><div class="value">${escapeHtml(voucher.account?.name || '')}</div></div>
  <div class="row"><div class="label">Người nộp/nhận</div><div class="value">${escapeHtml(voucher.counterpartyName || '')}</div></div>
  <div class="row"><div class="label">Số tiền</div><div class="value amount">${escapeHtml(money(voucher.amount))}</div></div>
  <div class="row"><div class="label">Ghi chú</div><div class="value">${escapeHtml(voucher.note || '—')}</div></div>
  <div class="signatures"><div>Người lập phiếu<br><br><br><b>${escapeHtml(voucher.handlerName || '')}</b></div><div>Người nộp/nhận<br><br><br><b>${escapeHtml(voucher.counterpartyName || '')}</b></div></div>
  </body></html>`;
}

export async function printCashVoucher(voucher: CashVoucherDto) {
  const html = cashVoucherHtml(voucher);
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Trình duyệt không hỗ trợ in phiếu');
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) throw new Error('Vui lòng cho phép cửa sổ bật lên để in phiếu');
    popup.document.write(html); popup.document.close(); popup.focus(); popup.print();
    return;
  }
  const result = await Print.printToFileAsync({ html });
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị không hỗ trợ chia sẻ bản in');
  await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: `Phiếu ${voucher.code}` });
}
