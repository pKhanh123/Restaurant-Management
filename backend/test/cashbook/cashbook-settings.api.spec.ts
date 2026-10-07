import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const endpoint = '/api/cashbook';

describe('cashbook settings API', () => {
  let adminToken: string;
  let cashierToken: string;
  let cashAccountId: number;
  let receiptCategoryId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: 'cashbook-admin', passwordHash: 'hash', name: 'Quản lý quỹ', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'cashbook-cashier', passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' } })
    ]);
    const sign = (user: typeof admin) => jwt.sign(
      { sub: String(user.id), username: user.username, name: user.name, role: user.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    adminToken = sign(admin);
    cashierToken = sign(cashier);

    const cash = await prismaTest.financialAccount.create({
      data: { code: 'CASH-DEFAULT', name: 'Tiền mặt', type: 'CASH', isDefault: true }
    });
    cashAccountId = cash.id;
    await prismaTest.cashbookSetting.create({ data: { id: 1 } });
    const receipt = await prismaTest.cashFlowCategory.create({
      data: {
        code: 'CUSTOMER_PAYMENT',
        name: 'Khách thanh toán',
        direction: 'RECEIPT',
        affectsBusinessResultDefault: false,
        isSystem: true
      }
    });
    receiptCategoryId = receipt.id;
    await prismaTest.cashFlowCategory.createMany({ data: [
      { code: 'OTHER_RECEIPT', name: 'Thu khác', direction: 'RECEIPT', isSystem: true },
      { code: 'SUPPLIER_PAYMENT', name: 'Trả nhà cung cấp', direction: 'PAYMENT', affectsBusinessResultDefault: false, isSystem: true },
      { code: 'CUSTOMER_REFUND', name: 'Hoàn tiền khách', direction: 'PAYMENT', affectsBusinessResultDefault: false, isSystem: true }
    ] });
  });

  it('activates once without backfilling old documents and denies cashier administration', async () => {
    const denied = await request(app).post(`${endpoint}/activate`).set(auth(cashierToken)).send({
      activatedAt: '2026-09-23T12:00:00+07:00',
      accounts: [{ id: cashAccountId, openingBalance: 4_231_000 }]
    });
    expect(denied.status).toBe(403);

    const response = await request(app).post(`${endpoint}/activate`).set(auth(adminToken)).send({
      activatedAt: '2026-09-23T12:00:00+07:00',
      accounts: [{ id: cashAccountId, openingBalance: 4_231_000 }]
    });
    expect(response.status).toBe(200);
    expect(response.body.data.activatedAt).toBe('2026-09-23T05:00:00.000Z');
    expect(await prismaTest.cashVoucher.count()).toBe(0);
    expect((await prismaTest.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })).openingBalance).toBe(4_231_000);
    expect((await request(app).post(`${endpoint}/activate`).set(auth(adminToken)).send({
      activatedAt: '2026-09-24T12:00:00+07:00', accounts: [{ id: cashAccountId, openingBalance: 0 }]
    })).status).toBe(409);
  });

  it('allows only one active default per account type and masks account identifiers', async () => {
    const first = await request(app).post(`${endpoint}/accounts`).set(auth(adminToken)).send({
      code: 'BANK-VCB', name: 'Vietcombank', type: 'BANK', bankName: 'Vietcombank', accountNumber: '1234567890', isDefault: true
    });
    expect(first.status).toBe(201);
    const second = await request(app).post(`${endpoint}/accounts`).set(auth(adminToken)).send({
      code: 'BANK-ACB', name: 'ACB', type: 'BANK', bankName: 'ACB', accountNumber: '9876543210', isDefault: true
    });
    expect(second.status).toBe(201);
    expect(await prismaTest.financialAccount.count({ where: { type: 'BANK', isActive: true, isDefault: true } })).toBe(1);
    expect((await prismaTest.financialAccount.findUniqueOrThrow({ where: { id: first.body.data.id } })).isDefault).toBe(false);

    const list = await request(app).get(`${endpoint}/accounts`).set(auth(cashierToken));
    expect(list.status).toBe(200);
    expect(list.body.data.find((item: { code: string }) => item.code === 'BANK-ACB').accountNumber).toBe('••••3210');

    expect((await request(app).post(`${endpoint}/accounts`).set(auth(adminToken)).send({
      code: 'BANK-BAD', name: 'Thiếu metadata', type: 'BANK', isDefault: false
    })).status).toBe(400);
    expect((await request(app).post(`${endpoint}/accounts`).set(auth(adminToken)).send({
      code: 'WALLET-BAD', name: 'Thiếu ví', type: 'E_WALLET', walletProvider: 'MoMo'
    })).status).toBe(400);
    expect((await request(app).post(`${endpoint}/accounts`).set(auth(cashierToken)).send({
      code: 'BANK-NO', name: 'Không được phép', type: 'BANK', bankName: 'VCB', accountNumber: '1'
    })).status).toBe(403);
  });

  it('protects automatic categories and locks opening balances after the first posted voucher', async () => {
    const categoryResponse = await request(app).patch(`${endpoint}/categories/${receiptCategoryId}`).set(auth(adminToken)).send({ isActive: false });
    expect(categoryResponse.status).toBe(400);

    await prismaTest.cashVoucher.create({
      data: {
        code: 'PT000001', direction: 'RECEIPT', occurredAt: new Date(), amount: 100,
        accountId: cashAccountId, categoryId: receiptCategoryId, paymentMethod: 'CASH',
        sourceType: 'MANUAL', sourceKey: 'MANUAL:test-opening-lock'
      }
    });
    const changed = await request(app).patch(`${endpoint}/accounts/${cashAccountId}`).set(auth(adminToken)).send({ openingBalance: 10 });
    expect(changed.status).toBe(409);
  });

  it('creates and searches OTHER parties, aggregates source counterparties and selects posted purchase invoices', async () => {
    const party = await request(app).post(`${endpoint}/parties`).set(auth(adminToken)).send({
      name: 'Anh Minh', phone: '0909000000', note: 'Khách vãng lai'
    });
    expect(party.status).toBe(201);
    expect((await request(app).get(`${endpoint}/parties?q=Minh`).set(auth(cashierToken))).body.data).toEqual([
      expect.objectContaining({ type: 'OTHER', name: 'Anh Minh', phone: '0909000000' })
    ]);

    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-CASH', name: 'Công ty Minh', phone: '0911000000' } });
    await prismaTest.purchaseReceipt.create({
      data: {
        receiptCode: 'PN-CASH-01', supplierId: supplier.id, status: 'POSTED', receivedAt: new Date('2026-09-23T03:00:00Z'),
        invoiceNumber: 'HD-001', invoiceDate: new Date('2026-09-22T17:00:00Z'), subtotalAmount: 500_000, paidAmount: 100_000
      }
    });

    const counterparties = await request(app).get(`${endpoint}/counterparties?q=Minh`).set(auth(cashierToken));
    expect(counterparties.status).toBe(200);
    expect(counterparties.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SUPPLIER', sourceId: supplier.id, name: 'Công ty Minh' }),
      expect.objectContaining({ type: 'OTHER', sourceId: party.body.data.id, name: 'Anh Minh' })
    ]));
    const invoices = await request(app).get(`${endpoint}/purchase-invoices?q=HD-001`).set(auth(cashierToken));
    expect(invoices.status).toBe(200);
    expect(invoices.body.data).toEqual([
      expect.objectContaining({ receiptCode: 'PN-CASH-01', invoiceNumber: 'HD-001', supplierName: 'Công ty Minh', payableAmount: 400_000 })
    ]);
  });
});
