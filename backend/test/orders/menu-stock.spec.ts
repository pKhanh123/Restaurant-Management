import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import * as socket from '../../src/lib/socket';

const inventoryEventSpy = vi.spyOn(socket, 'emitToAll');

describe('Menu item stock reservation and restoration (Phase 7)', () => {
  let categoryId: number;
  let skuSequence = 0;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    const category = await prismaTest.category.create({ data: { name: 'Phase 7 stock' } });
    categoryId = category.id;
  });

  beforeEach(() => {
    inventoryEventSpy.mockClear();
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  async function createMenuItem(stockQuantity: number, trackStock = true) {
    skuSequence += 1;
    return prismaTest.menuItem.create({
      data: {
        categoryId,
        sku: `P7-${String(skuSequence).padStart(6, '0')}`,
        name: `Phase 7 item ${skuSequence}`,
        basePrice: 10_000,
        trackStock,
        stockQuantity
      }
    });
  }

  function takeAwayItem(menuItemId: number, quantity = 1, idempotencyKey?: string) {
    return {
      orderType: 'TAKE_AWAY' as const,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      items: [{ menuItemId, quantity, selectedModifiers: [] }]
    };
  }

  it('rejects an order above tracked stock without creating an order', async () => {
    const item = await createMenuItem(2);

    await expect(OrdersService.createOrder(takeAwayItem(item.id, 3))).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    });

    const [storedItem, orderCount] = await Promise.all([
      prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } }),
      prismaTest.order.count()
    ]);
    expect(storedItem.stockQuantity).toBe(2);
    expect(orderCount).toBe(0);
  });

  it('decrements aggregate quantity for duplicate lines and ignores untracked stock', async () => {
    const tracked = await createMenuItem(5);
    const untracked = await createMenuItem(0, false);

    await OrdersService.createOrder({
      orderType: 'TAKE_AWAY',
      items: [
        { menuItemId: tracked.id, quantity: 2, selectedModifiers: [] },
        { menuItemId: tracked.id, quantity: 1, selectedModifiers: [] },
        { menuItemId: untracked.id, quantity: 4, selectedModifiers: [] }
      ]
    });

    const [storedTracked, storedUntracked] = await Promise.all([
      prismaTest.menuItem.findUniqueOrThrow({ where: { id: tracked.id } }),
      prismaTest.menuItem.findUniqueOrThrow({ where: { id: untracked.id } })
    ]);
    expect(storedTracked.stockQuantity).toBe(2);
    expect(storedUntracked.stockQuantity).toBe(0);
  });

  it('does not decrement twice when an idempotent request is retried', async () => {
    const item = await createMenuItem(3);
    const input = takeAwayItem(item.id, 2, `phase-7-retry-${item.id}`);

    const first = await OrdersService.createOrder(input);
    const retry = await OrdersService.createOrder(input);

    expect(retry).toMatchObject({ isDuplicate: true, order: { id: first.order.id } });
    const storedItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(storedItem.stockQuantity).toBe(1);
    expect(await prismaTest.order.count({ where: { id: first.order.id } })).toBe(1);
  });

  it('restores tracked stock when an unpaid order is voided', async () => {
    const item = await createMenuItem(4);
    const created = await OrdersService.createOrder(takeAwayItem(item.id, 2));

    await OrdersService.voidOrder(created.order.id, { reason: 'Khách hủy món' });

    const storedItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(storedItem.stockQuantity).toBe(4);
    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      sourceType: 'MENU_ITEM',
      sourceIds: [item.id],
      reason: 'ORDER_VOIDED'
    }));
  });

  it('restores tracked stock when an expired unpaid order is auto-cancelled', async () => {
    const item = await createMenuItem(4);
    const created = await OrdersService.createOrder(takeAwayItem(item.id, 3));
    const expiredAt = new Date(Date.now() - 65 * 60 * 1000);

    await prismaTest.order.update({
      where: { id: created.order.id },
      data: { createdAt: expiredAt, updatedAt: expiredAt }
    });

    const result = await OrdersService.autoCancelExpiredOrders(60);

    expect(result.cancelledOrderIds).toContain(created.order.id);
    const storedItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(storedItem.stockQuantity).toBe(4);
    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      sourceType: 'MENU_ITEM',
      sourceIds: [item.id],
      reason: 'ORDER_VOIDED'
    }));
  });

  it('publishes ingredient invalidation after a paid order consumes a BOM', async () => {
    const item = await createMenuItem(4);
    const ingredient = await prismaTest.ingredient.create({
      data: { sku: `P7-ING-${item.id}`, name: 'Phase 7 ingredient', unit: 'gram', currentStock: 100, costPerUnit: 80 }
    });
    await prismaTest.menuItemIngredient.create({
      data: { menuItemId: item.id, ingredientId: ingredient.id, quantityRequired: 10 }
    });

    const created = await OrdersService.createOrder(takeAwayItem(item.id));
    inventoryEventSpy.mockClear();
    await OrdersService.payOrder(created.order.id, { paymentMethod: 'CASH' });

    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      sourceType: 'INGREDIENT',
      sourceIds: [ingredient.id],
      reason: 'ORDER_PAID'
    }));
  });

  it('keeps consumed stock when a paid order cannot be voided', async () => {
    const item = await createMenuItem(4);
    const created = await OrdersService.createOrder(takeAwayItem(item.id, 2));

    await OrdersService.payOrder(created.order.id, { paymentMethod: 'CASH' });

    await expect(
      OrdersService.voidOrder(created.order.id, { reason: 'Không được hủy sau thanh toán' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_STATE_INVALID' });

    const storedItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(storedItem.stockQuantity).toBe(2);
  });

  it('allows only one of two concurrent orders to reserve the last unit', async () => {
    const item = await createMenuItem(1);

    const results = await Promise.allSettled([
      OrdersService.createOrder(takeAwayItem(item.id)),
      OrdersService.createOrder(takeAwayItem(item.id))
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const storedItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(storedItem.stockQuantity).toBe(0);
  });
});
