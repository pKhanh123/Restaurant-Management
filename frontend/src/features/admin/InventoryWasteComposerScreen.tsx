import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, FileSpreadsheet, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchIngredientsApi } from '../../api/inventory';
import {
  completeInventoryWasteApi,
  fetchInventoryWasteDetailApi,
  previewInventoryWasteImportApi,
  saveInventoryWasteDraftApi
} from '../../api/inventoryWastes';
import type {
  IngredientDto,
  InventoryWasteDetailDto,
  InventoryWasteImportPreviewDto,
  InventoryWasteStatus
} from '../../api/contracts';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import {
  calculateWasteRow,
  formatInventoryWasteMoney,
  formatInventoryWasteQuantity,
  getInventoryWasteStatusPresentation,
  InventoryWasteComposerLine,
  summarizeWasteRows,
  toInventoryWasteDraftInput,
  upsertWasteRow,
  validateWasteForCompletion
} from './inventoryWasteViewModel';

export interface InventoryWasteComposerScreenProps {
  mode: 'create' | 'edit';
  wasteId?: number | null;
  onFinished: () => void;
  onCancel: () => void;
}

function toQuantity(value: string): number {
  const normalized = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function ingredientToLine(ingredient: IngredientDto): InventoryWasteComposerLine {
  return calculateWasteRow({
    id: -ingredient.id,
    ingredientId: ingredient.id,
    ingredientSku: ingredient.sku,
    ingredientName: ingredient.name,
    unit: ingredient.unit,
    systemQuantity: ingredient.currentStock,
    quantity: ingredient.currentStock > 0 ? Math.min(1, ingredient.currentStock) : 0,
    costPerUnit: ingredient.costPerUnit,
    lineValue: 0
  });
}

function importRowToLine(row: InventoryWasteImportPreviewDto['validRows'][number]): InventoryWasteComposerLine {
  return calculateWasteRow({
    id: -row.ingredientId,
    ingredientId: row.ingredientId,
    ingredientSku: row.ingredientSku,
    ingredientName: row.ingredientName,
    unit: row.unit,
    systemQuantity: row.systemQuantity,
    quantity: row.quantity,
    costPerUnit: row.costPerUnit,
    lineValue: 0
  });
}

export const InventoryWasteComposerScreen: React.FC<InventoryWasteComposerScreenProps> = ({
  mode,
  wasteId: initialWasteId = null,
  onFinished,
  onCancel
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [wasteId, setWasteId] = useState<number | null>(initialWasteId);
  const [wasteCode, setWasteCode] = useState('Mã phiếu tự động');
  const [status, setStatus] = useState<InventoryWasteStatus>('DRAFT');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<InventoryWasteComposerLine[]>([]);
  const [recentWastes, setRecentWastes] = useState<InventoryWasteDetailDto['recentWastes']>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [suggestions, setSuggestions] = useState<IngredientDto[]>([]);
  const [lookup, setLookup] = useState<IngredientDto[]>([]);
  const [importPreview, setImportPreview] = useState<InventoryWasteImportPreviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const readOnly = status !== 'DRAFT' || isSaving || isCompleting;
  const summary = useMemo(() => summarizeWasteRows(lines), [lines]);
  const completionErrors = useMemo(() => validateWasteForCompletion({ note, lines }), [lines, note]);

  const applyDetail = (data: InventoryWasteDetailDto) => {
    setWasteId(data.id);
    setWasteCode(data.wasteCode);
    setStatus(data.status);
    setNote(data.note || '');
    setLines(data.lines.map(line => calculateWasteRow(line)));
    setRecentWastes(data.recentWastes || []);
  };

  const loadIngredients = useCallback(async () => {
    try {
      const data = await fetchIngredientsApi(token, { search: ingredientSearch || undefined });
      setLookup(data);
      setSuggestions(data.slice(0, 8));
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể tải nguyên liệu');
    }
  }, [ingredientSearch, token]);

  useEffect(() => { void loadIngredients(); }, [loadIngredients]);

  useEffect(() => {
    if (mode !== 'edit' || !initialWasteId) return;
    let active = true;
    setIsLoading(true);
    fetchInventoryWasteDetailApi(token, initialWasteId)
      .then(data => { if (active) applyDetail(data); })
      .catch((error: any) => { if (active) setErrorMessage(error.message || 'Không thể tải chi tiết phiếu xuất hủy'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [initialWasteId, mode, token]);

  const addIngredient = (ingredient: IngredientDto) => {
    setLines(current => upsertWasteRow(current, ingredientToLine(ingredient)));
    setIngredientSearch('');
    setSuggestions([]);
  };

  const updateQuantity = (ingredientId: number, quantity: number) => {
    setLines(current => current.map(line => line.ingredientId === ingredientId
      ? calculateWasteRow({ ...line, quantity })
      : line));
  };

  const saveDraft = async (): Promise<InventoryWasteDetailDto | null> => {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const saved = await saveInventoryWasteDraftApi(token, wasteId, toInventoryWasteDraftInput(note, lines));
      applyDetail(saved);
      setSuccessMessage('Đã lưu tạm ' + saved.wasteCode);
      return saved;
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể lưu phiếu xuất hủy tạm');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const complete = async (id: number) => {
    setIsCompleting(true);
    setErrorMessage(null);
    try {
      const completed = await completeInventoryWasteApi(token, id);
      applyDetail(completed);
      setSuccessMessage('Đã hoàn thành ' + completed.wasteCode);
      onFinished();
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể hoàn thành phiếu xuất hủy');
    } finally {
      setIsCompleting(false);
    }
  };

  const requestComplete = async () => {
    if (completionErrors.length) {
      setErrorMessage(completionErrors[0]);
      return;
    }
    const saved = await saveDraft();
    if (saved) void complete(saved.id);
  };

  const pickImportFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setErrorMessage('Tính năng nhập Excel hiện hỗ trợ trên giao diện Web');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result;
        if (typeof result !== 'string') return;
        try {
          setImportPreview(await previewInventoryWasteImportApi(token, file.name, result.split(',')[1] || result));
        } catch (error: any) {
          setErrorMessage(error.message || 'Không thể đối soát file Excel');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const applyImport = () => {
    if (!importPreview) return;
    setLines(current => importPreview.validRows.reduce((merged, row) => {
      return upsertWasteRow(merged, importRowToLine(row));
    }, current));
    const importedNote = importPreview.validRows.find(row => row.note?.trim())?.note;
    if (!note.trim() && importedNote) setNote(importedNote);
    setImportPreview(null);
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.textSecondary }}>Đang tải phiếu xuất hủy...</Text></View>;
  }

  const statusPresentation = getInventoryWasteStatusPresentation(status);
  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={mode === 'edit' ? 'Chi tiết phiếu xuất hủy' : 'Xuất hủy'}
        description="Ghi nhận nguyên liệu hỏng, hết hạn hoặc không thể sử dụng. Hoàn thành sẽ trừ tồn kho."
        leading={<Pressable accessibilityLabel="Quay lại danh sách xuất hủy" onPress={onCancel}><AppIcon icon={ArrowLeft} color={theme.primary} /></Pressable>}
        actions={<StatusBadge tone={statusPresentation.tone} label={statusPresentation.label} />}
      />
      {errorMessage && <InlineAlert title="Kiểm tra lại" message={errorMessage} tone="danger" />}
      {successMessage && <InlineAlert title="Thành công" message={successMessage} tone="success" />}

      <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
        <Surface level="raised" style={styles.linesPanel}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Danh sách hàng hóa</Text>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>Chọn nguyên liệu theo mã hoặc tên, sau đó nhập số lượng cần xuất hủy.</Text>
            </View>
            <Button variant="secondary" label="Nhập Excel" icon={FileSpreadsheet} onPress={pickImportFile} disabled={readOnly} />
          </View>
          <TextInput
            value={ingredientSearch}
            onChangeText={setIngredientSearch}
            placeholder="Tìm hàng hóa theo mã hoặc tên (F3)"
            placeholderTextColor={theme.textSecondary}
            editable={!readOnly}
            style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]}
          />
          {!!suggestions.length && !readOnly && (
            <Surface level="sunken" style={styles.suggestions}>
              {suggestions.map(ingredient => (
                <Pressable key={ingredient.id} testID={'inventory-waste-add-' + ingredient.id} onPress={() => addIngredient(ingredient)} style={styles.suggestionRow}>
                  <Text style={[styles.sku, { color: theme.primary }]}>{ingredient.sku}</Text>
                  <Text style={[styles.suggestionName, { color: theme.textPrimary }]}>{ingredient.name} · {ingredient.unit}</Text>
                  <AppIcon icon={Plus} color={theme.primary} size={16} />
                </Pressable>
              ))}
            </Surface>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableContent}>
            <View style={styles.table}>
              <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}>
                <Text style={[styles.indexCell, styles.headerText, { color: theme.textPrimary }]}>STT</Text>
                <Text style={[styles.skuCell, styles.headerText, { color: theme.textPrimary }]}>Mã hàng</Text>
                <Text style={[styles.nameCell, styles.headerText, { color: theme.textPrimary }]}>Tên hàng</Text>
                <Text style={[styles.qtyCell, styles.headerText, { color: theme.textPrimary }]}>SL hủy</Text>
                <Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Giá vốn</Text>
                <Text style={[styles.moneyCell, styles.headerText, { color: theme.textPrimary }]}>Giá trị hủy</Text>
                <View style={styles.removeCell} />
              </View>
              {lines.length === 0 && (
                <View style={styles.importEmpty}>
                  {Platform.OS === 'web' ? (
                    <><Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Chọn hàng hóa hoặc kéo thả file dữ liệu vào đây</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>File Excel dùng các cột mã hàng, tên hàng, đơn vị, số lượng hủy và ghi chú.</Text><Button variant="primary" label="Chọn file" icon={FileSpreadsheet} onPress={pickImportFile} disabled={readOnly} /></>
                  ) : (
                    <EmptyState title="Chưa có hàng hóa trong phiếu" description="Tìm và chọn nguyên liệu để bắt đầu xuất hủy." />
                  )}
                </View>
              )}
              {lines.map((line, index) => {
                const overStock = line.quantity > line.systemQuantity;
                return (
                  <View key={line.ingredientId} style={[styles.dataRow, { borderBottomColor: theme.borderSubtle }]}>
                    <Text style={[styles.indexCell, { color: theme.textSecondary }]}>{index + 1}</Text>
                    <Text style={[styles.skuCell, { color: theme.primary }]}>{line.ingredientSku}</Text>
                    <View style={styles.nameCell}><Text style={{ color: theme.textPrimary }} numberOfLines={1}>{line.ingredientName}</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>Tồn {formatInventoryWasteQuantity(line.systemQuantity)} {line.unit}</Text></View>
                    <TextInput accessibilityLabel={'Số lượng hủy ' + line.ingredientName} value={String(line.quantity)} onChangeText={value => updateQuantity(line.ingredientId, toQuantity(value))} editable={!readOnly} keyboardType="decimal-pad" style={[styles.tableInput, styles.qtyCell, { borderColor: overStock ? theme.danger : theme.borderSubtle, color: overStock ? theme.danger : theme.textPrimary }]} />
                    <Text style={[styles.moneyCell, styles.alignRight, { color: theme.textPrimary }]}>{formatInventoryWasteMoney(line.costPerUnit)}</Text>
                    <Text style={[styles.moneyCell, styles.alignRight, { color: theme.danger }]}>{formatInventoryWasteMoney(line.lineValue)}</Text>
                    <Pressable accessibilityLabel={'Xóa ' + line.ingredientName} onPress={() => setLines(current => current.filter(item => item.ingredientId !== line.ingredientId))} disabled={readOnly} style={styles.removeCell}><AppIcon icon={Trash2} color={theme.textSecondary} size={17} /></Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Surface>

        <Surface level="raised" style={[styles.sidePanel, isNarrow && styles.sidePanelNarrow]}>
          <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Thông tin phiếu</Text>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Mã xuất hủy</Text>
          <TextInput value={wasteCode} editable={false} style={[styles.input, styles.disabledInput, { borderColor: theme.borderSubtle, color: theme.textSecondary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Tổng giá trị hủy</Text>
          <Text style={[styles.totalNumber, { color: theme.danger }]}>{formatInventoryWasteMoney(summary.totalValue)}</Text>
          <TextInput testID="inventory-waste-note" value={note} onChangeText={setNote} editable={!readOnly} multiline placeholder="Ghi chú hoặc lý do xuất hủy" placeholderTextColor={theme.textSecondary} style={[styles.noteInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Surface level="sunken" style={styles.recent}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Xuất hủy gần đây</Text>
            {recentWastes?.length
              ? recentWastes.map(item => <View key={item.id} style={styles.recentRow}><Text style={[styles.sku, { color: theme.primary }]}>{item.wasteCode}</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>{getInventoryWasteStatusPresentation(item.status).label}</Text></View>)
              : <Text style={[styles.muted, { color: theme.textSecondary }]}>Chưa có phiếu gần đây</Text>}
          </Surface>
          {completionErrors.length > 0 && !readOnly && <Text style={[styles.validationHint, { color: theme.warning }]}>{completionErrors[0]}</Text>}
          <View style={styles.footerActions}>
            <Button variant="secondary" label="Lưu tạm" loading={isSaving} disabled={readOnly} onPress={() => { void saveDraft(); }} />
            <Button testID="inventory-waste-complete" variant="primary" label="Hoàn thành" loading={isCompleting} disabled={readOnly || completionErrors.length > 0} onPress={() => { void requestComplete(); }} />
          </View>
        </Surface>
      </View>

      {importPreview && (
        <Surface level="raised" style={styles.importCard}>
          <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Đối soát file {importPreview.fileName}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>{importPreview.validRows.length} dòng hợp lệ · {importPreview.errorRows.length} dòng lỗi</Text>
          {importPreview.errorRows.slice(0, 5).map(row => <Text key={row.rowNumber} style={[styles.errorRow, { color: theme.danger }]}>Dòng {row.rowNumber}: {row.error}</Text>)}
          <View style={styles.importActions}><Button variant="quiet" label="Đóng" onPress={() => setImportPreview(null)} /><Button variant="primary" label="Áp dụng dòng hợp lệ" disabled={!importPreview.validRows.length} onPress={applyImport} /></View>
        </Surface>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  layout: { flexDirection: 'row', gap: spacing.lg },
  layoutNarrow: { flexDirection: 'column' },
  linesPanel: { flex: 1, minWidth: 0, overflow: 'hidden', padding: spacing.md },
  sidePanel: { gap: spacing.sm, width: 330 },
  sidePanelNarrow: { width: '100%' },
  panelHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', marginBottom: spacing.md },
  panelTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg },
  muted: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  sku: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  input: { borderRadius: radii.sm, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.md },
  disabledInput: { backgroundColor: 'rgba(128,128,128,0.08)' },
  noteInput: { borderRadius: radii.sm, borderWidth: 1, minHeight: 96, padding: spacing.md, textAlignVertical: 'top' },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  totalNumber: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, textAlign: 'right' },
  suggestions: { gap: 0, marginTop: spacing.xs },
  suggestionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.sm },
  suggestionName: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  tableContent: { paddingTop: spacing.md },
  table: { minWidth: 850 },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.sm },
  dataRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 64, paddingHorizontal: spacing.sm },
  headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  indexCell: { width: 46 },
  skuCell: { width: 120 },
  nameCell: { paddingHorizontal: spacing.xs, width: 190 },
  qtyCell: { width: 100 },
  moneyCell: { width: 135 },
  removeCell: { alignItems: 'center', width: 42 },
  tableInput: { borderRadius: radii.sm, borderWidth: 1, minHeight: 38, paddingHorizontal: spacing.xs, textAlign: 'right' },
  alignRight: { textAlign: 'right' },
  importEmpty: { alignItems: 'center', borderColor: 'rgba(128,128,128,0.22)', borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, gap: spacing.sm, margin: spacing.xl, padding: spacing.xl },
  emptyTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, textAlign: 'center' },
  recent: { borderRadius: radii.sm, gap: spacing.sm, minHeight: 120, padding: spacing.md },
  recentRow: { borderBottomColor: 'rgba(128,128,128,0.2)', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  validationHint: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loading: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
  importCard: { gap: spacing.sm, padding: spacing.md },
  errorRow: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  importActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' }
});
