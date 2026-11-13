import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';

describe('first order receiver', () => {
  let menuItemId: number;
  let firstUserId: number;
  let secondUserId: number;
  let unlinkedUserId: number;
  let firstEmployeeId: number;
  let secondEmployeeId: number;
  const secondClient = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

  const token = (id: number) => jwt.sign(
    { sub: String(id), username: `receiver-${id}`, name: 'Receiver Staff', role: 'ADMIN' },
    env.JWT_SECRET,
    { algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '1h' }
  );
  const createStaffOrder = (userId: number, extra = {}) => request(app)
    .post('/api/orders').set('Authorization', `Bearer ${token(userId)}`)
    .send({ orderType: 'TAKE_AWAY', items: [{ menuItemId, quantity: 1 }], ...extra });
  const transition = (orderId: number, userId: number, status = 'PREPARING') => request(app)
    .patch(`/api/orders/${orderId}/status`).set('Authorization', `Bearer ${token(userId)}`).send({ status });
  const historicalOrder = (code: string, createdByUserId?: number) => prismaTest.order.create({
    data: { code, orderType: 'TAKE_AWAY', totalAmount: 10000, vatAmount: 800, finalAmount: 10800, createdByUserId }
  });

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    const category = await prismaTest.category.create({ data: { name: 'Receiver test' } });
    const menuItem = await prismaTest.menuItem.create({
      data: { categoryId: category.id, sku: 'RECEIVER-ITEM', name: 'Receiver dish', basePrice: 10000 }
    });
    menuItemId = menuItem.id;
    // Deliberately keep Employee ids different from User ids.
    await prismaTest.employee.create({ data: { code: 'UNLINKED', attendanceCode: 'UNLINKED', name: 'Receiver Staff', phone: '0900000000' } });
    const first = await prismaTest.user.create({ data: { username: 'receiver-first', passwordHash: 'test', name: 'Receiver Staff', role: 'ADMIN' } });
    const second = await prismaTest.user.create({ data: { username: 'receiver-second', passwordHash: 'test', name: 'Receiver Staff', role: 'ADMIN' } });
    const unlinked = await prismaTest.user.create({ data: { username: 'receiver-unlinked', passwordHash: 'test', name: 'Receiver Staff', role: 'ADMIN' } });
    firstUserId = first.id;
    secondUserId = second.id;
    unlinkedUserId = unlinked.id;
    firstEmployeeId = (await prismaTest.employee.create({ data: { code: 'FIRST', attendanceCode: 'FIRST', name: first.name, phone: '0900000001', userId: first.id } })).id;
    secondEmployeeId = (await prismaTest.employee.create({ data: { code: 'SECOND', attendanceCode: 'SECOND', name: second.name, phone: '0900000002', userId: second.id } })).id;
    await prismaTest.commissionPlan.create({ data: {
      code: 'RECEIVER-COMMISSION', name: 'Receiver commission fixture', status: 'ACTIVE', effectiveFrom: new Date('2020-01-01'),
      employees: { create: { employeeId: secondEmployeeId, effectiveFrom: new Date('2020-01-01') } }
    } });
  }, 60000);

  afterAll(async () => {
    await Promise.all([prismaTest.$disconnect(), secondClient.$disconnect()]);
  });

  it('assigns staff creation from the authenticated Employee link and keeps creator independent', async () => {
    const response = await createStaffOrder(firstUserId, { receivedByEmployeeId: secondEmployeeId, createdByUserId: secondUserId });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.order.items[0].menuItemName).toBe('Receiver dish');
    const stored = await prismaTest.order.findUniqueOrThrow({ where: { id: response.body.data.order.id } });
    expect(stored.createdByUserId).toBe(firstUserId);
    expect(stored.receivedByEmployeeId).toBe(firstEmployeeId);
    const list = await request(app).get('/api/orders').set('Authorization', `Bearer ${token(firstUserId)}`);
    const listedOrder = list.body.data.find((order: { id: number }) => order.id === stored.id);
    expect(listedOrder.receivedByEmployeeId).toBe(firstEmployeeId);
    expect(listedOrder.items[0].menuItemName).toBe('Receiver dish');
  });

  it('does not substitute actor-name text or commission Employee when the authenticated user has no Employee link', async () => {
    const response = await request(app).post('/api/orders').set('Authorization', `Bearer ${token(unlinkedUserId)}`)
      .send({ orderType: 'TAKE_AWAY', receivedByEmployeeId: secondEmployeeId, items: [{ menuItemId, quantity: 1, commissionEmployeeId: secondEmployeeId }] });
    expect(response.status).toBe(201);
    const stored = await prismaTest.order.findUniqueOrThrow({ where: { id: response.body.data.order.id }, include: { items: true } });
    expect(stored.createdByUserId).toBe(unlinkedUserId);
    expect(stored.items[0].commissionEmployeeId).toBe(secondEmployeeId);
    expect(stored.receivedByEmployeeId).toBeNull();
    const transitioned = await transition(stored.id, unlinkedUserId);
    expect(transitioned.status).toBe(200);
    expect(transitioned.body.data.receivedByEmployeeId).toBeNull();
    expect(transitioned.body.data.items[0].menuItemName).toBe('Receiver dish');
  });

  it('leaves a QR guest receiver null until an authenticated lifecycle transition and never overwrites it', async () => {
    const table = await prismaTest.diningTable.create({ data: { tableNumber: 99, qrCodeToken: 'receiver-qr-table' } });
    const customer = await prismaTest.customer.create({ data: { code: 'RECEIVER-CUSTOMER', name: 'Guest' } });
    const reservation = await prismaTest.reservation.create({ data: {
      code: 'RECEIVER-RESERVATION', accessToken: 'receiver-reservation-token-00000000001', customerId: customer.id,
      tableId: table.id, status: 'CHECKED_IN', depositStatus: 'PAID', scheduledAt: new Date(), partySize: 2, contactName: 'Guest', contactPhone: '0900000009'
    } });
    const response = await request(app).post('/api/orders').send({
      orderType: 'DINE_IN', qrCodeToken: table.qrCodeToken, reservationAccessToken: reservation.accessToken,
      receivedByEmployeeId: secondEmployeeId, createdByUserId: firstUserId,
      items: [{ menuItemId, quantity: 1, commissionEmployeeId: secondEmployeeId }]
    });
    expect(response.status).toBe(201);
    const orderId = response.body.data.order.id;
    expect(response.body.data.order.receivedByEmployeeId).toBeNull();
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: orderId } })).createdByUserId).toBeNull();
    const preparing = await transition(orderId, firstUserId);
    expect(preparing.status).toBe(200);
    expect(preparing.body.data.receivedByEmployeeId).toBe(firstEmployeeId);
    const ready = await transition(orderId, secondUserId, 'READY');
    expect(ready.status).toBe(200);
    expect(ready.body.data.receivedByEmployeeId).toBe(firstEmployeeId);
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: orderId } })).receivedByEmployeeId).toBe(firstEmployeeId);
  });

  it('keeps historical receivers unknown rather than inferring their linked creator on reads', async () => {
    const order = await historicalOrder('RECEIVER-HISTORICAL', firstUserId);
    const list = await request(app).get('/api/orders').set('Authorization', `Bearer ${token(firstUserId)}`);
    expect(list.status).toBe(200);
    expect(list.body.data.find((row: { id: number }) => row.id === order.id).receivedByEmployeeId).toBeNull();
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).receivedByEmployeeId).toBeNull();
    const preparing = await transition(order.id, secondUserId);
    expect(preparing.body.data.receivedByEmployeeId).toBe(secondEmployeeId);
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).createdByUserId).toBe(firstUserId);
  });

  it('does not claim a receiver for a rejected lifecycle transition', async () => {
    const order = await historicalOrder('RECEIVER-INVALID');
    expect((await transition(order.id, firstUserId, 'READY')).status).toBe(409);
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).receivedByEmployeeId).toBeNull();
  });

  it('allows exactly one of two simultaneous claims and returns its persisted winner despite older read snapshots', async () => {
    const { claimInitialOrderReceiver } = await import('../../src/modules/orders/order-receiver.service');
    const order = await historicalOrder('RECEIVER-CONCURRENT');
    const affectedRows: number[] = [];
    let entered = 0;
    let release!: () => void;
    const bothSnapshotsReady = new Promise<void>(resolve => { release = resolve; });
    const claim = (client: PrismaClient, userId: number) => client.$transaction(async tx => {
      const before = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(before.receivedByEmployeeId).toBeNull();
      if (++entered === 2) release();
      await bothSnapshotsReady;
      const updateMany = tx.order.updateMany.bind(tx.order);
      const observeAssignment = async (args: Prisma.OrderUpdateManyArgs) => {
        const result = await updateMany(args);
        affectedRows.push(result.count);
        return result;
      };
      // Prisma delegates require an explicitly bound call here. The helper only
      // awaits it, so a native Promise in this test adapter preserves its behavior.
      const assignment = vi.spyOn(tx.order, 'updateMany')
        .mockImplementation(observeAssignment as unknown as typeof tx.order.updateMany);
      try {
        return await claimInitialOrderReceiver(tx, order.id, userId);
      } finally {
        assignment.mockRestore();
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    const claims = await Promise.all([claim(prismaTest, firstUserId), claim(secondClient, secondUserId)]);
    const stored = await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(affectedRows.sort()).toEqual([0, 1]);
    expect([firstEmployeeId, secondEmployeeId]).toContain(stored.receivedByEmployeeId);
    expect(claims).toEqual([stored.receivedByEmployeeId, stored.receivedByEmployeeId]);
    const laterUserId = stored.receivedByEmployeeId === firstEmployeeId ? secondUserId : firstUserId;
    expect((await transition(order.id, laterUserId)).body.data.receivedByEmployeeId).toBe(stored.receivedByEmployeeId);
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).receivedByEmployeeId).toBe(stored.receivedByEmployeeId);
  }, 30000);

  it('does not claim during a lifecycle transition without an authenticated actor', async () => {
    const order = await historicalOrder('RECEIVER-NO-ACTOR');
    const result = await OrdersService.updateOrderStatus(order.id, 'PREPARING');
    expect(result.receivedByEmployeeId).toBeNull();
  });
});
