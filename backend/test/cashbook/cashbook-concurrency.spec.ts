import { CashVoucherSourceType, PaymentMethod } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { CashbookPostingService } from '../../src/modules/cashbook/cashbook-posting.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('CashbookPostingService concurrency and cutover', () => {
  let actor: { id: number; name: string };
  let cashId: number;

  beforeEach(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({ data: { username: 'posting-admin', passwordHash: 'hash', name: 'Posting admin', role: 'ADMIN' } });
    actor = { id: user.id, name: user.name };
    const cash = await prismaTest.financialAccount.create({
      data: { code: 'CASH', name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000, isDefault: true }
    });
    cashId = cash.id;
    await prismaTest.cashFlowCategory.createMany({ data: [
      { code: 'CUSTOMER_PAYMENT', name: 'Khách thanh toán', direction: 'RECEIPT', isSystem: true },
      { code: 'OTHER_PAYMENT', name: 'Chi khác', direction: 'PAYMENT', isSystem: true }
    ] });
    await prismaTest.cashbookSetting.create({ data: { id: 1, activatedAt: new Date('2026-09-23T05:00:00Z'), activatedByUserId: user.id } });
  });

  const post = (overrides: Partial<Parameters<typeof CashbookPostingService.post>[1]> = {}) => prismaTest.$transaction(tx =>
    CashbookPostingService.post(tx, {
      direction: 'PAYMENT',
      paymentMethod: PaymentMethod.CASH,
      categoryCode: 'OTHER_PAYMENT',
      amount: 100_000,
      occurredAt: new Date('2026-09-23T05:00:00Z'),
      sourceType: CashVoucherSourceType.PURCHASE_RECEIPT,
      sourceId: Math.floor(Math.random() * 1_000_000),
      affectsBusinessResult: true,
      ...overrides
    }, actor)
  );

  it('does not post before the activation boundary', async () => {
    expect(await post({ occurredAt: new Date('2026-09-23T04:59:59.999Z') })).toBeNull();
    expect(await prismaTest.cashVoucher.count()).toBe(0);
  });

  it('uses source keys to prevent duplicate automatic posting', async () => {
    const results = await Promise.allSettled([post({ sourceId: 91 }), post({ sourceId: 91 })]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: 'PURCHASE_RECEIPT:91' } })).toBe(1);
  });

  it('serializes payments so concurrent expenses cannot overspend', async () => {
    const results = await Promise.allSettled([
      post({ sourceId: 101, amount: 700_000 }),
      post({ sourceId: 102, amount: 700_000 })
    ]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(item => item.status === 'rejected')).toHaveLength(1);
    const payments = await prismaTest.cashVoucher.aggregate({ where: { accountId: cashId }, _sum: { amount: true } });
    expect(payments._sum.amount).toBe(700_000);
  });
});
