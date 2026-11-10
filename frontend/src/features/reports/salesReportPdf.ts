import type { DailyReportDto } from '../../api/contracts';
import { createBrandedPrintHtml, escapeHtml } from '../../lib/pdfExport';

const currency = (amount: number) => `${amount.toLocaleString('vi-VN')} ₫`;

function formatReportDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(date) : escapeHtml(parsed.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'long' }));
}

export function createSalesReportPdfHtml(report: DailyReportDto): string {
  const inProgress = Math.max(0, report.totalOrders - report.completedOrders - report.cancelledOrders);
  const totalPayments = (report.paymentBreakdown?.cash.total ?? 0)
    + (report.paymentBreakdown?.bankTransfer.total ?? 0)
    + (report.paymentBreakdown?.other.total ?? 0);
  const cashPercent = totalPayments ? (report.paymentBreakdown?.cash.total ?? 0) / totalPayments * 100 : 0;
  const bankPercent = totalPayments ? (report.paymentBreakdown?.bankTransfer.total ?? 0) / totalPayments * 100 : 0;
  const otherPercent = totalPayments ? (report.paymentBreakdown?.other.total ?? 0) / totalPayments * 100 : 0;
  const formatPercent = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  const topSellers = report.topSellers.length
    ? report.topSellers.map((item, index) => `<tr><td class="number">${index + 1}</td><td><strong>${escapeHtml(item.name)}</strong></td><td class="number">${item.quantitySold.toLocaleString('vi-VN')}</td><td class="number">${currency(item.revenue)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">Chưa có món bán trong ngày này.</td></tr>';
  const paymentRows = [
    { label: 'Tiền mặt', value: report.paymentBreakdown?.cash },
    { label: 'Chuyển khoản', value: report.paymentBreakdown?.bankTransfer },
    { label: 'Phương thức khác', value: report.paymentBreakdown?.other }
  ].map(item => `<tr><td>${item.label}</td><td class="number">${(item.value?.count ?? 0).toLocaleString('vi-VN')}</td><td class="number">${currency(item.value?.total ?? 0)}</td></tr>`).join('');
  const profit = report.profitSummary
    ? `<section class="metric-grid"><div class="metric"><div class="metric-label">Giá vốn</div><div class="metric-value">${currency(report.profitSummary.totalCogs)}</div></div><div class="metric"><div class="metric-label">Lợi nhuận gộp - biên ${report.profitSummary.grossMargin.toLocaleString('vi-VN')}%</div><div class="metric-value">${currency(report.profitSummary.grossProfit)}</div></div></section>`
    : '';
  const generatedAt = escapeHtml(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const content = `<main class="document">
    <header class="brand"><div class="brand-mark">CB</div><div><p class="brand-name">CRISPY BITE</p><div class="brand-caption">Báo cáo vận hành nhà hàng</div></div><div class="document-type">Bán hàng<br><span class="muted">Báo cáo ngày</span></div></header>
    <h1 class="document-title">Hiệu quả bán hàng</h1><p class="document-subtitle">Tổng hợp doanh thu và hoạt động ngày ${formatReportDate(report.date)}.</p>
    <section class="metric-grid"><div class="metric"><div class="metric-label">Doanh thu · gồm VAT</div><div class="metric-value">${currency(report.totalRevenue)}</div></div><div class="metric"><div class="metric-label">Đơn hoàn tất / tổng đơn</div><div class="metric-value">${report.completedOrders.toLocaleString('vi-VN')} <span class="muted">/ ${report.totalOrders.toLocaleString('vi-VN')}</span></div></div><div class="metric"><div class="metric-label">Giá trị đơn trung bình</div><div class="metric-value">${currency(report.averageOrderValue)}</div></div><div class="metric"><div class="metric-label">Thời gian chuẩn bị trung bình</div><div class="metric-value">${report.averagePrepTimeSec > 0 ? `${Math.floor(report.averagePrepTimeSec / 60)} phút ${report.averagePrepTimeSec % 60} giây` : 'Chưa có dữ liệu'}</div></div></section>
    <div class="status-list"><span>● Hoàn tất ${report.completedOrders.toLocaleString('vi-VN')}</span><span>● Đang thực hiện ${inProgress.toLocaleString('vi-VN')}</span><span>● Đã hủy ${report.cancelledOrders.toLocaleString('vi-VN')}</span></div>
    <h2 class="section-title">Doanh thu theo phương thức thanh toán</h2><table><thead><tr><th>Phương thức</th><th class="number">Số đơn</th><th class="number">Thành tiền</th></tr></thead><tbody>${paymentRows}</tbody></table><div class="report-chart" aria-label="Tỷ trọng thanh toán"><span style="width:${cashPercent}%;background:#b42318"></span><span style="width:${bankPercent}%;background:#d89432"></span><span style="width:${otherPercent}%;background:#77716b"></span></div><div class="status-list"><span>Tiền mặt ${formatPercent(cashPercent)}</span><span>Chuyển khoản ${formatPercent(bankPercent)}</span><span>Khác ${formatPercent(otherPercent)}</span></div>
    <h2 class="section-title">Món bán chạy</h2><table><thead><tr><th class="number">#</th><th>Món ăn</th><th class="number">Đã bán</th><th class="number">Doanh thu</th></tr></thead><tbody>${topSellers}</tbody></table>
    ${profit}
    <footer class="footer"><strong>CRISPY BITE</strong>Báo cáo được tạo ${generatedAt} - Số liệu theo ngày kinh doanh tại Việt Nam.</footer>
  </main>`;
  return createBrandedPrintHtml(`Bao_cao_ban_hang_${report.date}`, content);
}
