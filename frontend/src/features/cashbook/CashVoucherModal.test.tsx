import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashFlowCategoryDto, FinancialAccountDto } from '../../api/contracts';

const { native } = vi.hoisted(() => ({
  native: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));

vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'),
  KeyboardAvoidingView: native('KeyboardAvoidingView'), Modal: native('Modal'), Platform: { OS: 'web' },
  Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (value: any) => value },
  Text: native('Text'), TextInput: native('TextInput'), View: native('View'),
  useWindowDimensions: () => ({ width: 1200, height: 900 })
}));
vi.mock('lucide-react-native', () => ({ Check: native('Icon'), ChevronDown: native('Icon'), Plus: native('Icon'), X: native('Icon') }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token', user: { id: 1, name: 'Khánh', role: 'ADMIN' } }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }) }));
vi.mock('../../api/cashbook', () => ({
  createCashVoucherApi: vi.fn(),
  fetchCashbookCounterpartiesApi: vi.fn(async () => []),
  fetchCashbookPurchaseInvoicesApi: vi.fn(async () => [])
}));
vi.mock('./cashbookPrint', () => ({ printCashVoucher: vi.fn(async () => undefined) }));

import { createCashVoucherApi } from '../../api/cashbook';
import { printCashVoucher } from './cashbookPrint';
import { CashVoucherModal } from './CashVoucherModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const accounts: FinancialAccountDto[] = [
  { id: 1, code: 'TM', name: 'Tiền mặt', type: 'CASH', openingBalance: 0, openingAt: null, bankName: null, accountNumber: null, walletProvider: null, walletIdentifier: null, isDefault: true, isActive: true, createdAt: '', updatedAt: '' },
  { id: 2, code: 'VCB', name: 'Vietcombank', type: 'BANK', openingBalance: 0, openingAt: null, bankName: 'VCB', accountNumber: '••••1234', walletProvider: null, walletIdentifier: null, isDefault: true, isActive: true, createdAt: '', updatedAt: '' },
  { id: 3, code: 'MOMO', name: 'MoMo', type: 'E_WALLET', openingBalance: 0, openingAt: null, bankName: null, accountNumber: null, walletProvider: 'MoMo', walletIdentifier: '••••5678', isDefault: true, isActive: true, createdAt: '', updatedAt: '' }
];
const categories: CashFlowCategoryDto[] = [
  { id: 10, code: 'OTHER_RECEIPT', name: 'Thu khác', direction: 'RECEIPT', affectsBusinessResultDefault: true, isSystem: false, isActive: true, createdAt: '', updatedAt: '' },
  { id: 20, code: 'OTHER_PAYMENT', name: 'Chi khác', direction: 'PAYMENT', affectsBusinessResultDefault: true, isSystem: false, isActive: true, createdAt: '', updatedAt: '' }
];

function textOf(screen: any) { return JSON.stringify(screen.toJSON()); }
async function render(direction: 'RECEIPT' | 'PAYMENT', accountType: 'CASH' | 'BANK' | 'E_WALLET') {
  let screen: any;
  await act(async () => { screen = create(<CashVoucherModal visible direction={direction} accountType={accountType} accounts={accounts} categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />); });
  return screen;
}
async function completeCashReceipt(screen: any) {
  await act(async () => {
    screen.root.findByProps({ testID: 'cashbook-category-10' }).props.onPress();
    screen.root.findByProps({ testID: 'cashbook-counterpartyName' }).props.onChangeText('Anh Giang');
    screen.root.findByProps({ testID: 'cashbook-amount' }).props.onChangeText('1615000');
  });
}

describe('CashVoucherModal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['RECEIPT', 'CASH', 'Tạo phiếu thu tiền mặt', false, false, false],
    ['RECEIPT', 'BANK', 'Tạo phiếu thu ngân hàng', false, true, true],
    ['RECEIPT', 'E_WALLET', 'Tạo phiếu thu ví điện tử', false, false, true],
    ['PAYMENT', 'CASH', 'Tạo phiếu chi tiền mặt', true, false, false],
    ['PAYMENT', 'BANK', 'Tạo phiếu chi ngân hàng', true, true, true],
    ['PAYMENT', 'E_WALLET', 'Tạo phiếu chi ví điện tử', true, false, true]
  ] as const)('renders %s/%s with the approved field structure', async (direction, accountType, title, invoice, method, account) => {
    const screen = await render(direction, accountType);
    const content = textOf(screen);
    expect(content).toContain(title);
    expect(content.includes('Số – Ngày hóa đơn')).toBe(invoice);
    expect(content.includes('Phương thức thanh toán')).toBe(method);
    expect(content.includes(direction === 'RECEIPT' ? 'Tài khoản nhận' : 'Tài khoản chi')).toBe(account);
    await act(async () => screen.unmount());
  });

  it('preserves entered fields after a failed save and blocks a double press', async () => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(createCashVoucherApi).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    const screen = await render('RECEIPT', 'CASH');
    await completeCashReceipt(screen);
    const save = screen.root.findByProps({ testID: 'cashbook-save' });
    await act(async () => {
      void save.props.onPress();
      void save.props.onPress();
      await Promise.resolve();
    });
    expect(createCashVoucherApi).toHaveBeenCalledTimes(1);
    await act(async () => { rejectSave(new Error('Mất kết nối')); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'cashbook-counterpartyName' }).props.value).toBe('Anh Giang');
    expect(screen.root.findByProps({ testID: 'cashbook-amount' }).props.value).toBe('1615000');
    expect(textOf(screen)).toContain('Mất kết nối');
    await act(async () => screen.unmount());
  });

  it('prints only after Lưu & In has received the saved voucher', async () => {
    let resolveSave!: (value: any) => void;
    vi.mocked(createCashVoucherApi).mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    const onSaved = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<CashVoucherModal visible direction="RECEIPT" accountType="CASH" accounts={accounts} categories={categories} onClose={vi.fn()} onSaved={onSaved} />); });
    await completeCashReceipt(screen);
    await act(async () => { void screen.root.findByProps({ testID: 'cashbook-save-print' }).props.onPress(); await Promise.resolve(); });
    expect(printCashVoucher).not.toHaveBeenCalled();
    const voucher = { id: 5, code: 'PT000005', direction: 'RECEIPT', amount: 1_615_000 };
    await act(async () => { resolveSave(voucher); await Promise.resolve(); await Promise.resolve(); });
    expect(printCashVoucher).toHaveBeenCalledWith(voucher);
    expect(onSaved).toHaveBeenCalledWith(voucher);
    await act(async () => screen.unmount());
  });
});
