import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('cashbook purchase integration', () => {
  let token: string;
  let supplierId: number;
  let ingredientId: number;
  let bankId: number;
  let walletId: number;
  const root = '/api/inventory';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await truncateAllTables();
    const actor = await prismaTest.user.create({ data: { username: 'purchase-cashbook-admin', passwordHash: 'hash', name: 'Quản lý mua hàng', role: 'ADMIN' } });
    token = jwt.sign({ sub: String(actor.id), username: actor.username, name: actor.name, role: actor.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-CASHBOOK', name: 'Nhà cung cấp quỹ' } });
    supplierId = supplier.id;
    const ingredient = await prismaTest.ingredient.create({ data: { sku: 'ING-CASHBOOK', name: 'Nguyên liệu quỹ', unit: 'kg', currentStock: 10, costPerUnit: 100 } });
    ingredientId = ingredient.id;
    const [, bank, wallet] = await Promise.all([
      prismaTest.financialAccount.create({ data: { code: 'CASH', name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000, isDefault: true } }),
      prismaTest.financialAccount.create({ data: { code: 'BANK', name: 'Ngân hàng', type: 'BANK', openingBalance: 1_000_000, isDefault: true, bankName: 'VCB', accountNumber: '1234' } }),
      prismaTest.financialAccount.create({ data: { code: 'WALLET', name: 'Ví', type: 'E_WALLET', openingBalance: 1_000_000, isDefault: true, walletProvider: 'MoMo', walletIdentifier: '0909' } })
    ]);
    bankId = bank.id;
    walletId = wallet.id;
    await prismaTest.cashFlowCategory.createMany({ data: [
      { code: 'SUPPLIER_PAYMENT', name: 'Trả nhà cung cấp', direction: 'PAYMENT', affectsBusinessResultDefault: false, isSystem: true },
      { code: 'SUPPLIER_REFUND', name: 'Nhà cung cấp hoàn tiền', direction: 'RECEIPT', affectsBusinessResultDefault: false, isSystem: true }
    ] });
    await prismaTest.cashbookSetting.create({ data: { id: 1, activatedAt: new Date(Date.now() - 60_000), activatedByUserId: actor.id } });
  });

  const createReceipt = (overrides: Record<string, unknown> = {}) => request(app).post(`${root}/purchase-receipts`).set(auth()).send({
    supplierId,
    paidAmount: 200,
    paymentMethod: 'BANK_TRANSFER',
    financialAccountId: bankId,
    lines: [{ ingredientId, quantity: 2, unitCost: 100 }],
    ...overrides
  });

  const createReturn = (overrides: Record<string, unknown> = {}) => request(app).post(`${root}/purchase-returns`).set(auth()).send({
    supplierId,
    refundAmount: 200,
    refundMethod: 'CASH',
    lines: [{ ingredientId, quantity: 2, returnUnitPrice: 100 }],
    ...overrides
  });

  it('posts paid receipts, skips zero-paid debt and keeps one source voucher on duplicate post', async () => {
    const paidDraft = await createReceipt();
    expect(paidDraft.status).toBe(201);
    const posted = await request(app).post(`${root}/purchase-receipts/${paidDraft.body.data.id}/post`).set(auth());
    expect(posted.status).toBe(200);
    expect(await prismaTest.cashVoucher.findUnique({ where: { sourceKey: `PURCHASE_RECEIPT:${paidDraft.body.data.id}` } })).toMatchObject({
      direction: 'PAYMENT', amount: 200, accountId: bankId, paymentMethod: 'BANK_TRANSFER'
    });
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(12);
    expect((await request(app).post(`${root}/purchase-receipts/${paidDraft.body.data.id}/post`).set(auth())).status).toBe(409);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: `PURCHASE_RECEIPT:${paidDraft.body.data.id}` } })).toBe(1);

    const debtDraft = await createReceipt({ paidAmount: 0, paymentMethod: 'CASH', financialAccountId: undefined });
    expect((await request(app).post(`${root}/purchase-receipts/${debtDraft.body.data.id}/post`).set(auth())).status).toBe(200);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: `PURCHASE_RECEIPT:${debtDraft.body.data.id}` } })).toBe(0);
  });

  it('rolls back receipt status and stock when its payment account is invalid', async () => {
    const draft = await createReceipt({ financialAccountId: walletId });
    expect(draft.status).toBe(201);
    const stockBefore = (await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock;
    const response = await request(app).post(`${root}/purchase-receipts/${draft.body.data.id}/post`).set(auth());
    expect(response.status).toBe(400);
    expect(await prismaTest.purchaseReceipt.findUniqueOrThrow({ where: { id: draft.body.data.id } })).toMatchObject({ status: 'DRAFT' });
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(stockBefore);
    expect(await prismaTest.inventoryTransaction.count({ where: { purchaseReceiptId: draft.body.data.id } })).toBe(0);
  });

  it('posts only actual supplier refunds and keeps one voucher on duplicate completion', async () => {
    const refundDraft = await createReturn();
    expect(refundDraft.status).toBe(201);
    const completed = await request(app).post(`${root}/purchase-returns/${refundDraft.body.data.id}/complete`).set(auth()).send({ expectedVersion: refundDraft.body.data.version });
    expect(completed.status).toBe(200);
    expect(await prismaTest.cashVoucher.findUnique({ where: { sourceKey: `PURCHASE_RETURN:${refundDraft.body.data.id}` } })).toMatchObject({
      direction: 'RECEIPT', amount: 200, paymentMethod: 'CASH'
    });
    expect((await request(app).post(`${root}/purchase-returns/${refundDraft.body.data.id}/complete`).set(auth()).send({ expectedVersion: refundDraft.body.data.version })).status).toBe(409);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: `PURCHASE_RETURN:${refundDraft.body.data.id}` } })).toBe(1);

    const debtOnly = await createReturn({ refundAmount: 0 });
    expect((await request(app).post(`${root}/purchase-returns/${debtOnly.body.data.id}/complete`).set(auth()).send({ expectedVersion: debtOnly.body.data.version })).status).toBe(200);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: `PURCHASE_RETURN:${debtOnly.body.data.id}` } })).toBe(0);
  });
});
