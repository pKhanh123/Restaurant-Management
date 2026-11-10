import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Check, Download, FileSpreadsheet, Plus, RefreshCw, Search } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { InventoryCheckDto, InventoryCheckExportFormat, InventoryCheckListFilter, InventoryCheckStatus } from '../../api/contracts';
import { downloadInventoryCheckExportApi, fetchInventoryChecksApi } from '../../api/inventoryChecks';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import { formatInventoryCheckMoney, formatInventoryCheckQuantity, getInventoryCheckStatusPresentation } from './inventoryCheckViewModel';

export interface InventoryCheckListScreenProps {
  onCreateCheck: () => void;
  onOpenCheck: (id: number) => void;
}

const statusOptions: Array<{ value: InventoryCheckStatus; label: string }> = [
  { value: 'DRAFT', label: 'Phiếu tạm' },
  { value: 'BALANCED', label: 'Đã cân bằng kho' },
  { value: 'CANCELLED', label: 'Đã hủy' }
];

const initialFilter: InventoryCheckListFilter = { statuses: ['DRAFT', 'BALANCED'], page: 1, pageSize: 50 };

function triggerDownload(blob: Blob, fileName: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return false;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
  return true;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function CheckRow({ item, onPress }: { item: InventoryCheckDto; onPress: () => void }) {
  const { theme } = useTheme();
  const status = getInventoryCheckStatusPresentation(item.status);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tableRow, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase }]}>
      <Text style={[styles.codeCell, { color: theme.primary }]}>{item.checkCode}</Text>
      <Text style={[styles.timeCell, { color: theme.textPrimary }]}>{formatDate(item.countedAt)}</Text>
      <Text style={[styles.timeCell, { color: theme.textSecondary }]}>{formatDate(item.balancedAt)}</Text>
      <Text style={[styles.numberCell, { color: item.totalVarianceValue < 0 ? theme.danger : theme.textPrimary }]}>{formatInventoryCheckMoney(item.totalVarianceValue)}</Text>
      <Text style={[styles.numberCell, { color: theme.success }]}>{formatInventoryCheckQuantity(item.increasedQuantity)}</Text>
      <Text style={[styles.numberCell, { color: theme.danger }]}>{formatInventoryCheckQuantity(item.decreasedQuantity)}</Text>
      <Text style={[styles.noteCell, { color: theme.textSecondary }]} numberOfLines={1}>{item.note || '—'}</Text>
      <View style={styles.statusCell}><StatusBadge tone={status.tone} label={status.label} /></View>
    </Pressable>
  );
}

export const InventoryCheckListScreen: React.FC<InventoryCheckListScreenProps> = ({ onCreateCheck, onOpenCheck }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { inventoryRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [filter, setFilter] = useState<InventoryCheckListFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchInventoryChecksApi>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<InventoryCheckExportFormat | null>(null);

  const currentFilter = useMemo(() => ({ ...filter, search: searchInput, from: fromInput || undefined, to: toInput || undefined }), [filter, fromInput, searchInput, toInput]);
  const loadChecks = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null);
    try { setData(await fetchInventoryChecksApi(token, currentFilter)); }
    catch (error: any) { setErrorMessage(error.message || 'Không thể tải danh sách phiếu kiểm kho'); }
    finally { setIsLoading(false); }
  }, [currentFilter, token]);
  useEffect(() => { void loadChecks(); }, [loadChecks, inventoryRevision]);

  const updateFilter = (patch: Partial<InventoryCheckListFilter>) => setFilter(current => ({ ...current, ...patch, page: 1 }));
  const toggleStatus = (status: InventoryCheckStatus) => {
    const selected = filter.statuses ?? [];
    updateFilter({ statuses: selected.includes(status) ? selected.filter(item => item !== status) : [...selected, status] });
  };
  const handleExport = async (format: InventoryCheckExportFormat) => {
    setExporting(format); setErrorMessage(null);
    try {
      const blob = await downloadInventoryCheckExportApi(token, currentFilter, format);
      if (!triggerDownload(blob, `Phieu_kiem_kho_${new Date().toISOString().slice(0, 10)}.${format}`)) setErrorMessage('File đã được tạo. Tải file hiện hỗ trợ trên giao diện Web.');
    } catch (error: any) { setErrorMessage(error.message || 'Không thể xuất phiếu kiểm kho'); }
    finally { setExporting(null); }
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader title="Phiếu kiểm kho" description="Đối chiếu tồn hệ thống với số lượng thực tế và ghi nhận điều chỉnh." leading={<View style={[styles.headerMark, { backgroundColor: theme.interactiveSecondary }]}><AppIcon icon={Check} color={theme.primary} /></View>} actions={<View style={styles.headerActions}><Button variant="secondary" label="CSV" icon={Download} loading={exporting === 'csv'} onPress={() => handleExport('csv')} /><Button variant="secondary" label="XLSX" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onPress={() => handleExport('xlsx')} /><Button variant="primary" label="Kiểm kho" icon={Plus} onPress={onCreateCheck} /></View>} />
      {errorMessage && <InlineAlert title="Không thể tải dữ liệu" message={errorMessage} tone="danger" />}
      <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
        <Surface level="base" style={[styles.filters, isNarrow && styles.filtersNarrow, { borderColor: theme.borderSubtle }]}>
          <View style={styles.filterHeading}><AppIcon icon={CalendarDays} color={theme.textSecondary} size={16} /><Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Bộ lọc</Text></View>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Thời gian</Text>
          <View style={styles.dateRow}><TextInput accessibilityLabel="Từ ngày" value={fromInput} onChangeText={(value) => { setFromInput(value); updateFilter({ from: value || undefined }); }} placeholder="Từ ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} /><TextInput accessibilityLabel="Đến ngày" value={toInput} onChangeText={(value) => { setToInput(value); updateFilter({ to: value || undefined }); }} placeholder="Đến ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} /></View>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Trạng thái</Text>
          {statusOptions.map(option => { const active = filter.statuses?.includes(option.value) ?? false; return <Pressable key={option.value} onPress={() => toggleStatus(option.value)} style={styles.statusChoice}><View style={[styles.checkbox, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.primary : theme.surfaceBase }]}>{active && <AppIcon icon={Check} color="#FFFFFF" size={14} />}</View><Text style={[styles.choiceText, { color: theme.textPrimary }]}>{option.label}</Text></Pressable>; })}
        </Surface>
        <Surface level="raised" style={styles.tableSurface}>
          <View style={styles.toolbar}><View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}><AppIcon icon={Search} color={theme.textSecondary} size={18} /><TextInput accessibilityLabel="Tìm theo mã kiểm kho" value={searchInput} onChangeText={(value) => { setSearchInput(value); updateFilter({ page: 1 }); }} placeholder="Mã kiểm kho" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View><Button variant="quiet" label="Làm mới" icon={RefreshCw} loading={isLoading} onPress={loadChecks} /></View>
          {isLoading && !data ? <View style={styles.state}><ActivityIndicator color={theme.primary} size="large" /><Text style={[styles.muted, { color: theme.textSecondary }]}>Đang tải danh sách phiếu kiểm kho...</Text></View> : data && data.items.length === 0 ? <EmptyState title="Chưa có phiếu kiểm kho phù hợp" description="Nhấn Kiểm kho để bắt đầu đối chiếu tồn thực tế." action={<Button variant="primary" label="Kiểm kho" icon={Plus} onPress={onCreateCheck} />} /> : data ? <ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableMinWidth}><View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}><Text style={[styles.codeCell, styles.headerText, { color: theme.textPrimary }]}>Mã kiểm kho</Text><Text style={[styles.timeCell, styles.headerText, { color: theme.textPrimary }]}>Thời gian</Text><Text style={[styles.timeCell, styles.headerText, { color: theme.textPrimary }]}>Ngày cân bằng</Text><Text style={[styles.numberCell, styles.headerText, { color: theme.textPrimary }]}>Tổng chênh lệch</Text><Text style={[styles.numberCell, styles.headerText, { color: theme.textPrimary }]}>SL lệch tăng</Text><Text style={[styles.numberCell, styles.headerText, { color: theme.textPrimary }]}>SL lệch giảm</Text><Text style={[styles.noteCell, styles.headerText, { color: theme.textPrimary }]}>Ghi chú</Text><Text style={[styles.statusCell, styles.headerText, { color: theme.textPrimary }]}>Trạng thái</Text></View>{data.items.map(item => <CheckRow key={item.id} item={item} onPress={() => onOpenCheck(item.id)} />)}<View style={[styles.pagination, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Trang {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} · {data.pagination.totalRows.toLocaleString('vi-VN')} phiếu</Text><View style={styles.paginationActions}><Button variant="quiet" label="Trước" disabled={data.pagination.page <= 1} onPress={() => updateFilter({ page: data.pagination.page - 1 })} /><Button variant="quiet" label="Sau" disabled={data.pagination.page >= data.pagination.totalPages} onPress={() => updateFilter({ page: data.pagination.page + 1 })} /></View></View></View></ScrollView> : null}
          {data && data.items.length > 0 && <View style={[styles.summaryBar, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Theo bộ lọc</Text><Text style={[styles.summaryValue, { color: theme.textPrimary }]}>Chênh lệch {formatInventoryCheckMoney(data.totalVarianceValue)} · Tăng {formatInventoryCheckQuantity(data.increasedQuantity)} · Giảm {formatInventoryCheckQuantity(data.decreasedQuantity)}</Text></View>}
        </Surface>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { gap: spacing.lg, padding: spacing.lg }, headerMark: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, layout: { flexDirection: 'row', gap: spacing.lg }, layoutNarrow: { flexDirection: 'column' }, filters: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.md, width: 250 }, filtersNarrow: { width: '100%' }, filterHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, panelTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md }, filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginTop: spacing.xs }, dateRow: { flexDirection: 'row', gap: spacing.xs }, dateInput: { borderRadius: radii.sm, borderWidth: 1, flex: 1, minHeight: spacing.touchTargetMobile, minWidth: 0, paddingHorizontal: spacing.sm }, statusChoice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 34 }, checkbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1, height: 19, justifyContent: 'center', width: 19 }, choiceText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, tableSurface: { flex: 1, minWidth: 0, overflow: 'hidden' }, toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md }, searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, maxWidth: 520, minHeight: 44, paddingHorizontal: spacing.md }, searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 40 }, state: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 360 }, muted: { fontFamily: typography.families.body, fontSize: typography.sizes.sm }, tableMinWidth: { minWidth: 1160 }, tableHeader: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs }, tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, codeCell: { width: 140 }, timeCell: { width: 145 }, numberCell: { textAlign: 'right', width: 130 }, noteCell: { paddingHorizontal: spacing.sm, width: 190 }, statusCell: { alignItems: 'flex-start', width: 160 }, summaryBar: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md }, summaryValue: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, pagination: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, paginationActions: { flexDirection: 'row', gap: spacing.sm }
});
