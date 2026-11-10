import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { downloadEndOfDayReportApi, EndOfDayReportApiError, type EndOfDayReportFilter, type EndOfDayReportResponse } from '../../api/endOfDayReports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme';
import { EmptyState, InlineAlert } from '../../ui/Feedback';
import { Button } from '../../ui/Button';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Surface } from '../../ui/Surface';
import { EndOfDayReportFilters } from './EndOfDayReportFilters';
import { EndOfDayReportView } from './EndOfDayReportView';
import { useEndOfDayReport } from './useEndOfDayReport';
import { escapeHtml } from '../../lib/pdfExport';

export interface EndOfDayReportScreenProps {
  snapshot?: EndOfDayReportResponse;
  initialFilter?: EndOfDayReportFilter;
  onApply?: (filter: EndOfDayReportFilter) => void;
  onPageChange?: (page: number) => void;
}
export const EndOfDayReportScreen = ({ snapshot: suppliedSnapshot, initialFilter, onApply, onPageChange }: EndOfDayReportScreenProps) => {
  const { token } = useAuth();
  const { theme } = useTheme(); const { width } = useWindowDimensions(); const compact = width < 1024;
  const [filter, setFilter] = useState<EndOfDayReportFilter>(() => initialFilter ?? { concern: 'SALES', view: 'VERTICAL' });
  const report = useEndOfDayReport(token, initialFilter, suppliedSnapshot);
  const { snapshot, load } = report;
  const startup = useRef({ filter, suppliedSnapshot });
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { if (!startup.current.suppliedSnapshot) void load(startup.current.filter); }, [load]);
  const apply = () => { setActionError(null); onApply?.(filter); return report.load(filter); };
  const pageChange = (page: number) => { onPageChange?.(page); if (report.committedFilter) void report.load({ ...report.committedFilter, page }); };
  const exportReport = async () => {
    if (!snapshot || !report.committedFilter || exporting) return;
    setActionError(null);
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') { setActionError('Tải file hiện hỗ trợ trên giao diện Web.'); return; }
    setExporting(true);
    try {
      const exportFilter = { ...report.committedFilter }; delete exportFilter.page; delete exportFilter.pageSize;
      const blob = await downloadEndOfDayReportApi(token, exportFilter);
      const url = window.URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Bao_cao_cuoi_ngay_${snapshot.metadata.date}_${snapshot.metadata.concern}.xlsx`;
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      } finally { window.URL.revokeObjectURL(url); }
    } catch (error) {
      setActionError(error instanceof EndOfDayReportApiError && (error.status === 413 || error.code === 'REPORT_EXPORT_TOO_LARGE') ? `Báo cáo vượt giới hạn xuất${typeof error.details?.estimatedRows === 'number' ? ` (${error.details.estimatedRows} dòng)` : ''}. Vui lòng thu hẹp khoảng giờ hoặc bộ lọc rồi thử lại.` : error instanceof Error ? error.message : 'Không thể xuất báo cáo cuối ngày.');
    } finally { setExporting(false); }
  };
  const printReport = () => {
    if (!snapshot) return;
    setActionError(null);
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') { setActionError('In báo cáo hiện hỗ trợ trên giao diện Web.'); return; }
    const surface = document.querySelector('[data-testid="report-print-surface"]');
    if (!surface) { setActionError('Không tìm thấy tờ báo cáo để in.'); return; }
    const frame = document.createElement('iframe'); frame.setAttribute('title', 'In báo cáo cuối ngày'); frame.style.position = 'fixed'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
    document.body.appendChild(frame);
    const printDocument = frame.contentDocument; const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) { frame.remove(); setActionError('Không thể mở bản in. Vui lòng thử lại.'); return; }
    printDocument.open();
    printDocument.write('<!doctype html><html><head><title>Báo cáo cuối ngày</title></head><body></body></html>');
    // React Native Web inserts rules through CSSOM, so cloning style text alone loses them.
    for (const sheet of Array.from(document.styleSheets ?? [])) {
      try { const style = printDocument.createElement('style'); style.textContent = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); printDocument.head.appendChild(style); }
      catch { if (sheet.ownerNode) printDocument.head.appendChild(sheet.ownerNode.cloneNode(true)); }
    }
    const style = printDocument.createElement('style');
    style.textContent = `body{margin:16px;color:#24211F;background:#fff;font-family:Arial,sans-serif} *{overflow:visible!important;max-height:none!important} [role="button"]{display:none!important} @page{size:A4 ${snapshot.metadata.view === 'HORIZONTAL' ? 'landscape' : 'portrait'};margin:12mm}
      @media print{
        body{margin:0}
        .report-print-heading{display:flex;align-items:center;gap:12px;margin:0 0 22px;padding:0 0 14px;border-bottom:2px solid #B42318}
        .report-print-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#B42318;color:#fff;font-weight:800;letter-spacing:-.08em}
        .report-print-brand{font-size:14pt;font-weight:800;letter-spacing:.025em}.report-print-detail{color:#706962;font-size:8pt;margin-top:2px}
        .report-print-period{margin-left:auto;text-align:right;color:#B42318;font-size:8pt;font-weight:700}
        [data-testid="report-sheet"]{width:100%!important;max-width:none!important;padding:0!important}
        [data-testid="report-detail-scroll"],[data-testid="report-detail-scroll"]>div{display:block!important;width:100%!important;min-width:0!important}
        [role="table"]{display:table!important;width:100%!important;table-layout:fixed;border-collapse:collapse}
        thead{display:table-header-group!important}
        tbody{display:table-row-group!important}
        [role="row"]{display:table-row!important;break-inside:avoid;page-break-inside:avoid}
        [role="columnheader"],[role="cell"]{display:table-cell!important;width:10%!important;min-width:0!important;padding:4px!important;font-size:8pt!important;line-height:1.35!important;overflow-wrap:anywhere;vertical-align:top}
      }`;
    const printedSurface = surface.cloneNode(true) as Element;
    const concernLabels = { SALES: 'Bán hàng', CASHFLOW: 'Thu chi', GOODS: 'Hàng hóa', CANCELLED_ITEMS: 'Món hủy', SUMMARY: 'Tổng hợp' };
    const reportHeading = printDocument.createElement('header');
    reportHeading.className = 'report-print-heading';
    reportHeading.innerHTML = `<span class="report-print-mark">CB</span><div><div class="report-print-brand">CRISPY BITE</div><div class="report-print-detail">Báo cáo cuối ngày - ${escapeHtml(snapshot.metadata.operatingScope.name)}</div></div><div class="report-print-period">${concernLabels[snapshot.metadata.concern]}<div class="report-print-detail">${escapeHtml(snapshot.metadata.date)} | ${escapeHtml(snapshot.metadata.from.slice(11, 16))}-${escapeHtml(snapshot.metadata.to.slice(11, 16))}</div></div>`;
    printedSurface.prepend(reportHeading);
    // Native header groups repeat across printed pages; the scrolling screen table stays intact.
    for (const sourceTable of Array.from(printedSurface.querySelectorAll('[role="table"]'))) {
      const table = printDocument.createElement('table');
      for (const attribute of Array.from(sourceTable.attributes)) table.setAttribute(attribute.name, attribute.value);
      const header = printDocument.createElement('thead');
      const body = printDocument.createElement('tbody');
      for (const sourceRow of Array.from(sourceTable.querySelectorAll('[role="row"]'))) {
        const row = printDocument.createElement('tr');
        const isHeader = sourceRow.querySelector('[role="columnheader"]') !== null;
        for (const attribute of Array.from(sourceRow.attributes)) row.setAttribute(attribute.name, attribute.value);
        for (const sourceCell of Array.from(sourceRow.children)) {
          const cell = printDocument.createElement(isHeader ? 'th' : 'td');
          for (const attribute of Array.from(sourceCell.attributes)) cell.setAttribute(attribute.name, attribute.value);
          if (isHeader) cell.setAttribute('scope', 'col');
          cell.append(...Array.from(sourceCell.childNodes));
          row.appendChild(cell);
        }
        (isHeader ? header : body).appendChild(row);
      }
      table.append(header, body); sourceTable.replaceWith(table);
    }
    printDocument.head.appendChild(style); printDocument.body.appendChild(printedSurface);
    printWindow.onafterprint = () => frame.remove();
    frame.onload = () => { printWindow.focus(); printWindow.print(); };
    printDocument.close();
  };
  return <ScrollView testID="reports-end-of-day-shell" style={{ backgroundColor: theme.surfaceCanvas }} contentContainerStyle={styles.container}>
    <ScreenHeader title="Báo cáo cuối ngày" description="Tổng hợp hoạt động trong ngày tại Nhà hàng chính." />
    <View style={styles.actions}>
      <Button testID="report-print" variant="secondary" label="In / lưu PDF" disabled={!snapshot} onPress={printReport} />
      <Button testID="report-export" variant="secondary" label="Xuất XLSX" disabled={!snapshot} loading={exporting} onPress={exportReport} />
      <Button testID="report-refresh" variant="quiet" label="Làm mới" onPress={report.refresh} />
    </View>
    {actionError ? <InlineAlert testID="report-action-error" message={actionError} /> : null}
    <View testID="report-layout" style={[styles.layout, { flexDirection: compact ? 'column' : 'row' }]}>
      <View testID="report-filter-rail" style={[styles.rail, { width: compact ? '100%' : 272, backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <EndOfDayReportFilters filter={filter} options={snapshot?.metadata.concern === (filter.concern ?? 'SALES') ? snapshot.filterOptions : {}} onChange={setFilter} onApply={apply} />
      </View>
      <Surface level="sunken" style={[styles.viewer, { padding: compact ? spacing.sm : spacing.lg }]}>
        {report.loading ? <View testID="report-loading" style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.textPrimary }}>Đang tải báo cáo…</Text></View> : null}
        {report.error && !snapshot ? <View style={styles.loading}><InlineAlert testID="report-error" title="Không thể tải báo cáo" message={report.error} /><Button testID="report-retry" label="Thử lại" onPress={report.refresh} /></View> : null}
        {snapshot ? <View testID="report-print-surface">
          {report.stale ? <InlineAlert testID="report-stale" tone="warning" title="Đang hiển thị báo cáo cũ" message={`${report.error} Snapshot được tạo: ${snapshot.metadata.generatedAt}. Thử làm mới: ${report.refreshAttemptedAt}. Xuất XLSX dùng bộ lọc này và tạo snapshot mới với thời điểm riêng trong file.`} /> : null}
          <EndOfDayReportView snapshot={snapshot} compact={width < 600} onPageChange={pageChange} />
        </View> : !report.loading && !report.error ? <EmptyState title="Chọn phạm vi báo cáo" description="Chọn mối quan tâm, ngày và kiểu xem để tải báo cáo cuối ngày." /> : null}
      </Surface>
    </View>
  </ScrollView>;
};
const styles = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.lg }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, loading: { minHeight: 160, gap: spacing.md, justifyContent: 'center' }, layout: { gap: spacing.md, alignItems: 'flex-start' }, rail: { flexShrink: 0, borderWidth: 1 }, viewer: { flex: 1, minWidth: 0, width: '100%', minHeight: 300 } });
