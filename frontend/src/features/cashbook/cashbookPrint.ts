import type { CashVoucherDto } from '../../api/cashbook';
import { getVoucherSourceTypeLabel } from './cashbookViewModel';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const vnd = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];

function readHundreds(value: number, full: boolean): string {
  const hundred = Math.floor(value / 100); const tens = Math.floor((value % 100) / 10); const unit = value % 10;
  const words: string[] = [];
  if (hundred || full) words.push(`${digits[hundred]} trăm`);
  if (tens === 0 && unit > 0) words.push(`${hundred || full ? 'lẻ ' : ''}${digits[unit]}`);
  else if (tens === 1) words.push(`mười${unit === 5 ? ' lăm' : unit ? ` ${digits[unit]}` : ''}`);
  else if (tens > 1) words.push(`${digits[tens]} mươi${unit === 1 ? ' mốt' : unit === 4 ? ' tư' : unit === 5 ? ' lăm' : unit ? ` ${digits[unit]}` : ''}`);
  return words.join(' ');
}

export function amountInVietnameseWords(amount: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  if (safe === 0) return 'Không đồng';
  const groups: number[] = []; let remaining = safe;
  while (remaining > 0) { groups.push(remaining % 1000); remaining = Math.floor(remaining / 1000); }
  const words = groups.map((group, index) => group ? `${readHundreds(group, index < groups.length - 1)}${scales[index] ? ` ${scales[index]}` : ''}` : '').filter(Boolean).reverse().join(' ');
  return `${words.charAt(0).toLocaleUpperCase('vi-VN')}${words.slice(1)} đồng`;
}

export function buildCashVoucherPrintHtml(voucher: CashVoucherDto): string {
  const direction = voucher.direction === 'RECEIPT' ? 'PHIẾU THU' : 'PHIẾU CHI';
  const rows: Array<[string, string]> = [
    ['Số phiếu', voucher.code],
    ['Ngày ghi nhận', new Date(voucher.occurredAt).toLocaleString('vi-VN')],
    ['Tài khoản quỹ', voucher.account?.name ?? `Quỹ #${voucher.accountId}`],
    ['Danh mục', voucher.category?.name ?? `Danh mục #${voucher.categoryId}`],
    ['Nghiệp vụ nguồn', getVoucherSourceTypeLabel(voucher.sourceType)],
    ['Chứng từ nguồn', voucher.sourceCode ?? '—'],
    ['Số hóa đơn', voucher.sourceInvoiceNumber ?? '—'],
    ...(voucher.sourceInvoiceDate ? [['Ngày hóa đơn', new Date(voucher.sourceInvoiceDate).toLocaleDateString('vi-VN')] as [string, string]] : []),
    ['Người nộp / nhận', voucher.counterpartyName ?? '—'],
    ['Nội dung', voucher.note ?? '—'],
    ['Trạng thái', voucher.status === 'POSTED' ? 'Đã ghi sổ' : 'Đã hủy']
  ];
  const fields = rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  const reversal = voucher.reversalOf ? `<p class="relation">Bút toán đảo của ${escapeHtml(voucher.reversalOf.code)}</p>` : voucher.reversal ? `<p class="relation">Đã được đảo bởi ${escapeHtml(voucher.reversal.code)}</p>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(direction)} ${escapeHtml(voucher.code)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#211f1c;margin:32px auto;max-width:760px;padding:0 24px}h1{text-align:center;font-size:22px;margin:8px 0}.sub{text-align:center;color:#625d57;margin:0 0 24px}.amount{text-align:center;font-size:28px;font-weight:700;margin:24px}.relation{border:1px solid #c66a15;background:#fff1dd;color:#8a480b;padding:10px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:11px;text-align:left;vertical-align:top}th{color:#625d57;font-weight:500;width:34%}.signatures{display:flex;justify-content:space-between;text-align:center;margin-top:60px}.signatures div{width:30%}.signatures small{display:block;margin-top:70px;color:#625d57}@media print{body{margin:0 auto;max-width:none}.no-print{display:none}}
  </style></head><body><p class="sub">SỔ QUỸ</p><h1>${escapeHtml(direction)}</h1><p class="sub">${escapeHtml(voucher.code)}</p><div class="amount">${escapeHtml(vnd(voucher.amount))}</div><p class="sub">Bằng chữ: ${escapeHtml(amountInVietnameseWords(voucher.amount))}</p><table>${fields}</table>${reversal}<div class="signatures"><div>Người lập<small>(Ký, ghi rõ họ tên)</small></div><div>Người nộp / nhận<small>(Ký, ghi rõ họ tên)</small></div><div>Quản lý<small>(Ký, ghi rõ họ tên)</small></div></div><script>window.onload=()=>window.print()</script></body></html>`;
}

export function printCashVoucher(voucher: CashVoucherDto): boolean {
  if (typeof window === 'undefined') return false;
  const target = window.open('', '_blank', 'width=900,height=700');
  if (!target) return false;
  target.opener = null;
  target.document.open(); target.document.write(buildCashVoucherPrintHtml(voucher)); target.document.close();
  return true;
}
