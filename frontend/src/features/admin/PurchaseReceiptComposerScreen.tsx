import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { ArrowLeft, Check, FileSpreadsheet, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { SupplierFormModal } from './SupplierFormModal';
import { fetchIngredientsApi } from '../../api/inventory';
import {
  fetchPurchaseReceiptDetailApi,
  postPurchaseReceiptApi,
  previewPurchaseReceiptImportApi,
  savePurchaseReceiptDraftApi
} from '../../api/purchaseReceipts';
import { fetchSuppliersApi } from '../../api/suppliers';
import type {
  IngredientDto,
  PurchaseReceiptImportPreviewDto,
  PurchaseReceiptStatus,
  SupplierDto
} from '../../api/contracts';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import {
  getPurchaseReceiptComposerTotals,
  mergePurchaseReceiptLine,
  toPurchaseReceiptDraftInput,
  validateReceiptForPost,
  type PurchaseReceiptComposerLine
} from './purchaseReceiptComposerViewModel';
import { formatReceiptMoney } from './purchaseReceiptViewModel';
import { CashbookAccountChoice } from '../cashbook/CashbookAccountChoice';
import { Choice as CashbookChoice } from '../cashbook/CashbookChoice';
import type { PaymentMethod } from '../../api/contracts';

export interface PurchaseReceiptComposerScreenProps {
  mode: 'create' | 'edit';
  receiptId?: number | null;
  onFinished: (result?: { id: number; posted: boolean }) => void;
  onCancel?: () => void;
}

const toNumber = (value: string) => {
  const normalized = value.replace(/[.,\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nowInput = () => new Date().toISOString().slice(0, 16);

function ingredientToLine(ingredient: IngredientDto, quantity = 1): PurchaseReceiptComposerLine {
  return {
    ingredientId: ingredient.id,
    ingredientSku: ingredient.sku,
    ingredientName: ingredient.name,
    unit: ingredient.unit,
    quantity,
    unitCost: ingredient.costPerUnit || 0,
    discountAmount: 0,
    note: null
  };
}

function importRowToLine(row: PurchaseReceiptImportPreviewDto['validRows'][number]): PurchaseReceiptComposerLine {
  return {
    ingredientId: row.ingredientId,
    ingredientSku: row.ingredientSku,
    ingredientName: row.ingredientName,
    unit: row.unit,
    quantity: row.quantity,
    unitCost: row.unitCost,
    discountAmount: row.discountAmount,
    note: row.note
  };
}

export const PurchaseReceiptComposerScreen: React.FC<PurchaseReceiptComposerScreenProps> = ({
  mode,
  receiptId: initialReceiptId = null,
  onFinished,
  onCancel
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { inventoryRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [receiptId, setReceiptId] = useState<number | null>(initialReceiptId);
  const [status, setStatus] = useState<PurchaseReceiptStatus>('DRAFT');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [receivedAt, setReceivedAt] = useState(nowInput);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [discountInput, setDiscountInput] = useState('0');
  const [paidInput, setPaidInput] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientDto[]>([]);
  const [lines, setLines] = useState<PurchaseReceiptComposerLine[]>([]);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<PurchaseReceiptImportPreviewDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isReadOnly = status !== 'DRAFT' || isPosting;

  const totals = useMemo(() => getPurchaseReceiptComposerTotals(
    lines,
    toNumber(discountInput),
    toNumber(paidInput)
  ), [discountInput, lines, paidInput]);

  const loadLookups = useCallback(async () => {
    try {
      const ingredientData = await fetchIngredientsApi(token, { search: ingredientSearch || undefined });
      setIngredientSuggestions(ingredientData.slice(0, 12));
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể tải dữ liệu nhà cung cấp và nguyên liệu');
    }
  }, [ingredientSearch, token]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      fetchSuppliersApi(token, { isActive: 'true', search: supplierSearch.trim() || undefined, page: 1, pageSize: 20 })
        .then(result => { if (active) setSuppliers(result.items); })
        .catch((failure: Error) => { if (active) setErrorMessage(failure.message); });
    }, 200);
    return () => { active = false; clearTimeout(timeout); };
  }, [supplierSearch, token, inventoryRevision]);

  useEffect(() => {
    if (mode !== 'edit' || !initialReceiptId) return;
    let active = true;
    setIsLoading(true);
    fetchPurchaseReceiptDetailApi(token, initialReceiptId).then((receipt) => {
      if (!active) return;
      setReceiptId(receipt.id);
      setStatus(receipt.status);
      setSupplierId(receipt.supplierId);
      setSelectedSupplierName(receipt.supplier?.name || '');
      setReceivedAt(receipt.receivedAt.slice(0, 16));
      setInvoiceNumber(receipt.invoiceNumber || '');
      setInvoiceDate(receipt.invoiceDate?.slice(0, 10) || '');
      setDiscountInput(String(receipt.discountAmount));
      setPaidInput(String(receipt.paidAmount));
      setPaymentMethod(receipt.paymentMethod || 'CASH');
      setFinancialAccountId(receipt.financialAccountId ?? null);
      setNote(receipt.note || '');
      setLines(receipt.lines.map((line) => ({
        ingredientId: line.ingredientId,
        ingredientSku: line.ingredientSku,
        ingredientName: line.ingredientName,
        unit: line.unit,
        quantity: line.quantity,
        unitCost: line.unitCost,
        discountAmount: line.discountAmount,
        note: line.note
      })));
    }).catch((error: any) => {
      if (active) setErrorMessage(error.message || 'Không thể tải chi tiết phiếu nhập');
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [initialReceiptId, mode, token]);

  const updateLine = (ingredientId: number, patch: Partial<PurchaseReceiptComposerLine>) => {
    setLines((current) => current.map((line) => line.ingredientId === ingredientId ? { ...line, ...patch } : line));
  };

  const addIngredient = (ingredient: IngredientDto) => {
    setLines((current) => mergePurchaseReceiptLine(current, ingredientToLine(ingredient)));
    setIngredientSearch('');
    setIngredientSuggestions([]);
  };

  const saveDraft = async (): Promise<number | null> => {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const saved = await savePurchaseReceiptDraftApi(token, receiptId, toPurchaseReceiptDraftInput({
        supplierId,
        receivedAt: new Date(receivedAt).toISOString(),
        invoiceNumber,
        invoiceDate,
        discountAmount: toNumber(discountInput),
        paidAmount: toNumber(paidInput),
        paymentMethod,
        financialAccountId,
        note,
        lines
      }));
      setReceiptId(saved.id);
      setStatus(saved.status);
      setSuccessMessage(`Đã lưu tạm ${saved.receiptCode}`);
      return saved.id;
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể lưu phiếu nhập tạm');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const requestPost = async () => {
    const errors = validateReceiptForPost({ supplierId, lines });
    if (errors.length) {
      setErrorMessage(errors.join(' • '));
      return;
    }
    const savedId = receiptId || await saveDraft();
    if (savedId) setShowPostConfirm(true);
  };

  const confirmPost = async () => {
    if (!receiptId) return;
    setIsPosting(true);
    setErrorMessage(null);
    try {
      const posted = await postPurchaseReceiptApi(token, receiptId);
      setStatus(posted.status);
      setSuccessMessage(`Đã hoàn thành ${posted.receiptCode}`);
      setShowPostConfirm(false);
      onFinished({ id: posted.id, posted: true });
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể hoàn thành phiếu nhập');
    } finally {
      setIsPosting(false);
    }
  };

  const pickImportFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setErrorMessage('Tính năng nhập Excel hiện hỗ trợ trên giao diện Web');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result;
        if (typeof result !== 'string') return;
        try {
          setErrorMessage(null);
          setImportPreview(await previewPurchaseReceiptImportApi(token, file.name, result.split(',')[1] || result));
        } catch (error: any) {
          setErrorMessage(error.message || 'Không thể đối soát file Excel');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const applyImportPreview = () => {
    if (!importPreview) return;
    setLines((current) => importPreview.validRows.reduce(
      (merged, row) => mergePurchaseReceiptLine(merged, importRowToLine(row)), current
    ));
    setImportPreview(null);
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.textSecondary }}>Đang tải phiếu nhập...</Text></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={mode === 'edit' ? 'Sửa phiếu nhập hàng' : 'Nhập hàng'}
        description="Lưu phiếu tạm trước; chỉ cập nhật tồn kho khi hoàn thành phiếu."
        leading={<Pressable testID="purchase-receipt-back" onPress={onCancel} disabled={!onCancel}><AppIcon icon={ArrowLeft} color={theme.primary} /></Pressable>}
        actions={<StatusBadge tone={status === 'POSTED' ? 'success' : 'warning'} label={status === 'POSTED' ? 'Đã nhập hàng' : 'Phiếu tạm'} />}
      />

      {errorMessage && <InlineAlert title="Kiểm tra lại" message={errorMessage} />}
      {successMessage && <InlineAlert title="Thành công" tone="success" message={successMessage} />}

      <View style={[styles.layout, isNarrow && styles.layoutNarrow]}>
        <Surface level="raised" style={styles.linesPanel}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Danh sách nguyên liệu</Text>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>Thêm theo mã hoặc tên, dòng trùng sẽ tự cộng số lượng.</Text>
            </View>
            <Button variant="secondary" label="Nhập Excel" icon={FileSpreadsheet} onPress={pickImportFile} disabled={isReadOnly} />
          </View>
          <TextInput
            value={ingredientSearch}
            onChangeText={setIngredientSearch}
            placeholder="Tìm theo mã hoặc tên nguyên liệu"
            placeholderTextColor={theme.textSecondary}
            editable={!isReadOnly}
            style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]}
          />
          {!!ingredientSuggestions.length && !isReadOnly && (
            <Surface level="sunken" style={styles.suggestions}>
              {ingredientSuggestions.map((ingredient) => (
                <Pressable key={ingredient.id} onPress={() => addIngredient(ingredient)} style={styles.suggestionRow}>
                  <Text style={[styles.suggestionSku, { color: theme.primary }]}>{ingredient.sku}</Text>
                  <Text style={[styles.suggestionName, { color: theme.textPrimary }]}>{ingredient.name} · {ingredient.unit}</Text>
                  <AppIcon icon={Plus} color={theme.primary} size={16} />
                </Pressable>
              ))}
            </Surface>
          )}
          <ScrollView horizontal contentContainerStyle={styles.tableContent}>
            <View style={styles.table}>
              <View style={[styles.tableHeader, { backgroundColor: theme.surfaceSunken, borderBottomColor: theme.borderSubtle }]}>
                <Text style={[styles.cellIndex, styles.headerText, { color: theme.textSecondary }]}>STT</Text>
                <Text style={[styles.cellCode, styles.headerText, { color: theme.textSecondary }]}>Mã hàng</Text>
                <Text style={[styles.cellName, styles.headerText, { color: theme.textSecondary }]}>Tên hàng</Text>
                <Text style={[styles.cellNumber, styles.headerText, { color: theme.textSecondary }]}>Số lượng</Text>
                <Text style={[styles.cellNumber, styles.headerText, { color: theme.textSecondary }]}>Đơn giá</Text>
                <Text style={[styles.cellNumber, styles.headerText, { color: theme.textSecondary }]}>Giảm giá</Text>
                <Text style={[styles.cellNumber, styles.headerText, { color: theme.textSecondary }]}>Thành tiền</Text>
                <View style={styles.cellRemove} />
              </View>
              {lines.length === 0 && <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Chưa có nguyên liệu. Hãy tìm và chọn một nguyên liệu ở trên.</Text>}
              {lines.map((line, index) => {
                const lineAmount = Math.max(0, line.quantity * line.unitCost - (line.discountAmount || 0));
                return (
                  <View key={line.ingredientId} style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}>
                    <Text style={[styles.cellIndex, { color: theme.textSecondary }]}>{index + 1}</Text>
                    <Text style={[styles.cellCode, { color: theme.primary }]}>{line.ingredientSku}</Text>
                    <View style={styles.cellName}><Text style={{ color: theme.textPrimary }}>{line.ingredientName}</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>{line.unit}</Text></View>
                    <TextInput value={String(line.quantity)} onChangeText={(value) => updateLine(line.ingredientId, { quantity: toNumber(value) })} editable={!isReadOnly} keyboardType="decimal-pad" style={[styles.tableInput, styles.cellNumber, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
                    <TextInput value={String(line.unitCost)} onChangeText={(value) => updateLine(line.ingredientId, { unitCost: toNumber(value) })} editable={!isReadOnly} keyboardType="number-pad" style={[styles.tableInput, styles.cellNumber, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
                    <TextInput value={String(line.discountAmount || 0)} onChangeText={(value) => updateLine(line.ingredientId, { discountAmount: toNumber(value) })} editable={!isReadOnly} keyboardType="number-pad" style={[styles.tableInput, styles.cellNumber, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
                    <Text style={[styles.cellNumber, { color: theme.textPrimary }]}>{formatReceiptMoney(lineAmount)}</Text>
                    <Pressable style={styles.cellRemove} onPress={() => setLines((current) => current.filter((item) => item.ingredientId !== line.ingredientId))} disabled={isReadOnly}><AppIcon icon={Trash2} color={theme.textSecondary} size={17} /></Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Surface>

        <Surface level="raised" style={[styles.sidePanel, isNarrow && styles.sidePanelNarrow]}>
          <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Thông tin phiếu</Text>
          <TextInput value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Tìm nhà cung cấp (F4)" placeholderTextColor={theme.textSecondary} editable={!isReadOnly} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <View style={styles.chips}>
            {suppliers.slice(0, 8).map((supplier) => (
              <Pressable key={supplier.id} onPress={() => { setSupplierId(supplier.id); setSelectedSupplierName(supplier.name); setSupplierSearch(''); }} disabled={isReadOnly} style={[styles.supplierChip, supplier.id === supplierId && { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}><Text style={{ color: theme.textPrimary }}>{supplier.name}</Text></Pressable>
            ))}
          </View>
          <Text style={[styles.selectedSupplier, { color: theme.textSecondary }]}>{supplierId ? `Nhà cung cấp đã chọn: ${selectedSupplierName}` : 'Chưa chọn nhà cung cấp'}</Text>
          <Button testID="purchase-receipt-add-supplier" variant="quiet" label="Thêm nhà cung cấp" icon={Plus} disabled={isReadOnly || isSaving} onPress={() => setShowSupplierForm(true)} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Mã phiếu nhập</Text>
          <TextInput value={receiptId ? `PN${String(receiptId).padStart(6, '0')}` : 'Mã phiếu tự động'} editable={false} style={[styles.input, styles.disabledInput, { borderColor: theme.borderSubtle, color: theme.textSecondary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Ngày nhập</Text>
          <TextInput value={receivedAt} onChangeText={setReceivedAt} editable={!isReadOnly} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Số hóa đơn</Text>
          <TextInput value={invoiceNumber} onChangeText={setInvoiceNumber} editable={!isReadOnly} placeholder="Không bắt buộc" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Ngày hóa đơn</Text>
          <TextInput value={invoiceDate} onChangeText={setInvoiceDate} editable={!isReadOnly} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <SummaryRow label="Tổng tiền hàng" value={formatReceiptMoney(totals.subtotalAmount)} theme={theme} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Giảm giá phiếu</Text>
          <TextInput testID="purchase-receipt-discount" value={discountInput} onChangeText={setDiscountInput} editable={!isReadOnly} keyboardType="number-pad" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <SummaryRow label="Cần trả nhà cung cấp" value={formatReceiptMoney(totals.payableAmount)} theme={theme} strong />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Đã trả (MVP)</Text>
          <TextInput value={paidInput} onChangeText={setPaidInput} editable={!isReadOnly} keyboardType="number-pad" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          {Number(paidInput) > 0 && <>
            <CashbookChoice label="Phương thức đã thanh toán" value={paymentMethod} options={['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']} onSelect={value => { setPaymentMethod(value as PaymentMethod); setFinancialAccountId(null); }} />
            <CashbookAccountChoice token={token} paymentMethod={paymentMethod} value={financialAccountId} onChange={setFinancialAccountId} />
          </>}
          <SummaryRow label="Công nợ (MVP)" value={formatReceiptMoney(totals.outstandingAmount)} theme={theme} strong />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Ghi chú</Text>
          <TextInput value={note} onChangeText={setNote} editable={!isReadOnly} multiline numberOfLines={3} style={[styles.noteInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <View style={styles.actions}>
            <Button testID="purchase-receipt-save-draft" variant="secondary" label="Lưu tạm" onPress={() => { void saveDraft(); }} loading={isSaving} disabled={isReadOnly} />
            <Button testID="purchase-receipt-post" variant="primary" label="Hoàn thành" icon={Check} onPress={() => { void requestPost(); }} loading={isPosting} disabled={isReadOnly} />
          </View>
        </Surface>
      </View>

      {showPostConfirm && <Surface level="raised" style={[styles.confirmation, { borderColor: theme.primary }]}><Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Xác nhận hoàn thành phiếu?</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>Sau khi hoàn thành, phiếu sẽ cập nhật tồn kho và không còn chỉnh sửa.</Text><View style={styles.actions}><Button variant="quiet" label="Hủy" onPress={() => setShowPostConfirm(false)} /><Button variant="primary" label="Xác nhận hoàn thành" onPress={() => { void confirmPost(); }} loading={isPosting} /></View></Surface>}

      {importPreview && <Surface level="raised" style={styles.importPanel}><Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Đối soát Excel: {importPreview.fileName}</Text><Text style={[styles.muted, { color: theme.textSecondary }]}>Hợp lệ {importPreview.validRows.length}/{importPreview.totalRows} dòng; lỗi {importPreview.errorRows.length} dòng.</Text>{importPreview.errorRows.slice(0, 4).map((row) => <Text key={row.rowNumber} style={{ color: theme.textSecondary }}>Dòng {row.rowNumber}: {row.error}</Text>)}<View style={styles.actions}><Button variant="quiet" label="Bỏ qua" onPress={() => setImportPreview(null)} /><Button variant="primary" label="Thêm dòng hợp lệ" onPress={applyImportPreview} disabled={!importPreview.validRows.length} /></View></Surface>}
      {showSupplierForm && <SupplierFormModal visible onClose={() => setShowSupplierForm(false)} onSaved={supplier => {
        setSupplierId(supplier.id); setSelectedSupplierName(supplier.name); setSupplierSearch('');
        setSuppliers(current => [supplier, ...current.filter(item => item.id !== supplier.id)]); setShowSupplierForm(false);
      }} />}
    </ScrollView>
  );
};

const SummaryRow: React.FC<{ label: string; value: string; theme: any; strong?: boolean }> = ({ label, value, theme, strong }) => <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: theme.textSecondary }, strong && styles.strong]}>{label}</Text><Text style={[styles.summaryValue, { color: theme.textPrimary }, strong && styles.strong]}>{value}</Text></View>;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  loading: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  layout: { flexDirection: 'row', gap: spacing.md },
  layoutNarrow: { flexDirection: 'column' },
  linesPanel: { flex: 1, gap: spacing.md, minWidth: 0, padding: spacing.md },
  sidePanel: { gap: spacing.sm, maxWidth: 380, padding: spacing.md, width: '32%' },
  sidePanelNarrow: { maxWidth: undefined, width: '100%' },
  panelHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  panelTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  muted: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  input: { borderRadius: radii.md, borderWidth: 1, minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  disabledInput: { backgroundColor: '#F1F5F9' },
  noteInput: { borderRadius: radii.md, borderWidth: 1, minHeight: 78, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  suggestions: { borderRadius: radii.md, gap: spacing.xs, padding: spacing.xs },
  suggestionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  suggestionSku: { fontFamily: typography.families.bodySemibold, width: 92 },
  suggestionName: { flex: 1 },
  chips: { gap: spacing.xs },
  supplierChip: { borderColor: '#CBD5E1', borderRadius: radii.sm, borderWidth: 1, padding: spacing.sm },
  selectedSupplier: { fontSize: typography.sizes.xs, minHeight: 18 },
  tableContent: { minWidth: 820 },
  table: { minWidth: 820, width: '100%' },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 42, paddingHorizontal: spacing.xs },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 66, paddingHorizontal: spacing.xs },
  headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  cellIndex: { textAlign: 'center', width: 40 },
  cellCode: { width: 100 },
  cellName: { flex: 1, minWidth: 170 },
  cellNumber: { textAlign: 'right', width: 112 },
  cellRemove: { alignItems: 'center', width: 34 },
  tableInput: { borderRadius: radii.sm, borderWidth: 1, minHeight: 38, paddingHorizontal: spacing.xs, paddingVertical: 4 },
  emptyText: { padding: spacing.xl, textAlign: 'center' },
  summaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryLabel: { fontSize: typography.sizes.sm },
  summaryValue: { fontSize: typography.sizes.sm, textAlign: 'right' },
  strong: { fontFamily: typography.families.bodySemibold },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
  confirmation: { gap: spacing.sm, padding: spacing.md },
  importPanel: { gap: spacing.xs, padding: spacing.md }
});
