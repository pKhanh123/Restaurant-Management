import type {
  CashFlowCategoryDto,
  CashVoucherDirection,
  FinancialAccountDto,
  FinancialAccountType,
  PaymentMethod
} from '../../api/contracts';

export interface CashVoucherFormValue {
  direction: CashVoucherDirection;
  accountType: FinancialAccountType;
  accountId?: number;
  paymentMethod?: PaymentMethod;
  categoryId?: number;
  amount?: number;
  occurredAt: string;
  counterpartyName?: string;
}

export interface CashVoucherFormErrors {
  accountId?: string;
  paymentMethod?: string;
  categoryId?: string;
  amount?: string;
  occurredAt?: string;
  counterpartyName?: string;
}

export function voucherFormFields(direction: CashVoucherDirection, accountType: FinancialAccountType) {
  return {
    invoice: direction === 'PAYMENT',
    method: accountType === 'BANK',
    account: accountType !== 'CASH'
  };
}

export function validateVoucherForm(
  form: CashVoucherFormValue,
  accounts: FinancialAccountDto[],
  categories: CashFlowCategoryDto[]
): { valid: boolean; errors: CashVoucherFormErrors; accountId?: number; paymentMethod: PaymentMethod } {
  const errors: CashVoucherFormErrors = {};
  const account = form.accountType === 'CASH'
    ? accounts.find(item => item.type === 'CASH' && item.isDefault && item.isActive)
    : accounts.find(item => item.id === form.accountId);

  if (!account) errors.accountId = form.accountType === 'CASH' ? 'Chưa có tài khoản tiền mặt mặc định' : 'Vui lòng chọn tài khoản';
  else if (!account.isActive) errors.accountId = 'Tài khoản đã ngừng hoạt động';
  else if (account.type !== form.accountType) errors.accountId = 'Tài khoản không phù hợp';

  let paymentMethod: PaymentMethod = 'CASH';
  if (form.accountType === 'BANK') {
    if (form.paymentMethod !== 'BANK_TRANSFER' && form.paymentMethod !== 'CREDIT_CARD') {
      errors.paymentMethod = 'Vui lòng chọn phương thức thanh toán';
    } else paymentMethod = form.paymentMethod;
  } else if (form.accountType === 'E_WALLET') paymentMethod = 'E_WALLET';

  const category = categories.find(item => item.id === form.categoryId);
  if (!category) errors.categoryId = 'Vui lòng chọn loại thu/chi';
  else if (!category.isActive || category.direction !== form.direction) errors.categoryId = 'Loại thu/chi không phù hợp';

  if (!Number.isInteger(form.amount) || (form.amount ?? 0) < 1 || (form.amount ?? 0) > 2_000_000_000) {
    errors.amount = 'Số tiền phải là số nguyên từ 1 đến 2.000.000.000';
  }
  if (!form.occurredAt?.trim()) errors.occurredAt = 'Vui lòng chọn thời gian';
  if (!form.counterpartyName?.trim()) errors.counterpartyName = 'Vui lòng nhập người nộp/nhận';

  return { valid: Object.keys(errors).length === 0, errors, accountId: account?.id, paymentMethod };
}

export function formatSignedVoucherAmount(item: Pick<{ direction: CashVoucherDirection; amount: number }, 'direction' | 'amount'>): string {
  const sign = item.direction === 'RECEIPT' ? '+' : '-';
  return `${sign}${new Intl.NumberFormat('vi-VN').format(item.amount)} ₫`;
}
