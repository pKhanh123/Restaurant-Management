import { describe, expect, it } from 'vitest';
import type { CashFlowCategoryDto, FinancialAccountDto } from '../../api/contracts';
import {
  formatSignedVoucherAmount,
  validateVoucherForm,
  voucherFormFields
} from './cashbookViewModel';

const accounts: FinancialAccountDto[] = [
  { id: 1, code: 'TM', name: 'Tiền mặt', type: 'CASH', openingBalance: 0, openingAt: null, bankName: null, accountNumber: null, walletProvider: null, walletIdentifier: null, isDefault: true, isActive: true, createdAt: '', updatedAt: '' },
  { id: 2, code: 'BANK', name: 'VCB', type: 'BANK', openingBalance: 0, openingAt: null, bankName: 'VCB', accountNumber: '••••1234', walletProvider: null, walletIdentifier: null, isDefault: true, isActive: true, createdAt: '', updatedAt: '' },
  { id: 3, code: 'WALLET', name: 'MoMo', type: 'E_WALLET', openingBalance: 0, openingAt: null, bankName: null, accountNumber: null, walletProvider: 'MoMo', walletIdentifier: '••••5678', isDefault: true, isActive: false, createdAt: '', updatedAt: '' }
];

const categories: CashFlowCategoryDto[] = [
  { id: 10, code: 'OTHER_RECEIPT', name: 'Thu khác', direction: 'RECEIPT', affectsBusinessResultDefault: true, isSystem: false, isActive: true, createdAt: '', updatedAt: '' },
  { id: 20, code: 'OTHER_PAYMENT', name: 'Chi khác', direction: 'PAYMENT', affectsBusinessResultDefault: true, isSystem: false, isActive: true, createdAt: '', updatedAt: '' }
];

describe('cashbook voucher view model', () => {
  it('maps the six approved form variants to their conditional fields', () => {
    expect(voucherFormFields('RECEIPT', 'CASH')).toEqual({ invoice: false, method: false, account: false });
    expect(voucherFormFields('PAYMENT', 'BANK')).toEqual({ invoice: true, method: true, account: true });
    expect(voucherFormFields('PAYMENT', 'E_WALLET')).toEqual({ invoice: true, method: false, account: true });
    expect(voucherFormFields('RECEIPT', 'BANK')).toEqual({ invoice: false, method: true, account: true });
  });

  it('accepts a valid cash receipt and resolves the default cash account', () => {
    expect(validateVoucherForm({
      direction: 'RECEIPT', accountType: 'CASH', categoryId: 10, amount: 100_000,
      occurredAt: '2026-09-23T11:23:00.000+07:00', counterpartyName: 'Anh Giang'
    }, accounts, categories)).toEqual({ valid: true, errors: {}, accountId: 1, paymentMethod: 'CASH' });
  });

  it('rejects inactive or wrong-type accounts', () => {
    expect(validateVoucherForm({
      direction: 'PAYMENT', accountType: 'BANK', accountId: 1, paymentMethod: 'BANK_TRANSFER',
      categoryId: 20, amount: 100_000, occurredAt: '2026-09-23T11:23:00.000+07:00', counterpartyName: 'NCC'
    }, accounts, categories).errors.accountId).toBe('Tài khoản không phù hợp');
    expect(validateVoucherForm({
      direction: 'PAYMENT', accountType: 'E_WALLET', accountId: 3,
      categoryId: 20, amount: 100_000, occurredAt: '2026-09-23T11:23:00.000+07:00', counterpartyName: 'NCC'
    }, accounts, categories).errors.accountId).toBe('Tài khoản đã ngừng hoạt động');
  });

  it('requires a matching category, counterparty and whole-VND amount in bounds', () => {
    const result = validateVoucherForm({
      direction: 'PAYMENT', accountType: 'CASH', categoryId: 10, amount: 2_000_000_001.5,
      occurredAt: '', counterpartyName: '   '
    }, accounts, categories);
    expect(result.errors).toEqual({
      categoryId: 'Loại thu/chi không phù hợp',
      amount: 'Số tiền phải là số nguyên từ 1 đến 2.000.000.000',
      occurredAt: 'Vui lòng chọn thời gian',
      counterpartyName: 'Vui lòng nhập người nộp/nhận'
    });
  });

  it('requires bank payment method but derives wallet method', () => {
    expect(validateVoucherForm({
      direction: 'RECEIPT', accountType: 'BANK', accountId: 2, categoryId: 10,
      amount: 50_000, occurredAt: '2026-09-23T11:23:00.000+07:00', counterpartyName: 'Khách'
    }, accounts, categories).errors.paymentMethod).toBe('Vui lòng chọn phương thức thanh toán');
    expect(validateVoucherForm({
      direction: 'RECEIPT', accountType: 'E_WALLET', accountId: 3, categoryId: 10,
      amount: 50_000, occurredAt: '2026-09-23T11:23:00.000+07:00', counterpartyName: 'Khách'
    }, accounts, categories).paymentMethod).toBe('E_WALLET');
  });

  it('formats receipt positive and payment negative in VND', () => {
    expect(formatSignedVoucherAmount({ direction: 'RECEIPT', amount: 1_615_000 })).toBe('+1.615.000 ₫');
    expect(formatSignedVoucherAmount({ direction: 'PAYMENT', amount: 287_000 })).toBe('-287.000 ₫');
  });
});
