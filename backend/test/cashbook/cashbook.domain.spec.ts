import { describe, expect, it } from 'vitest';
import {
  assertVndAmount,
  requiredAccountType,
  signedAmount,
  voucherSourceKey
} from '../../src/modules/cashbook/cashbook.domain';

describe('cashbook domain', () => {
  it('maps payment methods to account types', () => {
    expect(requiredAccountType('CASH')).toBe('CASH');
    expect(requiredAccountType('BANK_TRANSFER')).toBe('BANK');
    expect(requiredAccountType('CREDIT_CARD')).toBe('BANK');
    expect(requiredAccountType('E_WALLET')).toBe('E_WALLET');
  });

  it.each([0, -1, 2_000_000_001, 1.5])('rejects invalid VND %s', amount => {
    expect(() => assertVndAmount(amount)).toThrow();
  });

  it('accepts positive whole VND amounts within the supported range', () => {
    expect(() => assertVndAmount(1)).not.toThrow();
    expect(() => assertVndAmount(2_000_000_000)).not.toThrow();
  });

  it('uses opposite signs for receipt and payment', () => {
    expect(signedAmount('RECEIPT', 100)).toBe(100);
    expect(signedAmount('PAYMENT', 100)).toBe(-100);
  });

  it('builds stable source keys for idempotent automatic posting', () => {
    expect(voucherSourceKey('ORDER_PAYMENT', 42)).toBe('ORDER_PAYMENT:42');
  });
});
