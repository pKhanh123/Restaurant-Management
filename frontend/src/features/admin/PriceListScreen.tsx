import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { Calculator, Check, Download, FileUp, Percent, Plus, Search, Tag, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useToast } from '../../contexts/ToastContext';
import { PriceFormulaOperation, PriceListItemDto } from '../../api/contracts';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, Surface } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { PriceListImportModal } from './PriceListImportModal';

const money = new Intl.NumberFormat('vi-VN');
const formatMoney = (value: number | null) => value === null ? '—' : `${money.format(value)} đ`;

type BulkMode = PriceFormulaOperation['mode'];

export const PriceListScreen: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { showToast } = useToast();
  const {
    priceListData,
    isLoadingPriceList,
    priceListError,
    fetchPriceList,
    updatePriceListItem,
    bulkUpdatePriceList,
    downloadPriceListExport
  } = useRestaurant();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>('percent');
  const [bulkValue, setBulkValue] = useState('10');
  const [rounding, setRounding] = useState<100 | 1000 | 10000>(1000);
  const [importOpen, setImportOpen] = useState(false);
  const isCompact = width < 900;

  const items = useMemo(() => priceListData?.items || [], [priceListData?.items]);
  const categories = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach(item => map.set(item.categoryId, item.categoryName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(item => {
      const matchesCategory = categoryId === null || item.categoryId === categoryId;
      const matchesQuery = !normalized || item.sku.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [items, query, categoryId]);
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.menuItemId));
  const averageMargin = items.length ? items.reduce((sum, item) => sum + (item.marginPercent || 0), 0) / items.length : 0;

  const toggleSelection = (id: number) => {
    setSelectedIds(previous => previous.includes(id) ? previous.filter(itemId => itemId !== id) : [...previous, id]);
  };

  const toggleAll = () => {
    setSelectedIds(previous => allFilteredSelected
      ? previous.filter(id => !filteredItems.some(item => item.menuItemId === id))
      : Array.from(new Set([...previous, ...filteredItems.map(item => item.menuItemId)])));
  };

  const saveItem = async (item: PriceListItemDto) => {
    const draft = drafts[item.menuItemId] ?? String(item.salePrice);
    const salePrice = Number(draft.replace(/[^0-9]/g, ''));
    if (!Number.isInteger(salePrice) || salePrice <= 0) {
      showToast({ type: 'error', title: 'Giá không hợp lệ', message: 'Giá bán phải là số nguyên lớn hơn 0.' });
      return;
    }
    if (salePrice === item.salePrice) return;
    setSavingId(item.menuItemId);
    const result = await updatePriceListItem(item.menuItemId, salePrice, item.version);
    setSavingId(null);
    if (!result.success) {
      showToast({ type: 'error', title: 'Không thể cập nhật giá', message: result.error || 'Dữ liệu đã thay đổi, vui lòng tải lại.' });
      await fetchPriceList();
      return;
    }
    setDrafts(previous => { const next = { ...previous }; delete next[item.menuItemId]; return next; });
    showToast({ type: 'success', title: 'Đã cập nhật giá', message: `${item.name} đã được đồng bộ.` });
  };

  const submitBulk = async () => {
    const value = Number(bulkValue.replace(',', '.'));
    if (!Number.isFinite(value) || (bulkMode === 'fixed' && value <= 0)) {
      showToast({ type: 'error', title: 'Công thức không hợp lệ', message: 'Vui lòng nhập giá trị hợp lệ.' });
      return;
    }
    const operation: PriceFormulaOperation = bulkMode === 'fixed'
      ? { mode: 'fixed', value: Math.round(value), rounding }
      : bulkMode === 'amount'
        ? { mode: 'amount', value: Math.round(value), rounding }
        : { mode: 'percent', value, rounding };
    const result = await bulkUpdatePriceList(selectedIds, operation);
    if (!result.success) {
      showToast({ type: 'error', title: 'Không thể áp dụng công thức', message: result.error || 'Vui lòng thử lại.' });
      return;
    }
    setSelectedIds([]);
    setBulkOpen(false);
    showToast({ type: 'success', title: 'Đã cập nhật hàng loạt', message: `Đã áp dụng cho ${result.updatedCount || selectedIds.length} món.` });
  };

  const handleExport = async () => {
    const result = await downloadPriceListExport();
    if (!result.success || !result.blob) {
      showToast({ type: 'error', title: 'Không thể xuất file', message: result.error || 'Vui lòng thử lại.' });
      return;
    }
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'bang-gia-chung.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Đã tạo file', 'API đã chuẩn bị file bảng giá. Có thể nối thêm native file saver theo môi trường phát hành.');
    }
  };

  if (isLoadingPriceList && !priceListData) {
    return <View style={[styles.center, { backgroundColor: theme.surfaceCanvas }]}><ActivityIndicator color={theme.primary} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <ScreenHeader
        title="Bảng giá chung"
        description="Một nguồn giá cho POS, QR, bán mang đi và các kênh bán hàng"
        leading={<AppIcon icon={Tag} color={theme.primary} size={24} />}
        actions={(
          <View style={styles.headerActions}>
            <Button label="Import" variant="secondary" icon={FileUp} onPress={() => setImportOpen(true)} />
            <Button label="Xuất file" variant="secondary" icon={Download} onPress={handleExport} />
            <Button label="Công thức" variant="primary" icon={Calculator} disabled={selectedIds.length === 0} onPress={() => setBulkOpen(true)} />
          </View>
        )}
      />

      {priceListError && <InlineAlert tone="danger" message={priceListError} />}

      <View style={styles.statsRow}>
        <Surface level="raised" style={styles.statCard}><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Số món áp dụng</Text><Text style={[styles.statValue, { color: theme.textPrimary }]}>{items.length}</Text><Text style={[styles.statHint, { color: theme.textSecondary }]}>đang dùng Bảng giá chung</Text></Surface>
        <Surface level="raised" style={styles.statCard}><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Biên lợi nhuận TB</Text><Text style={[styles.statValue, { color: averageMargin >= 0 ? theme.success : theme.danger }]}>{averageMargin.toFixed(1)}%</Text><Text style={[styles.statHint, { color: theme.textSecondary }]}>tính theo giá vốn BOM</Text></Surface>
        <Surface level="raised" style={styles.statCard}><Text style={[styles.statLabel, { color: theme.textSecondary }]}>Phiên bản dữ liệu</Text><Text style={[styles.statValue, { color: theme.primary }]}>v{Math.max(0, ...items.map(item => item.version))}</Text><Text style={[styles.statHint, { color: theme.textSecondary }]}>cập nhật realtime</Text></Surface>
      </View>

      <View style={styles.contentRow}>
        <Surface level="base" style={[styles.filterPanel, { width: isCompact ? '100%' : 220 }]}>
          <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Bộ lọc</Text>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Nhóm món</Text>
          <Pressable onPress={() => setCategoryId(null)} style={[styles.filterOption, { backgroundColor: categoryId === null ? theme.interactiveSecondary : 'transparent' }]}><Text style={[styles.filterText, { color: categoryId === null ? theme.primary : theme.textSecondary }]}>Tất cả nhóm</Text><Text style={[styles.count, { color: theme.textSecondary }]}>{items.length}</Text></Pressable>
          {categories.map(category => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.filterOption, { backgroundColor: categoryId === category.id ? theme.interactiveSecondary : 'transparent' }]}><Text numberOfLines={1} style={[styles.filterText, { color: categoryId === category.id ? theme.primary : theme.textSecondary }]}>{category.name}</Text><Text style={[styles.count, { color: theme.textSecondary }]}>{items.filter(item => item.categoryId === category.id).length}</Text></Pressable>)}
        </Surface>

        <Surface level="base" style={styles.tableSurface}>
          <View style={styles.tableToolbar}>
            <View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}><AppIcon icon={Search} color={theme.textSecondary} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm mã hoặc tên món" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View>
            <Pressable onPress={toggleAll} style={styles.selectAll}><View style={[styles.checkbox, { borderColor: allFilteredSelected ? theme.primary : theme.borderStrong, backgroundColor: allFilteredSelected ? theme.primary : 'transparent' }]}>{allFilteredSelected && <AppIcon icon={Check} color="#fff" size={13} />}</View><Text style={[styles.selectLabel, { color: theme.textSecondary }]}>Chọn tất cả</Text></Pressable>
            {selectedIds.length > 0 && <Text style={[styles.selectedText, { color: theme.primary }]}>{selectedIds.length} đã chọn</Text>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: 900 }}>
            <View style={styles.table}>
              <View style={[styles.headerRow, { backgroundColor: theme.interactiveQuiet, borderBottomColor: theme.borderSubtle }]}><View style={styles.checkCol} /><Text style={[styles.headerCell, styles.skuCol, { color: theme.textSecondary }]}>Mã món</Text><Text style={[styles.headerCell, styles.nameCol, { color: theme.textSecondary }]}>Tên món</Text><Text style={[styles.headerCell, styles.moneyCol, { color: theme.textSecondary }]}>Giá vốn BOM</Text><Text style={[styles.headerCell, styles.priceCol, { color: theme.textSecondary }]}>Giá bán</Text><Text style={[styles.headerCell, styles.marginCol, { color: theme.textSecondary }]}>Biên LN</Text></View>
              <ScrollView style={styles.rows} nestedScrollEnabled>
                {filteredItems.map(item => {
                  const selected = selectedIds.includes(item.menuItemId);
                  const draft = drafts[item.menuItemId] ?? String(item.salePrice);
                  const marginColor = (item.marginPercent || 0) >= 0 ? theme.success : theme.danger;
                  return <View key={item.menuItemId} style={[styles.dataRow, { borderBottomColor: theme.borderSubtle, backgroundColor: selected ? theme.interactiveQuiet : theme.surfaceBase }]}>
                    <Pressable onPress={() => toggleSelection(item.menuItemId)} style={styles.checkCol}><View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.borderStrong, backgroundColor: selected ? theme.primary : 'transparent' }]}>{selected && <AppIcon icon={Check} color="#fff" size={13} />}</View></Pressable>
                    <Text style={[styles.cell, styles.skuCol, { color: theme.primary }]}>{item.sku}</Text>
                    <Text numberOfLines={1} style={[styles.cell, styles.nameCol, { color: theme.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.cell, styles.moneyCol, { color: theme.textSecondary }]}>{formatMoney(item.costPrice)}</Text>
                    <View style={styles.priceCol}><TextInput keyboardType="numeric" value={draft} onChangeText={value => setDrafts(previous => ({ ...previous, [item.menuItemId]: value }))} onSubmitEditing={() => saveItem(item)} onBlur={() => saveItem(item)} style={[styles.priceInput, { color: theme.textPrimary, borderColor: savingId === item.menuItemId ? theme.primary : theme.borderSubtle, backgroundColor: theme.surfaceBase }]} />{savingId === item.menuItemId && <ActivityIndicator style={styles.inputLoader} size="small" color={theme.primary} />}</View>
                    <Text style={[styles.cell, styles.marginCol, { color: marginColor }]}>{item.marginPercent === null ? '—' : `${item.marginPercent.toFixed(1)}%`}</Text>
                  </View>;
                })}
                {filteredItems.length === 0 && <EmptyState title="Không có món phù hợp" description="Thử đổi từ khóa hoặc nhóm món." />}
              </ScrollView>
            </View>
          </ScrollView>
        </Surface>
      </View>

      <Modal visible={bulkOpen} transparent animationType="fade" onRequestClose={() => setBulkOpen(false)}>
        <View style={styles.modalBackdrop}><Surface level="raised" style={styles.modalCard}>
          <View style={styles.modalHeader}><View><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Áp dụng công thức giá</Text><Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{selectedIds.length} món được chọn</Text></View><Pressable onPress={() => setBulkOpen(false)}><AppIcon icon={X} color={theme.textSecondary} size={22} /></Pressable></View>
          <View style={styles.modeRow}>{(['percent', 'amount', 'fixed'] as BulkMode[]).map(mode => <Pressable key={mode} onPress={() => setBulkMode(mode)} style={[styles.modeButton, { borderColor: bulkMode === mode ? theme.primary : theme.borderSubtle, backgroundColor: bulkMode === mode ? theme.interactiveSecondary : theme.surfaceBase }]}><AppIcon icon={mode === 'percent' ? Percent : mode === 'amount' ? Plus : Tag} color={bulkMode === mode ? theme.primary : theme.textSecondary} size={16} /><Text style={[styles.modeText, { color: bulkMode === mode ? theme.primary : theme.textSecondary }]}>{mode === 'percent' ? 'Theo %' : mode === 'amount' ? 'Cộng/trừ tiền' : 'Giá cố định'}</Text></Pressable>)}</View>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Giá trị</Text><TextInput keyboardType="numeric" value={bulkValue} onChangeText={setBulkValue} placeholder={bulkMode === 'percent' ? 'Ví dụ: 10' : 'Ví dụ: 30000'} placeholderTextColor={theme.textSecondary} style={[styles.bulkInput, { color: theme.textPrimary, borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]} />
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Làm tròn đến</Text><View style={styles.roundingRow}>{([100, 1000, 10000] as const).map(value => <Pressable key={value} onPress={() => setRounding(value)} style={[styles.roundButton, { borderColor: rounding === value ? theme.primary : theme.borderSubtle, backgroundColor: rounding === value ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.roundText, { color: rounding === value ? theme.primary : theme.textSecondary }]}>{money.format(value)} đ</Text></Pressable>)}</View>
          <View style={styles.modalActions}><Button label="Hủy" variant="secondary" onPress={() => setBulkOpen(false)} /><Button label="Áp dụng" variant="primary" icon={Check} onPress={submitBulk} /></View>
        </Surface></View>
      </Modal>
      <PriceListImportModal visible={importOpen} onClose={() => setImportOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: spacing.sm, minWidth: 0 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  statCard: { flex: 1, minWidth: 180, padding: spacing.md },
  statLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  statValue: { fontFamily: typography.families.bodyBold, fontSize: 25, marginTop: 4 },
  statHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 2 },
  contentRow: { flex: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingTop: 0 },
  filterPanel: { minHeight: 300, padding: spacing.md },
  panelTitle: { fontFamily: typography.families.bodyBold, fontSize: typography.sizes.lg, marginBottom: spacing.lg },
  fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, marginBottom: spacing.xs, marginTop: spacing.sm },
  filterOption: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, minHeight: 38, paddingHorizontal: spacing.sm },
  filterText: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  count: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  tableSurface: { flex: 1, minWidth: 0, overflow: 'hidden' },
  tableToolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.md },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexBasis: 180, flexGrow: 1, flexShrink: 1, flexDirection: 'row', minWidth: 0, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minHeight: spacing.touchTargetMobile, minWidth: 0, paddingHorizontal: spacing.sm },
  selectAll: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  selectLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  selectedText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  checkbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1.5, height: 18, justifyContent: 'center', width: 18 },
  table: { minWidth: 900 },
  headerRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.sm },
  dataRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 64, paddingHorizontal: spacing.sm },
  headerCell: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  cell: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  checkCol: { alignItems: 'center', justifyContent: 'center', width: 46 },
  skuCol: { width: 135 },
  nameCol: { flex: 1, minWidth: 220, paddingRight: spacing.md },
  moneyCol: { textAlign: 'right', width: 150 },
  priceCol: { alignItems: 'flex-end', justifyContent: 'center', width: 165 },
  marginCol: { textAlign: 'right', width: 110 },
  rows: { flex: 1 },
  priceInput: { borderRadius: radii.sm, borderWidth: 1, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, minHeight: 38, paddingHorizontal: spacing.sm, textAlign: 'right', width: 145 },
  inputLoader: { position: 'absolute', right: spacing.sm },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCard: { maxWidth: 520, padding: spacing.lg, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { fontFamily: typography.families.bodyBold, fontSize: typography.sizes.xl },
  modalSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: 2 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modeButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 42, paddingHorizontal: spacing.sm },
  modeText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  bulkInput: { borderRadius: radii.md, borderWidth: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 46, paddingHorizontal: spacing.md },
  roundingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roundButton: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  roundText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  modalActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
