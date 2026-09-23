import {
  CashVoucherDirection,
  CashVoucherSourceType,
  FinancialAccountType,
  PaymentMethod
} from '@prisma/client';
import { ApiError } from '../../lib/api-error';

const MAX_VND_AMOUNT = 2_000_000_000;

export function assertVndAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_VND_AMOUNT) {
    throw ApiError.badRequest(`Số tiền phải là số nguyên VND từ 1 đến ${MAX_VND_AMOUNT.toLocaleString('vi-VN')}`);
  }
}

export function requiredAccountType(method: PaymentMethod): FinancialAccountType {
  switch (method) {
    case PaymentMethod.CASH:
      return FinancialAccountType.CASH;
    case PaymentMethod.BANK_TRANSFER:
    case PaymentMethod.CREDIT_CARD:
      return FinancialAccountType.BANK;
    case PaymentMethod.E_WALLET:
      return FinancialAccountType.E_WALLET;
  }
}

export function signedAmount(direction: CashVoucherDirection, amount: number): number {
  return direction === CashVoucherDirection.RECEIPT ? amount : -amount;
}

export function voucherSourceKey(type: CashVoucherSourceType | string, sourceId: number | string): string {
  return `${type}:${sourceId}`;
}
