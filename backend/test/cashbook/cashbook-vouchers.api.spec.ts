import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('cash voucher API', () => {
  let token: string;
  let cashId: number;
  let bankId: number;
  let walletId: number;
  let receiptCategoryId: number;
  let paymentCategoryId: number;

  const api = () => request(app);
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const create = (body: Record<string, unknown>) => api().post('/api/cashbook/vouchers').set(auth()).send({
    occurredAt: '2026-09-23T12:30:00+07:00',
    affectsBusinessResult: true,
    ...body
  });

  beforeEach(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({ data: { username: 'voucher-admin', passwordHash: 'hash', name: 'Quản lý quỹ', role: 'ADMIN' } });
    token = jwt.sign({ sub: String(user.id), username: user.username, name: user.name, role: user.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
    const [cash, bank, wallet] = await Promise.all([
      prismaTest.financialAccount.create({ data: { code: 'CASH', name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000, openingAt: new Date('2026-09-23T05:00:00Z'), isDefault: true } }),
      prismaTest.financialAccount.create({ data: { code: 'BANK', name: 'Ngân hàng', type: 'BANK', openingBalance: 1_000_000, openingAt: new Date('2026-09-23T05:00:00Z'), isDefault: true, bankName: 'VCB', accountNumber: '1234' } }),
      prismaTest.financialAccount.create({ data: { code: 'WALLET', name: 'Ví điện tử', type: 'E_WALLET', openingBalance: 1_000_000, openingAt: new Date('2026-09-23T05:00:00Z'), isDefault: true, walletProvider: 'MoMo', walletIdentifier: '0909' } })
    ]);
    cashId = cash.id;
    bankId = bank.id;
    walletId = wallet.id;
    const [receipt, payment] = await Promise.all([
      prismaTest.cashFlowCategory.create({ data: { code: 'OTHER_RECEIPT', name: 'Thu khác', direction: 'RECEIPT' } }),
      prismaTest.cashFlowCategory.create({ data: { code: 'OTHER_PAYMENT', name: 'Chi khác', direction: 'PAYMENT' } })
    ]);
    receiptCategoryId = receipt.id;
    paymentCategoryId = payment.id;
    await prismaTest.cashbookSetting.create({ data: { id: 1, activatedAt: new Date('2026-09-23T05:00:00Z'), activatedByUserId: user.id } });
  });

  it('creates all six receipt/payment and account-type variants', async () => {
    const cases = [
      { direction: 'RECEIPT', paymentMethod: 'CASH', categoryId: receiptCategoryId },
      { direction: 'RECEIPT', paymentMethod: 'BANK_TRANSFER', accountId: bankId, categoryId: receiptCategoryId },
      { direction: 'RECEIPT', paymentMethod: 'E_WALLET', accountId: walletId, categoryId: receiptCategoryId },
      { direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: paymentCategoryId },
      { direction: 'PAYMENT', paymentMethod: 'CREDIT_CARD', accountId: bankId, categoryId: paymentCategoryId },
      { direction: 'PAYMENT', paymentMethod: 'E_WALLET', accountId: walletId, categoryId: paymentCategoryId }
    ];
    for (const item of cases) {
      const response = await create({ ...item, amount: 10_000, counterpartyName: 'Đối tượng thử' });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.data).toMatchObject({ direction: item.direction, amount: 10_000, status: 'POSTED' });
    }
    expect(await prismaTest.cashVoucher.count()).toBe(6);
  });

  it('filters vouchers and calculates opening, receipt, payment and closing totals', async () => {
    expect((await create({ direction: 'RECEIPT', paymentMethod: 'CASH', categoryId: receiptCategoryId, amount: 300_000, note: 'Thu thử' })).status).toBe(201);
    expect((await create({ direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: paymentCategoryId, amount: 200_000, note: 'Chi thử' })).status).toBe(201);

    const response = await api().get(`/api/cashbook/vouchers?accountId=${cashId}&direction=RECEIPT&q=Thu`).set(auth());
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.summary).toEqual({ openingBalance: 1_000_000, totalReceipt: 300_000, totalPayment: 200_000, closingBalance: 1_100_000 });
  });

  it('rejects wrong/inactive accounts, category mismatch and insufficient funds', async () => {
    expect((await create({ direction: 'RECEIPT', paymentMethod: 'BANK_TRANSFER', accountId: walletId, categoryId: receiptCategoryId, amount: 1 })).status).toBe(400);
    await prismaTest.financialAccount.update({ where: { id: bankId }, data: { isActive: false } });
    expect((await create({ direction: 'RECEIPT', paymentMethod: 'BANK_TRANSFER', accountId: bankId, categoryId: receiptCategoryId, amount: 1 })).status).toBe(400);
    expect((await create({ direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: receiptCategoryId, amount: 1 })).status).toBe(400);
    expect((await create({ direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: paymentCategoryId, amount: 1_000_001 })).status).toBe(409);
  });

  it('reverses a manual voucher exactly once and exposes a stable print contract', async () => {
    const created = await create({ direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: paymentCategoryId, amount: 250_000, note: 'Nhập nhầm' });
    const voucher = created.body.data;
    const [first, second] = await Promise.all([
      api().post(`/api/cashbook/vouchers/${voucher.id}/cancel`).set(auth()).send({ reason: 'Nhập nhầm' }),
      api().post(`/api/cashbook/vouchers/${voucher.id}/cancel`).set(auth()).send({ reason: 'Nhập nhầm' })
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await prismaTest.cashVoucher.count({ where: { reversalOfId: voucher.id } })).toBe(1);
    const print = await api().get(`/api/cashbook/vouchers/${voucher.id}/print`).set(auth());
    expect(print.status).toBe(200);
    expect(print.body.data).toMatchObject({ code: voucher.code, status: 'CANCELLED', amount: 250_000, account: { type: 'CASH' }, category: { code: 'OTHER_PAYMENT' } });
    expect(print.body.data.reversal).toMatchObject({ reversalOfId: voucher.id, sourceType: 'REVERSAL' });
  });

  it('exports a signed value column and excludes reversal rows from the normal list', async () => {
    const payment = await create({ direction: 'PAYMENT', paymentMethod: 'CASH', categoryId: paymentCategoryId, amount: 50_000 });
    await api().post(`/api/cashbook/vouchers/${payment.body.data.id}/cancel`).set(auth()).send({ reason: 'Sai phiếu' });
    const list = await api().get('/api/cashbook/vouchers').set(auth());
    expect(list.body.data.items).toHaveLength(1);
    const csv = await api().get('/api/cashbook/vouchers/export?format=csv').set(auth());
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Giá trị');
    expect(csv.text).toContain('-50000');
    expect(csv.text).not.toContain('REVERSAL');
  });
});
