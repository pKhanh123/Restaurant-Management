import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('cashbook order integration', () => {
  let token: string;
  let actorId: number;
  let bankId: number;
  let walletId: number;
  let menuItemId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const createOrder = async (overrides: Record<string, unknown> = {}) => prismaTest.order.create({
    data: {
      code: `ORDER-CASH-${Date.now()}-${Math.random()}`,
      orderType: 'TAKE_AWAY', status: 'PENDING', paymentStatus: 'UNPAID',
      totalAmount: 100_000, vatAmount: 8_000, finalAmount: 108_000,
      createdByUserId: actorId,
      items: { create: { menuItemId, quantity: 2, unitPrice: 50_000, subtotal: 100_000 } },
      ...overrides
    },
    include: { items: true }
  });

  beforeEach(async () => {
    await truncateAllTables();
    const actor = await prismaTest.user.create({ data: { username: 'order-cashbook-admin', passwordHash: 'hash', name: 'Quản lý đơn', role: 'ADMIN' } });
    actorId = actor.id;
    token = jwt.sign({ sub: String(actor.id), username: actor.username, name: actor.name, role: actor.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
    const menuCategory = await prismaTest.category.create({ data: { name: 'Món tích hợp quỹ' } });
    const menu = await prismaTest.menuItem.create({ data: { categoryId: menuCategory.id, sku: 'CASHBOOK-MENU', name: 'Món thử quỹ', basePrice: 50_000, trackStock: true, stockQuantity: 5 } });
    menuItemId = menu.id;
    const [, bank, wallet] = await Promise.all([
      prismaTest.financialAccount.create({ data: { code: 'CASH', name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000, isDefault: true } }),
      prismaTest.financialAccount.create({ data: { code: 'BANK', name: 'Ngân hàng', type: 'BANK', openingBalance: 1_000_000, isDefault: true, bankName: 'VCB', accountNumber: '1234' } }),
      prismaTest.financialAccount.create({ data: { code: 'WALLET', name: 'Ví điện tử', type: 'E_WALLET', openingBalance: 1_000_000, isDefault: true, walletProvider: 'MoMo', walletIdentifier: '0909' } })
    ]);
    bankId = bank.id;
    walletId = wallet.id;
    await prismaTest.cashFlowCategory.createMany({ data: [
      { code: 'CUSTOMER_PAYMENT', name: 'Khách thanh toán', direction: 'RECEIPT', affectsBusinessResultDefault: false, isSystem: true },
      { code: 'CUSTOMER_REFUND', name: 'Hoàn tiền khách', direction: 'PAYMENT', affectsBusinessResultDefault: false, isSystem: true }
    ] });
    await prismaTest.cashbookSetting.create({ data: { id: 1, activatedAt: new Date(Date.now() - 60_000), activatedByUserId: actor.id } });
  });

  it('skips pre-cutover payments and posts one receipt at or after cutover', async () => {
    const before = await createOrder();
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: new Date(Date.now() + 60_000) } });
    expect((await request(app).post(`/api/orders/${before.id}/pay`).set(auth()).send({ paymentMethod: 'CASH' })).status).toBe(200);
    expect(await prismaTest.cashVoucher.count()).toBe(0);

    const after = await createOrder();
    const cutover = new Date(Date.now() - 10);
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: cutover } });
    const paid = await request(app).post(`/api/orders/${after.id}/pay`).set(auth()).send({ paymentMethod: 'CASH' });
    expect(paid.status).toBe(200);
    const voucher = await prismaTest.cashVoucher.findUniqueOrThrow({ where: { sourceKey: `ORDER_PAYMENT:${after.id}` } });
    expect(voucher).toMatchObject({ direction: 'RECEIPT', amount: 108_000, paymentMethod: 'CASH' });
    expect(voucher.occurredAt.getTime()).toBeGreaterThanOrEqual(cutover.getTime());

    expect((await request(app).post(`/api/orders/${after.id}/pay`).set(auth()).send({ paymentMethod: 'CASH' })).status).toBe(409);
    expect(await prismaTest.cashVoucher.count({ where: { sourceKey: `ORDER_PAYMENT:${after.id}` } })).toBe(1);
  });

  it('rolls back order payment when a non-cash account has the wrong type', async () => {
    const order = await createOrder();
    const response = await request(app).post(`/api/orders/${order.id}/pay`).set(auth()).send({ paymentMethod: 'BANK_TRANSFER', financialAccountId: walletId });
    expect(response.status).toBe(400);
    expect(await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ paymentStatus: 'UNPAID', status: 'PENDING' });
    expect(await prismaTest.cashVoucher.count()).toBe(0);
  });

  it('posts to the selected bank account and reverses exactly once when a paid order is voided', async () => {
    const order = await createOrder();
    expect((await request(app).post(`/api/orders/${order.id}/pay`).set(auth()).send({ paymentMethod: 'BANK_TRANSFER', financialAccountId: bankId })).status).toBe(200);
    const original = await prismaTest.cashVoucher.findUniqueOrThrow({ where: { sourceKey: `ORDER_PAYMENT:${order.id}` } });
    expect(original.accountId).toBe(bankId);

    const voided = await request(app).patch(`/api/orders/${order.id}/void`).set(auth()).send({ reason: 'Hủy hóa đơn đã thanh toán' });
    expect(voided.status).toBe(200);
    expect(await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOIDED' });
    expect(await prismaTest.cashVoucher.count({ where: { reversalOfId: original.id } })).toBe(1);
    expect((await prismaTest.cashVoucher.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('CANCELLED');
    expect((await request(app).patch(`/api/orders/${order.id}/void`).set(auth()).send({ reason: 'Hủy lại' })).status).toBe(409);
    expect(await prismaTest.cashVoucher.count({ where: { reversalOfId: original.id } })).toBe(1);
  });

  it('posts a sales-return payment and rolls back return/stock when funds are insufficient', async () => {
    const paidOrder = await createOrder({ status: 'COMPLETED', paymentStatus: 'PAID', paymentMethod: 'CASH', paidAt: new Date() });
    const returned = await request(app).post('/api/orders/returns').set(auth()).send({
      orderId: paidOrder.id, lines: [{ orderItemId: paidOrder.items[0].id, quantity: 1 }], refundMethod: 'CASH'
    });
    expect(returned.status).toBe(201);
    expect(await prismaTest.cashVoucher.findUnique({ where: { sourceKey: `SALES_RETURN:${returned.body.data.id}` } })).toMatchObject({ direction: 'PAYMENT', amount: 50_000 });

    const insufficientOrder = await createOrder({ status: 'COMPLETED', paymentStatus: 'PAID', paymentMethod: 'CASH', paidAt: new Date() });
    await prismaTest.financialAccount.updateMany({ where: { type: 'CASH' }, data: { openingBalance: 0 } });
    await prismaTest.cashVoucher.deleteMany();
    const stockBefore = (await prismaTest.menuItem.findUniqueOrThrow({ where: { id: menuItemId } })).stockQuantity;
    const rejected = await request(app).post('/api/orders/returns').set(auth()).send({
      orderId: insufficientOrder.id, lines: [{ orderItemId: insufficientOrder.items[0].id, quantity: 1 }], refundMethod: 'CASH'
    });
    expect(rejected.status).toBe(409);
    expect(await prismaTest.orderReturn.count({ where: { orderId: insufficientOrder.id } })).toBe(0);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: menuItemId } })).stockQuantity).toBe(stockBefore);
    expect(await prismaTest.inventoryTransaction.count({ where: { type: 'SALES_RETURN' } })).toBe(0);
  });
});
