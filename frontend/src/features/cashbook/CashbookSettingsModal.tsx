import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import type { CashbookSettingsDto, CashVoucherDirection, FinancialAccountType } from '../../api/contracts';
import {
  activateCashbookApi,
  createCashFlowCategoryApi,
  createFinancialAccountApi,
  fetchCashbookSettingsApi,
  updateCashFlowCategoryApi,
  updateFinancialAccountApi
} from '../../api/cashbook';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon, Button, Field, InlineAlert } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { SupplierModalShell } from '../admin/SupplierModalShell';

export function CashbookSettingsModal({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth(); const { theme } = useTheme();
  const [settings, setSettings] = useState<CashbookSettingsDto | null>(null);
  const [opening, setOpening] = useState<Record<number, string>>({});
  const [activatedAt, setActivatedAt] = useState('');
  const [accountType, setAccountType] = useState<FinancialAccountType>('BANK');
  const [accountName, setAccountName] = useState(''); const [institution, setInstitution] = useState(''); const [identifier, setIdentifier] = useState('');
  const [categoryDirection, setCategoryDirection] = useState<CashVoucherDirection>('RECEIPT'); const [categoryName, setCategoryName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const busyRef = useRef(false);
  const load = useCallback(async () => {
    const next = await fetchCashbookSettingsApi(token); setSettings(next);
    setOpening(Object.fromEntries(next.accounts.map(item => [item.id, String(item.openingBalance)])));
  }, [token]);
  useEffect(() => {
    if (!visible) return;
    setActivatedAt(new Date().toISOString()); setError(''); setSuccess('');
    load().catch((failure: Error) => setError(failure.message));
  }, [load, visible]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setSuccess('');
    try { await action(); await load(); setSuccess(message); onChanged(); }
    catch (failure: any) { setError(failure.message || 'Không thể cập nhật thiết lập'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const activate = () => run(() => activateCashbookApi(token, {
    activatedAt,
    accounts: (settings?.accounts || []).filter(item => item.isActive).map(item => ({ id: item.id, openingBalance: Number(opening[item.id] || 0) }))
  }), 'Đã kích hoạt Sổ quỹ và khóa ngày bắt đầu');
  const createAccount = () => {
    if (!accountName.trim()) { setError('Vui lòng nhập tên tài khoản'); return; }
    if (accountType !== 'CASH' && (!institution.trim() || !identifier.trim())) { setError('Vui lòng nhập đơn vị và số/định danh tài khoản'); return; }
    void run(() => createFinancialAccountApi(token, {
      name: accountName.trim(), type: accountType, openingBalance: 0,
      bankName: accountType === 'BANK' ? institution.trim() : null,
      accountNumber: accountType === 'BANK' ? identifier.trim() : null,
      walletProvider: accountType === 'E_WALLET' ? institution.trim() : null,
      walletIdentifier: accountType === 'E_WALLET' ? identifier.trim() : null
    }), 'Đã thêm tài khoản').then(() => { setAccountName(''); setInstitution(''); setIdentifier(''); });
  };
  const createCategory = () => {
    if (categoryName.trim().length < 2) { setError('Tên loại thu/chi cần ít nhất 2 ký tự'); return; }
    void run(() => createCashFlowCategoryApi(token, { name: categoryName.trim(), direction: categoryDirection }), 'Đã thêm loại thu/chi').then(() => setCategoryName(''));
  };
  const grouped = useMemo(() => ({
    CASH: settings?.accounts.filter(item => item.type === 'CASH') || [],
    BANK: settings?.accounts.filter(item => item.type === 'BANK') || [],
    E_WALLET: settings?.accounts.filter(item => item.type === 'E_WALLET') || []
  }), [settings]);
  const typeLabel = (type: FinancialAccountType) => type === 'CASH' ? 'Tiền mặt' : type === 'BANK' ? 'Tài khoản ngân hàng' : 'Ví điện tử';
  return <SupplierModalShell visible={visible} title="Thiết lập Sổ quỹ" onClose={onClose} busy={busy} footer={<Button variant="primary" label="Đóng" onPress={onClose} disabled={busy} />}>
    {!!error && <InlineAlert message={error} />}{!!success && <InlineAlert tone="success" message={success} />}
    {!settings?.activatedAt && <View style={[styles.section, { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Bắt đầu Sổ quỹ và nhập số dư đầu kỳ</Text>
      <Text style={{ color: theme.textSecondary }}>Chỉ chứng từ phát sinh từ thời điểm này mới tự động vào Sổ quỹ. Thao tác kích hoạt chỉ thực hiện một lần.</Text>
      <Field label="Ngày giờ bắt đầu *" value={activatedAt} onChangeText={setActivatedAt} />
      {(settings?.accounts || []).filter(item => item.isActive).map(item => <Field key={item.id} label={`Số dư đầu kỳ · ${item.name}`} value={opening[item.id] || '0'} keyboardType="number-pad" onChangeText={value => setOpening(current => ({ ...current, [item.id]: value.replace(/[^0-9]/g, '') }))} />)}
      <Button variant="primary" label="Kích hoạt Sổ quỹ" loading={busy} disabled={!settings?.accounts.some(item => item.type === 'CASH' && item.isDefault && item.isActive)} onPress={() => { void activate(); }} />
    </View>}
    {!!settings?.activatedAt && <InlineAlert tone="success" message={`Sổ quỹ đã hoạt động từ ${new Date(settings.activatedAt).toLocaleString('vi-VN')}. Số dư đầu kỳ đã khóa khi có phát sinh.`} />}
    <View style={[styles.section, { borderColor: theme.borderSubtle }]}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Tài khoản quỹ</Text>
      {(['CASH', 'BANK', 'E_WALLET'] as const).map(type => <View key={type} style={styles.group}>
        <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{typeLabel(type)}</Text>
        {grouped[type].map(item => <View key={item.id} style={[styles.row, { borderBottomColor: theme.borderSubtle }]}>
          <View style={{ flex: 1 }}><Text style={{ color: theme.textPrimary }}>{item.name}{item.isDefault ? ' · Mặc định' : ''}</Text><Text style={{ color: theme.textSecondary }}>{item.accountNumber || item.walletIdentifier || item.code}</Text></View>
          <Button variant={item.isActive ? 'quiet' : 'secondary'} label={item.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'} disabled={busy} onPress={() => { void run(() => updateFinancialAccountApi(token, item.id, { isActive: !item.isActive }), 'Đã cập nhật tài khoản'); }} />
        </View>)}
      </View>)}
      <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>Thêm tài khoản</Text>
      <View style={styles.choices}>{(['BANK', 'E_WALLET'] as const).map(type => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: accountType === type }} onPress={() => setAccountType(type)} style={[styles.choice, { borderColor: accountType === type ? theme.primary : theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>{typeLabel(type)}</Text></Pressable>)}</View>
      <Field label="Tên tài khoản *" value={accountName} onChangeText={setAccountName} />
      <View style={styles.twoColumns}><View style={{ flex: 1 }}><Field label={accountType === 'BANK' ? 'Ngân hàng *' : 'Nhà cung cấp ví *'} value={institution} onChangeText={setInstitution} /></View><View style={{ flex: 1 }}><Field label={accountType === 'BANK' ? 'Số tài khoản *' : 'Định danh ví *'} value={identifier} onChangeText={setIdentifier} /></View></View>
      <Button variant="secondary" label="Thêm tài khoản" icon={Plus} disabled={busy} onPress={createAccount} />
    </View>
    <View style={[styles.section, { borderColor: theme.borderSubtle }]}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Loại thu/chi</Text>
      {(settings?.categories || []).map(item => <View key={item.id} style={[styles.row, { borderBottomColor: theme.borderSubtle }]}>
        <View style={{ flex: 1 }}><Text style={{ color: theme.textPrimary }}>{item.name}</Text><Text style={{ color: theme.textSecondary }}>{item.direction === 'RECEIPT' ? 'Phiếu thu' : 'Phiếu chi'}{item.isSystem ? ' · Hệ thống' : ''}</Text></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.isActive }} onPress={() => { void run(() => updateCashFlowCategoryApi(token, item.id, { isActive: !item.isActive }), 'Đã cập nhật loại thu/chi'); }} style={styles.checkHit}><View style={[styles.check, { borderColor: item.isActive ? theme.primary : theme.borderStrong, backgroundColor: item.isActive ? theme.primary : theme.surfaceBase }]}>{item.isActive && <AppIcon icon={Check} size={14} color="#fff" />}</View></Pressable>
      </View>)}
      <View style={styles.choices}>{(['RECEIPT', 'PAYMENT'] as const).map(direction => <Pressable key={direction} accessibilityRole="radio" accessibilityState={{ checked: categoryDirection === direction }} onPress={() => setCategoryDirection(direction)} style={[styles.choice, { borderColor: categoryDirection === direction ? theme.primary : theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>{direction === 'RECEIPT' ? 'Loại thu' : 'Loại chi'}</Text></Pressable>)}</View>
      <Field label="Tên loại thu/chi *" value={categoryName} onChangeText={setCategoryName} />
      <Button variant="secondary" label="Thêm loại thu/chi" icon={Plus} disabled={busy} onPress={createCategory} />
    </View>
  </SupplierModalShell>;
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md }, sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: 17 },
  group: { gap: spacing.xs }, groupTitle: { fontFamily: typography.families.bodySemibold, fontSize: 13, textTransform: 'uppercase' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1 }, twoColumns: { flexDirection: 'row', gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1 },
  checkHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, check: { width: 18, height: 18, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }
});
