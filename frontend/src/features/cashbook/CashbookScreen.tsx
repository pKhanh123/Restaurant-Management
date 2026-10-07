import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Download, Filter, Plus, RefreshCw, Search, Settings } from 'lucide-react-native';
import type { CashbookFilter, CashbookListDto, CashVoucherDirection, FinancialAccountType } from '../../api/contracts';
import { downloadCashbookExportApi, fetchCashbookApi, fetchCashbookSettingsApi } from '../../api/cashbook';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon, Button, EmptyState, Field, InlineAlert, StatusBadge, Surface } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { saveCashbookFile } from './cashbookFiles';
import { CashbookSettingsModal } from './CashbookSettingsModal';
import { CashVoucherModal } from './CashVoucherModal';
import { formatSignedVoucherAmount } from './cashbookViewModel';

type Composer = { direction: CashVoucherDirection; accountType: FinancialAccountType };
function money(value = 0) { return new Intl.NumberFormat('vi-VN').format(value) + ' ₫'; }

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.choice}>
    <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}</View><Text style={{ color: theme.textPrimary }}>{label}</Text>
  </Pressable>;
}

export function CashbookScreen({ revision = 0 }: { revision?: number }) {
  const { token, user } = useAuth(); const { theme } = useTheme(); const { width } = useWindowDimensions();
  const narrow = width < 768;
  const [filter, setFilter] = useState<CashbookFilter>({ status: 'POSTED', page: 1, pageSize: 50 });
  const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [data, setData] = useState<CashbookListDto | null>(null); const [settingsData, setSettingsData] = useState<Awaited<ReturnType<typeof fetchCashbookSettingsApi>> | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [localRevision, setLocalRevision] = useState(0);
  const [showFilters, setShowFilters] = useState(false); const [actionMenu, setActionMenu] = useState<CashVoucherDirection | null>(null); const [exportMenu, setExportMenu] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null); const [showSettings, setShowSettings] = useState(false); const [exporting, setExporting] = useState(false);
  const patch = (value: Partial<CashbookFilter>) => setFilter(current => ({ ...current, ...value, page: 1 }));
  const refresh = () => setLocalRevision(value => value + 1);
  useEffect(() => { const timer = setTimeout(() => setFilter(current => ({ ...current, search: search.trim() || undefined, page: 1 })), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([fetchCashbookApi(token, filter), fetchCashbookSettingsApi(token)]).then(([list, settings]) => { if (active) { setData(list); setSettingsData(settings); } })
      .catch((failure: Error) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, localRevision, revision, token]);
  const exportFile = async (format: 'csv' | 'xlsx') => {
    if (exporting) return;
    setExporting(true); setExportMenu(false); setError('');
    try { await saveCashbookFile(await downloadCashbookExportApi(token, filter, format), `So_quy.${format}`); }
    catch (failure: any) { setError(failure.message); }
    finally { setExporting(false); }
  };
  const applyDates = () => {
    try {
      patch({ from: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59+07:00`).toISOString() : undefined });
      if (narrow) setShowFilters(false);
    } catch { setError('Ngày lọc không hợp lệ'); }
  };
  const summary = data?.summary;
  const activeAccounts = settingsData?.accounts || []; const categories = settingsData?.categories || [];
  const cards = [
    ['Quỹ đầu kỳ', money(summary?.openingBalance), theme.textPrimary], ['Tổng thu', money(summary?.totalReceipt), theme.primary],
    ['Tổng chi', '-' + money(summary?.totalPayment), theme.danger], ['Tồn quỹ', money(summary?.closingBalance), theme.success]
  ];
  const actionOptions = (direction: CashVoucherDirection) => <View style={[styles.actionOptions, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
    {([['CASH', 'Tiền mặt'], ['BANK', 'Tài khoản ngân hàng'], ['E_WALLET', 'Ví điện tử']] as const).map(([accountType, label]) => <Pressable key={accountType} accessibilityRole="button" onPress={() => { setComposer({ direction, accountType }); setActionMenu(null); }} style={styles.menuItem}><Text style={{ color: theme.textPrimary }}>{label}</Text></Pressable>)}
  </View>;
  const filters = <ScrollView style={[styles.sidebar, { backgroundColor: theme.surfaceBase }, narrow && styles.mobileFilters]} contentContainerStyle={styles.filterBody}>
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Quỹ tiền</Text>
    <Choice label="Tổng quỹ" selected={!filter.accountType} onPress={() => patch({ accountType: undefined, accountId: undefined })} />
    <Choice label="Tiền mặt" selected={filter.accountType === 'CASH'} onPress={() => patch({ accountType: 'CASH', accountId: undefined })} />
    <Choice label="Tài khoản ngân hàng" selected={filter.accountType === 'BANK'} onPress={() => patch({ accountType: 'BANK', accountId: undefined })} />
    <Choice label="Ví điện tử" selected={filter.accountType === 'E_WALLET'} onPress={() => patch({ accountType: 'E_WALLET', accountId: undefined })} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Thời gian</Text>
    <Field label="Từ ngày" value={from} placeholder="YYYY-MM-DD" onChangeText={setFrom} /><Field label="Đến ngày" value={to} placeholder="YYYY-MM-DD" onChangeText={setTo} /><Button variant="secondary" label="Áp dụng thời gian" onPress={applyDates} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Loại chứng từ</Text>
    <Choice label="Tất cả" selected={!filter.direction} onPress={() => patch({ direction: undefined })} /><Choice label="Phiếu thu" selected={filter.direction === 'RECEIPT'} onPress={() => patch({ direction: 'RECEIPT' })} /><Choice label="Phiếu chi" selected={filter.direction === 'PAYMENT'} onPress={() => patch({ direction: 'PAYMENT' })} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Trạng thái</Text>
    <Choice label="Tất cả" selected={!filter.status} onPress={() => patch({ status: undefined })} /><Choice label="Đã thanh toán" selected={filter.status === 'POSTED'} onPress={() => patch({ status: 'POSTED' })} /><Choice label="Đã hủy" selected={filter.status === 'CANCELLED'} onPress={() => patch({ status: 'CANCELLED' })} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Kết quả kinh doanh</Text>
    <Choice label="Tất cả" selected={filter.affectsBusinessResult === undefined} onPress={() => patch({ affectsBusinessResult: undefined })} /><Choice label="Có" selected={filter.affectsBusinessResult === true} onPress={() => patch({ affectsBusinessResult: true })} /><Choice label="Không" selected={filter.affectsBusinessResult === false} onPress={() => patch({ affectsBusinessResult: false })} />
    <Button variant="quiet" label="Xóa bộ lọc" onPress={() => { setFrom(''); setTo(''); setSearch(''); setFilter({ status: 'POSTED', page: 1, pageSize: 50 }); }} />
  </ScrollView>;
  const rows = useMemo(() => data?.items || [], [data]);
  return <View style={[styles.root, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={styles.toolbar}><Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Tổng quỹ</Text>
      <View style={[styles.search, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={Search} size={18} color={theme.textSecondary} /><TextInput accessibilityLabel="Tìm phiếu thu chi" value={search} onChangeText={setSearch} placeholder="Theo mã phiếu thu/chi" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View>
      <View style={styles.actions}>{narrow && <Button variant="secondary" label="Bộ lọc" icon={Filter} onPress={() => setShowFilters(value => !value)} />}
        <View><Button variant="primary" label="Phiếu thu" icon={Plus} onPress={() => setActionMenu(value => value === 'RECEIPT' ? null : 'RECEIPT')} />{actionMenu === 'RECEIPT' && actionOptions('RECEIPT')}</View>
        <View><Button variant="primary" label="Phiếu chi" icon={Plus} onPress={() => setActionMenu(value => value === 'PAYMENT' ? null : 'PAYMENT')} />{actionMenu === 'PAYMENT' && actionOptions('PAYMENT')}</View>
        <View><Button variant="secondary" label="Xuất file" icon={Download} loading={exporting} onPress={() => setExportMenu(value => !value)} />{exportMenu && <View style={[styles.actionOptions, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}><Pressable style={styles.menuItem} onPress={() => { void exportFile('xlsx'); }}><Text style={{ color: theme.textPrimary }}>Excel (.xlsx)</Text></Pressable><Pressable style={styles.menuItem} onPress={() => { void exportFile('csv'); }}><Text style={{ color: theme.textPrimary }}>CSV</Text></Pressable></View>}</View>
        {user?.role === 'ADMIN' && <Button variant="secondary" label="Thiết lập" icon={Settings} onPress={() => setShowSettings(true)} />}<Pressable accessibilityRole="button" accessibilityLabel="Tải lại" onPress={refresh} style={styles.iconButton}><AppIcon icon={RefreshCw} color={theme.textSecondary} /></Pressable>
      </View>
    </View>
    {!settingsData?.activatedAt && !loading && <InlineAlert tone="warning" title="Sổ quỹ chưa kích hoạt" message="ADMIN cần nhập số dư đầu kỳ và ngày bắt đầu trước khi ghi nhận phiếu." />}
    {!!error && <InlineAlert message={error} />}{!!success && <InlineAlert tone="success" message={success} />}
    <View style={[styles.content, narrow && { flexDirection: 'column' }]}>{(!narrow || showFilters) && filters}<View style={styles.main}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRow}>{cards.map(([label, value, color]) => <Surface key={String(label)} level="base" style={styles.summaryCard}><Text style={{ color: theme.textSecondary }}>{label}</Text><Text style={[styles.summaryValue, { color: String(color) }]}>{value}</Text></Surface>)}</ScrollView>
      {loading ? <ActivityIndicator style={{ padding: 64 }} color={theme.primary} /> : error && !data ? <EmptyState title="Chưa tải được Sổ quỹ" description="Kiểm tra kết nối hoặc thử tải lại." action={<Button variant="secondary" label="Tải lại" onPress={refresh} />} /> : !rows.length ? <EmptyState title="Chưa có phiếu thu/chi phù hợp" description="Tạo phiếu mới hoặc thay đổi bộ lọc để xem dữ liệu." /> : narrow ? <ScrollView contentContainerStyle={styles.cardList}>{rows.map(item => <Surface key={item.id} level="base" style={styles.voucherCard}><View style={styles.cardTop}><Text style={[styles.code, { color: theme.primary }]}>{item.code}</Text><StatusBadge tone={item.status === 'POSTED' ? 'success' : 'neutral'} label={item.status === 'POSTED' ? 'Đã thanh toán' : 'Đã hủy'} /></View><Text style={{ color: theme.textPrimary }}>{item.category?.name || item.sourceCode || 'Thu/chi khác'}</Text><Text style={{ color: theme.textSecondary }}>{item.counterpartyName || 'Không ghi người nộp/nhận'} · {new Date(item.occurredAt).toLocaleString('vi-VN')}</Text><Text style={[styles.cardAmount, { color: item.direction === 'RECEIPT' ? theme.primary : theme.danger }]}>{formatSignedVoucherAmount(item)}</Text></Surface>)}</ScrollView> : <ScrollView horizontal style={[styles.table, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={{ minWidth: 1000, flexGrow: 1 }}><View style={{ flex: 1 }}>
        <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}><Text style={[styles.colCode, styles.heading, { color: theme.textPrimary }]}>Mã phiếu</Text><Text style={[styles.colTime, styles.heading, { color: theme.textPrimary }]}>Thời gian</Text><Text style={[styles.colCategory, styles.heading, { color: theme.textPrimary }]}>Loại thu chi</Text><Text style={[styles.colParty, styles.heading, { color: theme.textPrimary }]}>Người nộp/nhận</Text><Text style={[styles.colStatus, styles.heading, { color: theme.textPrimary }]}>Trạng thái</Text><Text style={[styles.colAmount, styles.heading, { color: theme.textPrimary }]}>Giá trị</Text></View>
        {rows.map(item => <View key={item.id} style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}><Text style={[styles.colCode, { color: theme.primary }]}>{item.code}</Text><Text style={[styles.colTime, { color: theme.textPrimary }]}>{new Date(item.occurredAt).toLocaleString('vi-VN')}</Text><Text style={[styles.colCategory, { color: theme.textPrimary }]}>{item.category?.name || item.sourceCode || 'Thu/chi khác'}</Text><Text style={[styles.colParty, { color: theme.textPrimary }]}>{item.counterpartyName || '—'}</Text><View style={styles.colStatus}><StatusBadge tone={item.status === 'POSTED' ? 'success' : 'neutral'} label={item.status === 'POSTED' ? 'Đã thanh toán' : 'Đã hủy'} /></View><Text style={[styles.colAmount, { color: item.direction === 'RECEIPT' ? theme.primary : theme.danger }]}>{formatSignedVoucherAmount(item)}</Text></View>)}
      </View></ScrollView>}
      <View style={styles.pagination}><Text style={{ color: theme.textSecondary }}>Trang {filter.page || 1}/{data?.pagination.totalPages || 1}</Text><Button variant="quiet" label="Trước" disabled={loading || (filter.page || 1) <= 1} onPress={() => setFilter(current => ({ ...current, page: (current.page || 1) - 1 }))} /><Button variant="quiet" label="Sau" disabled={loading || (filter.page || 1) >= (data?.pagination.totalPages || 1)} onPress={() => setFilter(current => ({ ...current, page: (current.page || 1) + 1 }))} /></View>
    </View></View>
    {composer && <CashVoucherModal visible direction={composer.direction} accountType={composer.accountType} accounts={activeAccounts} categories={categories} onClose={() => setComposer(null)} onSaved={voucher => { setComposer(null); setSuccess(`Đã tạo ${voucher.code}`); refresh(); }} />}
    {showSettings && <CashbookSettingsModal visible onClose={() => setShowSettings(false)} onChanged={refresh} />}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.sm, padding: spacing.md }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }, title: { fontFamily: typography.families.operationalBold, fontSize: 22, minWidth: 245 },
  search: { flex: 1, minWidth: 230, maxWidth: 500, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md }, searchInput: { flex: 1, minHeight: 42 }, actions: { marginLeft: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  actionOptions: { position: 'absolute', zIndex: 20, right: 0, top: 48, minWidth: 210, borderWidth: 1, borderRadius: radii.md, padding: spacing.xs }, menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  content: { flex: 1, minHeight: 0, flexDirection: 'row', gap: spacing.md }, sidebar: { width: 250, flexGrow: 0, flexShrink: 0, borderRadius: radii.lg }, mobileFilters: { width: '100%', maxHeight: 460 }, filterBody: { padding: spacing.md, gap: spacing.sm }, filterHeading: { marginTop: spacing.sm, fontFamily: typography.families.bodySemibold }, choice: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }, radio: { width: 17, height: 17, borderWidth: 1.5, borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, dot: { width: 9, height: 9, borderRadius: 5 },
  main: { flex: 1, minWidth: 0, gap: spacing.sm }, summaryRow: { gap: spacing.sm, paddingBottom: spacing.xs }, summaryCard: { width: 210, padding: spacing.md, gap: spacing.xs }, summaryValue: { fontFamily: typography.families.operationalBold, fontSize: 20 },
  table: { flex: 1, borderRadius: radii.lg }, tableHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, tableRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, heading: { fontFamily: typography.families.bodySemibold, fontSize: 12 }, colCode: { width: 125, paddingHorizontal: 10 }, colTime: { width: 165, paddingHorizontal: 10 }, colCategory: { flex: 1, minWidth: 180, paddingHorizontal: 10 }, colParty: { width: 210, paddingHorizontal: 10 }, colStatus: { width: 140, paddingHorizontal: 10 }, colAmount: { width: 145, paddingHorizontal: 10, textAlign: 'right', fontFamily: typography.families.bodySemibold },
  cardList: { gap: spacing.sm }, voucherCard: { padding: spacing.md, gap: spacing.xs }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, code: { fontFamily: typography.families.bodySemibold }, cardAmount: { fontFamily: typography.families.operationalBold, fontSize: 18, textAlign: 'right' }, pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm }
});
