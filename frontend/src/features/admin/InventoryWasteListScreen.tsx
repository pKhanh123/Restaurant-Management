import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, Download, FileSpreadsheet, Plus, RefreshCw, Search, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import type {
  InventoryWasteDto,
  InventoryWasteExportFormat,
  InventoryWasteListFilter,
  InventoryWasteStatus
} from '../../api/contracts';
import { downloadInventoryWasteExportApi, fetchInventoryWastesApi } from '../../api/inventoryWastes';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import {
  formatInventoryWasteMoney,
  getInventoryWasteStatusPresentation
} from './inventoryWasteViewModel';

export interface InventoryWasteListScreenProps {
  onCreateWaste: () => void;
  onOpenWaste: (id: number) => void;
}

const statusOptions: Array<{ value: InventoryWasteStatus; label: string }> = [
  { value: 'DRAFT', label: 'Phiếu tạm' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' }
];

const initialFilter: InventoryWasteListFilter = { statuses: ['DRAFT', 'COMPLETED'], page: 1, pageSize: 50 };

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

function WasteRow({ item, onPress }: { item: InventoryWasteDto; onPress: () => void }) {
  const { theme } = useTheme();
  const status = getInventoryWasteStatusPresentation(item.status);
  const creator = item.createdByUserId === null ? '—' : 'Người dùng #' + item.createdByUserId;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tableRow, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase }]}>
      <Text style={[styles.codeCell, { color: theme.primary }]}>{item.wasteCode}</Text>
      <Text style={[styles.timeCell, { color: theme.textPrimary }]}>{formatDate(item.wastedAt)}</Text>
      <Text style={[styles.creatorCell, { color: theme.textSecondary }]}>{creator}</Text>
      <Text style={[styles.numberCell, { color: item.status === 'COMPLETED' ? theme.danger : theme.textPrimary }]}>{formatInventoryWasteMoney(item.totalValue)}</Text>
      <Text style={[styles.noteCell, { color: theme.textSecondary }]} numberOfLines={1}>{item.note || '—'}</Text>
      <View style={styles.statusCell}><StatusBadge tone={status.tone} label={status.label} /></View>
    </Pressable>
  );
}

export const InventoryWasteListScreen: React.FC<InventoryWasteListScreenProps> = ({ onCreateWaste, onOpenWaste }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { inventoryRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [filter, setFilter] = useState<InventoryWasteListFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchInventoryWastesApi>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<InventoryWasteExportFormat | null>(null);

  const currentFilter = useMemo(() => ({
    ...filter,
    search: searchInput,
    from: fromInput || undefined,
    to: toInput || undefined
  }), [filter, fromInput, searchInput, toInput]);

  const loadWastes = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setData(await fetchInventoryWastesApi(token, currentFilter));
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể tải danh sách phiếu xuất hủy');
    } finally {
      setIsLoading(false);
    }
  }, [currentFilter, token]);

  useEffect(() => { void loadWastes(); }, [loadWastes, inventoryRevision]);

  const updateFilter = (patch: Partial<InventoryWasteListFilter>) => {
    setFilter(current => ({ ...current, ...patch, page: 1 }));
  };

  const toggleStatus = (status: InventoryWasteStatus) => {
    const selected = filter.statuses ?? [];
    updateFilter({ statuses: selected.includes(status) ? selected.filter(item => item !== status) : [...selected, status] });
  };

  const handleExport = async (format: InventoryWasteExportFormat) => {
    setExporting(format);
    setErrorMessage(null);
    try {
      const blob = await downloadInventoryWasteExportApi(token, currentFilter, format);
      const fileName = 'Phieu_xuat_huy_' + new Date().toISOString().slice(0, 10) + '.' + format;
      if (!triggerDownload(blob, fileName)) {
        setErrorMessage('File đã được tạo. Tải file hiện hỗ trợ trên giao diện Web.');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể xuất phiếu xuất hủy');
    } finally {
      setExporting(null);
    }
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Phiếu xuất hủy"
        description="Theo dõi nguyên liệu hỏng, hết hạn hoặc không thể sử dụng; tồn kho chỉ giảm khi phiếu hoàn thành."
        leading={<View style={[styles.headerMark, { backgroundColor: theme.interactiveSecondary }]}><AppIcon icon={Trash2} color={theme.primary} /></View>}
        actions={<View style={styles.headerActions}><Button variant="secondary" label="CSV" icon={Download} loading={exporting === 'csv'} onPress={() => handleExport('csv')} /><Button variant="secondary" label="XLSX" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onPress={() => handleExport('xlsx')} /><Button variant="primary" label="Xuất hủy" icon={Plus} onPress={onCreateWaste} /></View>}
      />
      {errorMessage && <InlineAlert title="Không thể tải dữ liệu" message={errorMessage} tone="danger" />}
      <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
        <Surface level="base" style={[styles.filters, isNarrow && styles.filtersNarrow, { borderColor: theme.borderSubtle }]}>
          <View style={styles.filterHeading}><AppIcon icon={Check} color={theme.textSecondary} size={16} /><Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Bộ lọc</Text></View>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Thời gian</Text>
          <View style={styles.dateRow}>
            <TextInput accessibilityLabel="Từ ngày xuất hủy" value={fromInput} onChangeText={setFromInput} placeholder="Từ ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
            <TextInput accessibilityLabel="Đến ngày xuất hủy" value={toInput} onChangeText={setToInput} placeholder="Đến ngày" placeholderTextColor={theme.textSecondary} style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          </View>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Trạng thái</Text>
          {statusOptions.map(option => {
            const active = filter.statuses?.includes(option.value) ?? false;
            return <Pressable key={option.value} onPress={() => toggleStatus(option.value)} style={styles.statusChoice}><View style={[styles.checkbox, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.primary : theme.surfaceBase }]}>{active && <AppIcon icon={Check} color="#FFFFFF" size={14} />}</View><Text style={[styles.choiceText, { color: theme.textPrimary }]}>{option.label}</Text></Pressable>;
          })}
        </Surface>
        <Surface level="raised" style={styles.tableSurface}>
          <View style={styles.toolbar}>
            <View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}><AppIcon icon={Search} color={theme.textSecondary} size={18} /><TextInput accessibilityLabel="Tìm theo mã xuất hủy" value={searchInput} onChangeText={setSearchInput} placeholder="Mã xuất hủy" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View>
            <Button variant="quiet" label="Làm mới" icon={RefreshCw} loading={isLoading} onPress={loadWastes} />
          </View>
          {isLoading && !data ? (
            <View style={styles.state}><ActivityIndicator color={theme.primary} size="large" /><Text style={[styles.muted, { color: theme.textSecondary }]}>Đang tải danh sách phiếu xuất hủy...</Text></View>
          ) : data && data.items.length === 0 ? (
            <EmptyState title="Chưa có phiếu xuất hủy phù hợp" description="Nhấn Xuất hủy để tạo phiếu mới." action={<Button variant="primary" label="Xuất hủy" icon={Plus} onPress={onCreateWaste} />} />
          ) : data ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.tableMinWidth}>
                <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}>
                  <Text style={[styles.codeCell, styles.headerText, { color: theme.textPrimary }]}>Mã xuất hủy</Text>
                  <Text style={[styles.timeCell, styles.headerText, { color: theme.textPrimary }]}>Thời gian</Text>
                  <Text style={[styles.creatorCell, styles.headerText, { color: theme.textPrimary }]}>Người tạo</Text>
                  <Text style={[styles.numberCell, styles.headerText, { color: theme.textPrimary }]}>Tổng giá trị</Text>
                  <Text style={[styles.noteCell, styles.headerText, { color: theme.textPrimary }]}>Ghi chú</Text>
                  <Text style={[styles.statusCell, styles.headerText, { color: theme.textPrimary }]}>Trạng thái</Text>
                </View>
                {data.items.map(item => <WasteRow key={item.id} item={item} onPress={() => onOpenWaste(item.id)} />)}
                <View style={[styles.pagination, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Trang {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} · {data.pagination.totalRows.toLocaleString('vi-VN')} phiếu</Text><View style={styles.paginationActions}><Button variant="quiet" label="Trước" disabled={data.pagination.page <= 1} onPress={() => updateFilter({ page: data.pagination.page - 1 })} /><Button variant="quiet" label="Sau" disabled={data.pagination.page >= data.pagination.totalPages} onPress={() => updateFilter({ page: data.pagination.page + 1 })} /></View></View>
              </View>
            </ScrollView>
          ) : null}
          {data && data.items.length > 0 && <View style={[styles.summaryBar, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.muted, { color: theme.textSecondary }]}>Tổng giá trị theo bộ lọc</Text><Text style={[styles.summaryValue, { color: theme.danger }]}>{formatInventoryWasteMoney(data.totalValue)}</Text></View>}
        </Surface>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  headerMark: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  layout: { flexDirection: 'row', gap: spacing.lg },
  layoutNarrow: { flexDirection: 'column' },
  filters: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.md, width: 250 },
  filtersNarrow: { width: '100%' },
  filterHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  panelTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  dateRow: { flexDirection: 'row', gap: spacing.xs },
  dateInput: { borderRadius: radii.sm, borderWidth: 1, flex: 1, minHeight: spacing.touchTargetMobile, minWidth: 0, paddingHorizontal: spacing.sm },
  statusChoice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 34 },
  checkbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1, height: 19, justifyContent: 'center', width: 19 },
  choiceText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  tableSurface: { flex: 1, minWidth: 0, overflow: 'hidden' },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, maxWidth: 520, minHeight: 44, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 40 },
  state: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 360 },
  muted: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  tableMinWidth: { minWidth: 960 },
  tableHeader: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  codeCell: { width: 145 },
  timeCell: { width: 155 },
  creatorCell: { width: 155 },
  numberCell: { textAlign: 'right', width: 145 },
  noteCell: { paddingHorizontal: spacing.sm, width: 210 },
  statusCell: { alignItems: 'flex-start', width: 150 },
  summaryBar: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
  summaryValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  pagination: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  paginationActions: { flexDirection: 'row', gap: spacing.sm }
});
