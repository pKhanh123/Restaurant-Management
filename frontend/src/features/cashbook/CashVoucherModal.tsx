import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import type {
  CashFlowCategoryDto,
  CashVoucherDirection,
  CashVoucherDto,
  CashbookCounterpartyDto,
  CashbookPurchaseInvoiceDto,
  FinancialAccountDto,
  FinancialAccountType,
  PaymentMethod
} from '../../api/contracts';
import {
  createCashVoucherApi,
  createFinancialPartyApi,
  fetchCashbookCounterpartiesApi,
  fetchCashbookPurchaseInvoicesApi
} from '../../api/cashbook';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon, Button, Field, InlineAlert } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { SupplierModalShell } from '../admin/SupplierModalShell';
import { printCashVoucher } from './cashbookPrint';
import { CashVoucherFormErrors, validateVoucherForm, voucherFormFields } from './cashbookViewModel';

export interface CashVoucherModalProps {
  visible: boolean;
  direction: CashVoucherDirection;
  accountType: FinancialAccountType;
  accounts: FinancialAccountDto[];
  categories: CashFlowCategoryDto[];
  onClose: () => void;
  onSaved: (voucher: CashVoucherDto) => void;
}

function typeName(type: FinancialAccountType) {
  return type === 'CASH' ? 'tiền mặt' : type === 'BANK' ? 'ngân hàng' : 'ví điện tử';
}

function Option({ label, selected, testID, onPress }: { label: string; selected: boolean; testID?: string; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
    style={[styles.option, { borderColor: selected ? theme.primary : theme.borderSubtle, backgroundColor: selected ? theme.interactiveSecondary : theme.surfaceBase }]}>
    <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}</View>
    <Text style={{ color: theme.textPrimary, flex: 1 }}>{label}</Text>
  </Pressable>;
}

function SelectionGroup({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return <View style={styles.selectionGroup}>
    <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
    <View style={styles.optionWrap}>{children}</View>
    {!!error && <Text style={[styles.helper, { color: theme.danger }]}>{error}</Text>}
  </View>;
}

export function CashVoucherModal({ visible, direction, accountType, accounts, categories, onClose, onSaved }: CashVoucherModalProps) {
  const { token, user } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const fields = voucherFormFields(direction, accountType);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [accountId, setAccountId] = useState<number | undefined>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [occurredAt, setOccurredAt] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyType, setCounterpartyType] = useState<string | null>('OTHER');
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [affectsBusinessResult, setAffectsBusinessResult] = useState(true);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [counterparties, setCounterparties] = useState<CashbookCounterpartyDto[]>([]);
  const [invoices, setInvoices] = useState<CashbookPurchaseInvoiceDto[]>([]);
  const [showQuickParty, setShowQuickParty] = useState(false);
  const [quickPartyName, setQuickPartyName] = useState('');
  const [quickPartyPhone, setQuickPartyPhone] = useState('');
  const [errors, setErrors] = useState<CashVoucherFormErrors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setCategoryId(undefined); setAccountId(undefined); setPaymentMethod(undefined);
    setOccurredAt(new Date().toISOString()); setCounterpartyName(''); setCounterpartyType('OTHER'); setCounterpartyId(null);
    setAmountText(''); setNote(''); setAffectsBusinessResult(true); setInvoiceId(null); setErrors({}); setError('');
    setShowQuickParty(false); setQuickPartyName(''); setQuickPartyPhone('');
    let active = true;
    Promise.all([
      fetchCashbookCounterpartiesApi(token),
      fields.invoice ? fetchCashbookPurchaseInvoicesApi(token) : Promise.resolve([])
    ]).then(([partyRows, invoiceRows]) => { if (active) { setCounterparties(partyRows); setInvoices(invoiceRows); } })
      .catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [accountType, direction, fields.invoice, token, visible]);

  const activeAccounts = useMemo(() => accounts.filter(item => item.isActive && item.type === accountType), [accountType, accounts]);
  const activeCategories = useMemo(() => categories.filter(item => item.isActive && item.direction === direction), [categories, direction]);
  const columns = width < 720 ? styles.stack : styles.row;
  const title = `Tạo phiếu ${direction === 'RECEIPT' ? 'thu' : 'chi'} ${typeName(accountType)}`;
  const amount = Number(amountText.replace(/[^0-9]/g, ''));

  const chooseCounterparty = (item: CashbookCounterpartyDto) => {
    setCounterpartyType(item.type); setCounterpartyId(item.sourceId); setCounterpartyName(item.name);
  };
  const createParty = async () => {
    if (!quickPartyName.trim()) return;
    try {
      const party = await createFinancialPartyApi(token, { name: quickPartyName.trim(), phone: quickPartyPhone.trim() || null });
      setCounterparties(current => [party, ...current]); chooseCounterparty(party); setShowQuickParty(false);
    } catch (failure: any) { setError(failure.message || 'Không thể tạo người nộp/nhận'); }
  };
  const save = async (shouldPrint: boolean) => {
    if (busyRef.current) return;
    const validation = validateVoucherForm({ direction, accountType, accountId, paymentMethod, categoryId, amount, occurredAt, counterpartyName }, accounts, categories);
    setErrors(validation.errors);
    if (!validation.valid || categoryId === undefined) return;
    busyRef.current = true; setSaving(true); setError('');
    try {
      const voucher = await createCashVoucherApi(token, {
        direction, paymentMethod: validation.paymentMethod, accountId: validation.accountId, categoryId, amount,
        occurredAt, counterpartyType, counterpartyId, counterpartyName: counterpartyName.trim(), note: note.trim() || null,
        affectsBusinessResult, linkedPurchaseReceiptId: invoiceId
      });
      if (shouldPrint) await printCashVoucher(voucher);
      onSaved(voucher);
    } catch (failure: any) { setError(failure.message || 'Không thể lưu phiếu thu/chi'); }
    finally { busyRef.current = false; setSaving(false); }
  };

  return <SupplierModalShell visible={visible} title={title} onClose={onClose} busy={saving} footer={<>
    <Button variant="quiet" label="Bỏ qua" disabled={saving} onPress={onClose} />
    <Button variant="secondary" label="Lưu & In" testID="cashbook-save-print" loading={saving} onPress={() => { void save(true); }} />
    <Button variant="primary" label="Lưu" testID="cashbook-save" loading={saving} onPress={() => { void save(false); }} />
  </>}>
    {!!error && <InlineAlert message={error} />}
    {fields.invoice && <SelectionGroup label="Số – Ngày hóa đơn">
      <Option label="Không liên kết hóa đơn" selected={invoiceId === null} onPress={() => setInvoiceId(null)} />
      {invoices.map(item => <Option key={item.id} label={`${item.invoiceNumber || item.receiptCode}${item.supplierName ? ` · ${item.supplierName}` : ''}`} selected={invoiceId === item.id} onPress={() => setInvoiceId(item.id)} />)}
    </SelectionGroup>}
    <View style={columns}>
      <View style={styles.column}><Field label="Mã phiếu" value="Tự động" editable={false} /></View>
      <View style={styles.column}><Field label="Thời gian" value={occurredAt} error={errors.occurredAt} onChangeText={setOccurredAt} /></View>
    </View>
    <View style={columns}>
      <View style={styles.column}><SelectionGroup label={direction === 'RECEIPT' ? 'Loại thu' : 'Loại chi'} error={errors.categoryId}>
        {activeCategories.map(item => <Option key={item.id} testID={`cashbook-category-${item.id}`} label={item.name} selected={categoryId === item.id} onPress={() => { setCategoryId(item.id); setAffectsBusinessResult(item.affectsBusinessResultDefault); }} />)}
      </SelectionGroup></View>
      <View style={styles.column}><Field label={direction === 'RECEIPT' ? 'Người thu' : 'Người chi'} value={user?.name || ''} editable={false} /></View>
    </View>
    <View style={columns}>
      <View style={styles.column}><SelectionGroup label={direction === 'RECEIPT' ? 'Đối tượng nộp' : 'Đối tượng nhận'}>
        <Option label="Khác" selected={counterpartyType === 'OTHER' && !counterpartyId} onPress={() => { setCounterpartyType('OTHER'); setCounterpartyId(null); }} />
        {counterparties.slice(0, 8).map(item => <Option key={`${item.type}-${item.sourceId}`} label={item.name} selected={counterpartyType === item.type && counterpartyId === item.sourceId} onPress={() => chooseCounterparty(item)} />)}
      </SelectionGroup></View>
      <View style={styles.column}>
        <View style={styles.labelRow}><Text style={[styles.label, { color: theme.textPrimary }]}>Tên người {direction === 'RECEIPT' ? 'nộp' : 'nhận'}</Text><Pressable accessibilityRole="button" onPress={() => setShowQuickParty(!showQuickParty)} style={styles.link}><AppIcon icon={Plus} size={15} color={theme.primary} /><Text style={{ color: theme.primary }}>Tạo mới</Text></Pressable></View>
        <Field label="" testID="cashbook-counterpartyName" value={counterpartyName} error={errors.counterpartyName} placeholder="Tìm kiếm hoặc nhập tên" onChangeText={value => { setCounterpartyName(value); setCounterpartyId(null); }} />
      </View>
    </View>
    {showQuickParty && <View style={[styles.quickParty, { borderColor: theme.borderSubtle }]}><Field label="Tên người nộp/nhận *" value={quickPartyName} onChangeText={setQuickPartyName} /><Field label="Điện thoại" value={quickPartyPhone} keyboardType="phone-pad" onChangeText={setQuickPartyPhone} /><Button variant="secondary" label="Thêm đối tượng" onPress={() => { void createParty(); }} /></View>}
    {fields.method && <SelectionGroup label="Phương thức thanh toán" error={errors.paymentMethod}>
      <Option testID="cashbook-payment-BANK_TRANSFER" label="Chuyển khoản" selected={paymentMethod === 'BANK_TRANSFER'} onPress={() => setPaymentMethod('BANK_TRANSFER')} />
      <Option testID="cashbook-payment-CREDIT_CARD" label="Thẻ" selected={paymentMethod === 'CREDIT_CARD'} onPress={() => setPaymentMethod('CREDIT_CARD')} />
    </SelectionGroup>}
    {fields.account && <SelectionGroup label={direction === 'RECEIPT' ? 'Tài khoản nhận' : 'Tài khoản chi'} error={errors.accountId}>
      {activeAccounts.map(item => <Option key={item.id} testID={`cashbook-account-${item.id}`} label={`${item.name}${item.accountNumber || item.walletIdentifier ? ` · ${item.accountNumber || item.walletIdentifier}` : ''}`} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}
    </SelectionGroup>}
    <Field label="Số tiền" testID="cashbook-amount" value={amountText} error={errors.amount} keyboardType="number-pad" placeholder="0" onChangeText={value => setAmountText(value.replace(/[^0-9]/g, ''))} />
    <Field label="Ghi chú" value={note} onChangeText={setNote} multiline maxLength={1000} style={styles.note} placeholder="Nhập ghi chú" />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: affectsBusinessResult }} onPress={() => setAffectsBusinessResult(value => !value)} style={styles.checkboxRow}>
      <View style={[styles.checkbox, { borderColor: affectsBusinessResult ? theme.primary : theme.borderStrong, backgroundColor: affectsBusinessResult ? theme.primary : theme.surfaceBase }]}>{affectsBusinessResult && <AppIcon icon={Check} size={14} color="#fff" />}</View>
      <Text style={{ color: theme.textPrimary }}>Hạch toán vào kết quả hoạt động kinh doanh</Text>
    </Pressable>
  </SupplierModalShell>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg }, stack: { gap: spacing.md }, column: { flex: 1, minWidth: 0 },
  selectionGroup: { gap: spacing.xs }, label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, flexGrow: 1, minWidth: 150 },
  radio: { width: 17, height: 17, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, dot: { width: 9, height: 9, borderRadius: 5 },
  helper: { fontSize: typography.sizes.xs }, note: { minHeight: 82, textAlignVertical: 'top' }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { minHeight: 36, flexDirection: 'row', gap: 4, alignItems: 'center' }, quickParty: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.md },
  checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, checkbox: { width: 18, height: 18, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }
});
