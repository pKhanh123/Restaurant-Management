import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Printer, ReceiptText, RefreshCw, Search, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { OrderInvoiceDetailDto, OrderInvoiceFilter, OrderInvoiceListItemDto, OrderStatus, PaymentStatus } from '../../api/contracts';
import { downloadOrderInvoiceExportApi, fetchOrderInvoiceDetailApi, fetchOrderInvoicesApi } from '../../api/orderInvoices';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import { formatInvoiceDate, formatInvoiceMoney, getInvoiceCustomerLabel, getOrderStatusPresentation, getPaymentStatusLabel } from './invoiceViewModel';
import { SalesReturnListScreen } from './SalesReturnListScreen';
import { DeliveryPartnersScreen } from './DeliveryPartnersScreen';
import { createOrderInvoicePdfHtml } from '../pos/receiptPdf';
import { exportHtmlAsPdf } from '../../lib/pdfExport';

const orderStatuses: Array<{ value: OrderStatus; label: string }> = [
  { value: 'PENDING', label: 'Chờ xử lý' }, { value: 'PREPARING', label: 'Đang chuẩn bị' },
  { value: 'READY', label: 'Sẵn sàng' }, { value: 'COMPLETED', label: 'Hoàn thành' }, { value: 'CANCELLED', label: 'Đã hủy' }
];
const paymentStatuses: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'UNPAID', label: 'Chưa thanh toán' }, { value: 'PAID', label: 'Đã thanh toán' }, { value: 'VOIDED', label: 'Đã hoàn tác' }
];
const initialFilter: OrderInvoiceFilter = { statuses: ['PENDING', 'PREPARING', 'READY', 'COMPLETED'], paymentStatuses: ['UNPAID', 'PAID'], page: 1, pageSize: 50 };

function triggerDownload(blob: Blob, fileName: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return false;
  const url = window.URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); window.URL.revokeObjectURL(url); return true;
}

const CheckChoice = <T extends string>({ value, label, selected, onToggle }: { value: T; label: string; selected: boolean; onToggle: (value: T) => void }) => {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => onToggle(value)} style={styles.choice}>
    <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.borderSubtle, backgroundColor: selected ? theme.primary : theme.surfaceBase }]}>{selected && <AppIcon icon={Check} color="#FFFFFF" size={14} />}</View>
    <Text style={[styles.choiceText, { color: theme.textPrimary }]}>{label}</Text>
  </Pressable>;
};

function InvoiceRow({ item, onPress }: { item: OrderInvoiceListItemDto; onPress: () => void }) {
  const { theme } = useTheme(); const status = getOrderStatusPresentation(item.status);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase }]}>
    <Text style={[styles.codeCell, { color: theme.primary }]}>{item.code}</Text>
    <Text style={[styles.timeCell, { color: theme.textPrimary }]}>{formatInvoiceDate(item.createdAt)}</Text>
    <Text style={[styles.customerCell, { color: theme.textPrimary }]} numberOfLines={1}>{getInvoiceCustomerLabel(item)}</Text>
    <Text style={[styles.moneyCell, { color: theme.textPrimary }]}>{formatInvoiceMoney(item.totalGoods)}</Text>
    <Text style={[styles.moneyCell, { color: theme.textSecondary }]}>{formatInvoiceMoney(item.discountAmount)}</Text>
    <Text style={[styles.moneyCell, { color: theme.textPrimary }]}>{formatInvoiceMoney(item.totalAfterDiscount)}</Text>
    <Text style={[styles.moneyCell, { color: item.paidAmount ? theme.success : theme.textSecondary }]}>{formatInvoiceMoney(item.paidAmount)}</Text>
    <View style={styles.statusCell}><StatusBadge tone={status.tone} label={status.label} /></View>
  </Pressable>;
}

export const OrdersScreen: React.FC = () => {
  const { theme } = useTheme(); const { token } = useAuth(); const { latestOrderStatusChanged } = useRestaurant(); const { width } = useWindowDimensions();
  const compact = width < 980;
  const [activeSection, setActiveSection] = useState<'invoices' | 'returns' | 'partners'>('invoices');
  const [filter, setFilter] = useState<OrderInvoiceFilter>(initialFilter); const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOrderInvoicesApi>> | null>(null); const [detail, setDetail] = useState<OrderInvoiceDetailDto | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [detailError, setDetailError] = useState<string | null>(null); const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);
  const query = useMemo(() => ({ ...filter, search, from: from || undefined, to: to || undefined }), [filter, from, search, to]);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await fetchOrderInvoicesApi(token, query)); } catch (e: any) { setError(e.message || 'Không thể tải danh sách hóa đơn'); } finally { setLoading(false); } }, [query, token]);
  useEffect(() => { void load(); }, [load, latestOrderStatusChanged]);
  const setFilterPatch = (patch: Partial<OrderInvoiceFilter>) => setFilter(current => ({ ...current, ...patch, page: 1 }));
  const toggle = <T extends string>(field: 'statuses' | 'paymentStatuses', value: T) => {
    const selected = (filter[field] || []) as T[]; setFilterPatch({ [field]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] } as Partial<OrderInvoiceFilter>);
  };
  const openDetail = async (id: number) => { setDetailError(null); try { setDetail(await fetchOrderInvoiceDetailApi(token, id)); } catch (e: any) { setError(e.message || 'Không thể tải chi tiết hóa đơn'); } };
  const exportFile = async (format: 'csv' | 'xlsx') => { setExporting(format); try { const blob = await downloadOrderInvoiceExportApi(token, query, format); if (!triggerDownload(blob, `Hoa_don_${new Date().toISOString().slice(0, 10)}.${format}`)) setError('File đã được tạo. Tải file hiện hỗ trợ trên giao diện Web.'); } catch (e: any) { setError(e.message || 'Không thể xuất hóa đơn'); } finally { setExporting(null); } };
  const exportDetailPdf = async () => { if (!detail || exporting) return; setDetailError(null); setExporting('pdf'); try { await exportHtmlAsPdf(createOrderInvoicePdfHtml(detail), `Hoa_don_${detail.code}.pdf`); } catch (e) { setDetailError(e instanceof Error ? e.message : 'Không thể xuất hóa đơn PDF.'); } finally { setExporting(null); } };
  const items = data?.items || [];
  return <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
    {activeSection === 'invoices' && <ScreenHeader title="Hóa đơn" description="Tra cứu đơn hàng, thanh toán và tổng tiền theo bộ lọc" leading={<View style={[styles.headerMark, { backgroundColor: theme.interactiveSecondary }]}><AppIcon icon={ReceiptText} color={theme.primary} /></View>} actions={<View style={styles.headerActions}><Button variant="secondary" label="CSV" icon={Download} loading={exporting === 'csv'} onPress={() => void exportFile('csv')} /><Button variant="secondary" label="XLSX" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onPress={() => void exportFile('xlsx')} /></View>} />}
    <View style={[styles.subNav, { borderBottomColor: theme.borderSubtle }]}><Pressable accessibilityRole="tab" accessibilityState={{ selected: activeSection === 'invoices' }} onPress={() => setActiveSection('invoices')} style={[styles.subNavItem, activeSection === 'invoices' && styles.subNavItemActive, activeSection === 'invoices' && { borderBottomColor: theme.primary }]}><Text style={[styles.subNavText, { color: activeSection === 'invoices' ? theme.primary : theme.textSecondary }]}>Hóa đơn</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: activeSection === 'returns' }} onPress={() => setActiveSection('returns')} style={[styles.subNavItem, activeSection === 'returns' && styles.subNavItemActive, activeSection === 'returns' && { borderBottomColor: theme.primary }]}><Text style={[styles.subNavText, { color: activeSection === 'returns' ? theme.primary : theme.textSecondary }]}>Trả hàng</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: activeSection === 'partners' }} onPress={() => setActiveSection('partners')} style={[styles.subNavItem, activeSection === 'partners' && styles.subNavItemActive, activeSection === 'partners' && { borderBottomColor: theme.primary }]}><Text style={[styles.subNavText, { color: activeSection === 'partners' ? theme.primary : theme.textSecondary }]}>Đối tác giao hàng</Text></Pressable></View>
    {activeSection === 'returns' ? <SalesReturnListScreen /> : activeSection === 'partners' ? <DeliveryPartnersScreen /> : <>
    {error && <InlineAlert title="Không thể tải dữ liệu" message={error} />}
    <View style={[styles.layout, compact && styles.layoutCompact]}>
      <Surface level="base" style={[styles.filters, compact && styles.filtersCompact, { borderColor: theme.borderSubtle }]}>
        <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Bộ lọc hóa đơn</Text>
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Thời gian</Text>
        <View style={styles.dateRow}><TextInput accessibilityLabel="Từ ngày hóa đơn" value={from} onChangeText={value => { setFrom(value); setFilterPatch({ from: value || undefined }); }} placeholder="Từ ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} /><TextInput accessibilityLabel="Đến ngày hóa đơn" value={to} onChangeText={value => { setTo(value); setFilterPatch({ to: value || undefined }); }} placeholder="Đến ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} /></View>
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Trạng thái đơn</Text>
        {orderStatuses.map(option => <CheckChoice key={option.value} {...option} selected={filter.statuses?.includes(option.value) || false} onToggle={value => toggle('statuses', value)} />)}
        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Thanh toán</Text>
        {paymentStatuses.map(option => <CheckChoice key={option.value} {...option} selected={filter.paymentStatuses?.includes(option.value) || false} onToggle={value => toggle('paymentStatuses', value)} />)}
        <Text style={[styles.futureNote, { color: theme.textSecondary, borderTopColor: theme.borderSubtle }]}>Khách hàng, giao hàng và kênh bán sẽ được bổ sung khi dữ liệu nghiệp vụ tương ứng được kết nối.</Text>
      </Surface>
      <Surface level="raised" style={styles.tableSurface}>
        <View style={styles.toolbar}><View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={Search} color={theme.textSecondary} size={18} /><TextInput accessibilityLabel="Tìm theo mã hóa đơn" value={search} onChangeText={value => { setSearch(value); setFilterPatch({ page: 1 }); }} placeholder="Theo mã hóa đơn" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View><Button variant="quiet" label="Làm mới" icon={RefreshCw} loading={loading} onPress={() => void load()} /></View>
        {loading && !data ? <View style={styles.state}><ActivityIndicator color={theme.primary} size="large" /><Text style={[styles.muted, { color: theme.textSecondary }]}>Đang tải danh sách hóa đơn...</Text></View> : items.length === 0 ? <EmptyState title="Chưa có hóa đơn phù hợp" description="Thử đổi bộ lọc hoặc tạo đơn hàng mới từ màn hình bán hàng." /> : <ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableMinWidth}>
          <View style={[styles.headerRow, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}><Text style={[styles.codeCell, styles.headerText, { color: theme.textPrimary }]}>Mã hóa đơn</Text><Text style={[styles.timeCell, styles.headerText, { color: theme.textPrimary }]}>Thời gian</Text><Text style={[styles.customerCell, styles.headerText, { color: theme.textPrimary }]}>Khách hàng</Text><Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Tổng tiền hàng</Text><Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Giảm giá</Text><Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Sau giảm giá</Text><Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Khách đã trả</Text><Text style={[styles.statusCell, styles.headerText, { color: theme.textPrimary }]}>Trạng thái</Text></View>
          {items.map(item => <InvoiceRow key={item.id} item={item} onPress={() => void openDetail(item.id)} />)}
          <View style={[styles.summary, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Tổng theo bộ lọc</Text><Text style={[styles.summaryValue, { color: theme.textPrimary }]}>{formatInvoiceMoney(data?.summary.totalFinal || 0)}</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>Đã trả</Text><Text style={[styles.summaryValue, { color: theme.success }]}>{formatInvoiceMoney(data?.summary.totalPaid || 0)}</Text></View>
          <View style={[styles.pagination, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Trang {data?.pagination.page} / {Math.max(data?.pagination.totalPages || 1, 1)} · {(data?.pagination.totalRows || 0).toLocaleString('vi-VN')} hóa đơn</Text><View style={styles.paginationActions}><Button variant="quiet" label="Trước" icon={ChevronLeft} disabled={(data?.pagination.page || 1) <= 1} onPress={() => setFilterPatch({ page: (data?.pagination.page || 1) - 1 })} /><Button variant="quiet" label="Sau" icon={ChevronRight} disabled={(data?.pagination.page || 1) >= (data?.pagination.totalPages || 1)} onPress={() => setFilterPatch({ page: (data?.pagination.page || 1) + 1 })} /></View></View>
        </View></ScrollView>}
      </Surface>
    </View>
    <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
      <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
        <Surface level="raised" style={styles.detailCard}>
          <View style={[styles.detailHeader, { borderBottomColor: theme.borderSubtle }]}>
            <View>
              <Text style={[styles.detailTitle, { color: theme.textPrimary }]}>{detail?.code}</Text>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>{detail ? formatInvoiceDate(detail.createdAt) : ''}</Text>
            </View>
            <Pressable accessibilityLabel="Đóng chi tiết hóa đơn" onPress={() => setDetail(null)}><AppIcon icon={X} color={theme.textPrimary} /></Pressable>
          </View>
          {detailError ? <InlineAlert title="Không thể xuất hóa đơn PDF" message={detailError} /> : null}
          {detail && <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailMeta}>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Trạng thái đơn</Text>
              <StatusBadge tone={getOrderStatusPresentation(detail.status).tone} label={getOrderStatusPresentation(detail.status).label} />
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Thanh toán</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{getPaymentStatusLabel(detail.paymentStatus)}{detail.paymentMethod ? ` · ${detail.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản' : detail.paymentMethod === 'CREDIT_CARD' ? 'Thẻ' : detail.paymentMethod === 'E_WALLET' ? 'Ví điện tử' : 'Tiền mặt'}` : ''}</Text>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Khách hàng</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{getInvoiceCustomerLabel(detail)}</Text>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Hình thức</Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{detail.orderType === 'DINE_IN' ? `Dùng tại bàn ${detail.tableNumber ?? '—'}` : detail.orderType === 'DELIVERY' ? `Giao hàng${detail.deliveryPartnerName ? ` · ${detail.deliveryPartnerName}` : ''}` : 'Mang đi'}</Text>
              {detail.deliveryAddress ? <><Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Địa chỉ giao</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>{detail.deliveryAddress}</Text></> : null}
            </View>
            {detail.items.map(item => <View key={item.id} style={[styles.detailRow, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.menuItemName}</Text>
                <Text style={[styles.muted, { color: theme.textSecondary }]}>{item.sku} · {item.quantity} × {formatInvoiceMoney(item.unitPrice)}</Text>
                {item.notes ? <Text style={[styles.muted, { color: theme.textSecondary }]}>Ghi chú: {item.notes}</Text> : null}
              </View>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{formatInvoiceMoney(item.subtotal)}</Text>
            </View>)}
            {detail.notes ? <Text style={[styles.muted, { color: theme.textSecondary, marginTop: spacing.md }]}>Ghi chú đơn: {detail.notes}</Text> : null}
            <View style={styles.detailBreakdown}>
              <View style={styles.detailSummaryRow}><Text style={[styles.muted, { color: theme.textSecondary }]}>Cộng tiền món</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>{formatInvoiceMoney(detail.totalGoods)}</Text></View>
              {detail.discountAmount > 0 ? <View style={styles.detailSummaryRow}><Text style={[styles.muted, { color: theme.textSecondary }]}>Giảm giá{detail.voucherCode ? ` · ${detail.voucherCode}` : ''}</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>−{formatInvoiceMoney(detail.discountAmount)}</Text></View> : null}
              {detail.deliveryFee > 0 ? <View style={styles.detailSummaryRow}><Text style={[styles.muted, { color: theme.textSecondary }]}>Phí giao hàng</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>{formatInvoiceMoney(detail.deliveryFee)}</Text></View> : null}
              <View style={styles.detailSummaryRow}><Text style={[styles.muted, { color: theme.textSecondary }]}>Thuế GTGT</Text><Text style={[styles.detailValue, { color: theme.textPrimary }]}>{formatInvoiceMoney(detail.vatAmount)}</Text></View>
              <View style={styles.detailTotal}><Text style={[styles.detailValue, { color: theme.textPrimary }]}>Tổng thanh toán</Text><Text style={[styles.summaryValue, { color: theme.primary }]}>{formatInvoiceMoney(detail.finalAmount)}</Text></View>
            </View>
          </ScrollView>}
          <View style={[styles.detailActions, { borderTopColor: theme.borderSubtle }]}>
            <Button variant="secondary" label="Đóng" onPress={() => setDetail(null)} />
            <Button variant="primary" label="In / lưu PDF" icon={Printer} loading={exporting === 'pdf'} disabled={!detail} onPress={() => void exportDetailPdf()} />
          </View>
        </Surface>
      </View>
    </Modal>
    </>}
  </ScrollView>;
};

const styles = StyleSheet.create({
  detailBreakdown: { borderTopColor: '#E2E8F0', borderTopWidth: 1, marginTop: spacing.lg, paddingTop: spacing.sm },
  detailSummaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  detailActions: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.lg },
  screen: { flex: 1 }, content: { gap: spacing.lg, padding: spacing.lg }, headerMark: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, headerActions: { flexDirection: 'row', gap: spacing.sm }, subNav: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.lg }, subNavItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 38, paddingHorizontal: spacing.sm }, subNavItemActive: { borderBottomWidth: 2 }, subNavText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, comingSoon: { fontFamily: typography.families.body, fontSize: typography.sizes.xs }, layout: { flexDirection: 'row', gap: spacing.lg }, layoutCompact: { flexDirection: 'column' }, filters: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md, width: 260 }, filtersCompact: { width: '100%' }, panelTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, marginBottom: spacing.xs }, filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginTop: spacing.sm }, dateRow: { flexDirection: 'row', gap: spacing.xs }, dateInput: { borderRadius: radii.sm, borderWidth: 1, flex: 1, minHeight: spacing.touchTargetMobile, minWidth: 0, paddingHorizontal: spacing.sm }, choice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 32 }, checkbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1, height: 19, justifyContent: 'center', width: 19 }, choiceText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, futureNote: { borderTopWidth: 1, fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: 18, marginTop: spacing.md, paddingTop: spacing.md }, tableSurface: { flex: 1, minWidth: 0, overflow: 'hidden' }, toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md }, searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, maxWidth: 520, minHeight: 44, paddingHorizontal: spacing.md }, searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 40 }, state: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 360 }, muted: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, tableMinWidth: { minWidth: 1250 }, headerRow: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs }, row: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, codeCell: { width: 145 }, timeCell: { width: 155 }, customerCell: { paddingHorizontal: spacing.sm, width: 170 }, moneyCell: { textAlign: 'right', width: 155 }, statusCell: { alignItems: 'flex-start', paddingLeft: spacing.sm, width: 150 }, summary: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end', padding: spacing.md }, summaryValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] }, pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, paginationActions: { flexDirection: 'row', gap: spacing.sm }, modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }, detailCard: { maxHeight: '88%', maxWidth: 720, width: '100%' }, detailHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg }, detailTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, detailContent: { padding: spacing.lg }, detailMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }, detailLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, marginLeft: spacing.md }, detailValue: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md }, detailRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md }, detailItem: { flex: 1, gap: 3 }, detailTotal: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.lg }
});
