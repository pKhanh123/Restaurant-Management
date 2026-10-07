import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll, emitToRoom } from '../../lib/socket';
import { CreateOrderInput, PayOrderInput, VoidOrderInput } from './orders.schemas';
import { CashVoucherSourceType, PaymentMethod } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { emitInventoryChanged } from '../inventory/inventory.events';
import { PriceListService } from '../price-lists/price-list.service';
import { createHash } from 'crypto';
import { CashbookPostingService } from '../cashbook/cashbook-posting.service';
import { emitCashbookChanged } from '../cashbook/cashbook.events';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function hashOrderRequest(input: CreateOrderInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ ...input, idempotencyKey: undefined })))
    .digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

type MenuStockChange = {
  menuItemId: number;
  stockQuantity: number;
  trackStock: boolean;
  isAvailable: boolean;
};

type StockOrderItem = {
  menuItemId: number;
  quantity: number;
};

function aggregateQuantities(items: StockOrderItem[]) {
  const quantities = new Map<number, number>();
  for (const item of items) {
    quantities.set(item.menuItemId, (quantities.get(item.menuItemId) ?? 0) + item.quantity);
  }
  return quantities;
}

async function reserveMenuStockForOrder(
  tx: any,
  items: StockOrderItem[],
  trackedMenuItemIds: Set<number>
): Promise<MenuStockChange[]> {
  const stockChanges: MenuStockChange[] = [];
  const quantities = aggregateQuantities(items);

  for (const menuItemId of [...quantities.keys()].sort((left, right) => left - right)) {
    const quantity = quantities.get(menuItemId)!;
    if (!trackedMenuItemIds.has(menuItemId)) continue;

    const rows = await tx.$queryRaw<Array<{
      id: number;
      name: string;
      trackStock: boolean;
      stockQuantity: number;
      isAvailable: boolean;
    }>>`SELECT id, name, trackStock, stockQuantity, isAvailable FROM MenuItem WHERE id = ${menuItemId} FOR UPDATE`;
    const menuItem = rows[0];

    if (!menuItem) {
      throw ApiError.notFound(`Món ăn ID ${menuItemId} không tồn tại trong thực đơn`);
    }

    if (!menuItem.trackStock) continue;

    if (menuItem.stockQuantity < quantity) {
      throw ApiError.badRequest(
        `Món ăn "${menuItem.name}" không đủ tồn kho (còn ${menuItem.stockQuantity}, cần ${quantity})`
      );
    }

    const updated = await tx.menuItem.update({
      where: { id: menuItemId },
      data: { stockQuantity: { decrement: quantity } },
      select: { id: true, stockQuantity: true, trackStock: true, isAvailable: true }
    });

    stockChanges.push({
      menuItemId: updated.id,
      stockQuantity: updated.stockQuantity,
      trackStock: updated.trackStock,
      isAvailable: updated.isAvailable
    });
  }

  return stockChanges;
}

async function restoreMenuStockForOrder(tx: any, items: StockOrderItem[]): Promise<MenuStockChange[]> {
  const stockChanges: MenuStockChange[] = [];
  const quantities = aggregateQuantities(items);

  for (const menuItemId of [...quantities.keys()].sort((left, right) => left - right)) {
    const quantity = quantities.get(menuItemId)!;
    const rows = await tx.$queryRaw<Array<{
      id: number;
      trackStock: boolean;
    }>>`SELECT id, trackStock FROM MenuItem WHERE id = ${menuItemId} FOR UPDATE`;
    const menuItem = rows[0];

    if (!menuItem || !menuItem.trackStock) continue;

    const updated = await tx.menuItem.update({
      where: { id: menuItemId },
      data: { stockQuantity: { increment: quantity } },
      select: { id: true, stockQuantity: true, trackStock: true, isAvailable: true }
    });

    stockChanges.push({
      menuItemId: updated.id,
      stockQuantity: updated.stockQuantity,
      trackStock: updated.trackStock,
      isAvailable: updated.isAvailable
    });
  }

  return stockChanges;
}

function emitMenuStockChanged(stockChanges: MenuStockChange[]) {
  if (stockChanges.length > 0) {
    emitToAll('menu:stockChanged', { items: stockChanges });
  }
}

export class OrdersService {
  /**
   * Tao don hang moi (Dat tai ban qua QR hoac POS)
   */
  static async createOrder(input: CreateOrderInput, createdByUserId?: number) {
    const isGuestPrepayment = createdByUserId === undefined;
    const requiresReservationPrepayment = isGuestPrepayment && input.orderType === 'DINE_IN';
    if (input.payLaterOverride && createdByUserId === undefined) throw ApiError.forbidden('Chỉ nhân viên được cho phép trả sau');
    const idempotencyScope = createdByUserId === undefined ? 'guest' : `user:${createdByUserId}`;
    const requestHash = hashOrderRequest(input);
    const assertMatchingRequest = (existingHash: string | null) => {
      if (existingHash && existingHash !== requestHash) {
        throw ApiError.conflict('Idempotency key đã được dùng cho một nội dung đơn hàng khác');
      }
    };
    const findExisting = (client: any) => client.order.findUnique({
      where: {
        idempotencyScope_idempotencyKey: {
          idempotencyScope,
          idempotencyKey: input.idempotencyKey
        }
      },
      include: { items: true }
    });

    // 2. Kiem tra tinh hop le cua ban an neu la DINE_IN
    let targetTable: { id: number; tableNumber: number } | null = null;
    let resolvedTableId = input.tableId;
    if (input.orderType === 'DINE_IN') {
      if (createdByUserId === undefined) {
        if (!input.reservationAccessToken) {
          throw ApiError.conflict('Khách cần đặt bàn, check-in và đặt cọc trước khi gọi món');
        }
        if (!input.qrCodeToken) {
          throw ApiError.badRequest('Khách gọi món tại bàn cần có mã QR hợp lệ');
        }

        const table = await prisma.diningTable.findUnique({
          where: { qrCodeToken: input.qrCodeToken }
        });
        if (!table) {
          throw ApiError.notFound('Mã QR bàn không hợp lệ hoặc đã hết hạn');
        }
        // Kiem tra phong/ban dang hoat dong
        if (!table.isActive) {
          throw ApiError.notFound('Mã QR bàn không hợp lệ hoặc đã hết hạn');
        }
        if (input.tableId && input.tableId !== table.id) {
          throw ApiError.badRequest('Mã QR không khớp với bàn được chọn');
        }
        resolvedTableId = table.id;
        targetTable = table;
      } else {
        if (!input.tableId) {
          throw ApiError.badRequest('Vui lòng chọn bàn ăn cho đơn tại chỗ');
        }

        const table = await prisma.diningTable.findUnique({
          where: { id: input.tableId }
        });
        if (!table) {
          throw ApiError.badRequest(`Bàn ăn ID ${input.tableId} không tồn tại`);
        }
        if (!table.isActive) {
          throw ApiError.badRequest('Phòng/bàn đã ngừng hoạt động');
        }
        targetTable = table;
      }
    }

    const isDelivery = input.orderType === 'DELIVERY';
    if (isDelivery && (!input.deliveryPartnerId || !input.deliveryAddress)) {
      throw ApiError.badRequest('Đơn giao hàng cần có đối tác giao hàng và địa chỉ nhận');
    }
    if (!isDelivery && (input.deliveryPartnerId || input.deliveryAddress || input.deliveryFee)) {
      throw ApiError.badRequest('Thông tin giao hàng chỉ áp dụng cho đơn giao hàng');
    }
    const deliveryFee = isDelivery ? (input.deliveryFee ?? 0) : 0;

    // 3. Lay thong tin cac mon an tu Database de xac thuc gia va tinh toan
    const menuItemIds = input.items.map((i) => i.menuItemId);
    const dbMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: {
        modifierGroups: {
          include: {
            options: true
          }
        }
      }
    });

    const dbItemMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    // 4. Validate tung mon an, tinh tien va tao orderItemsData
    let totalAmount = 0;
    const orderItemsData: any[] = [];

    for (const itemInput of input.items) {
      const dbItem = dbItemMap.get(itemInput.menuItemId);
      if (!dbItem) {
        throw ApiError.notFound(`Món ăn ID ${itemInput.menuItemId} không tồn tại trong thực đơn`);
      }

      // Kiem tra het hang (86'd)
      if (!dbItem.isAvailable) {
        throw ApiError.badRequest(`Món ăn "${dbItem.name}" hiện đã hết hàng (86'd)`);
      }

      // Xac thuc modifier va tao snapshot hoan toan tu du lieu DB
      const requestedMods = itemInput.selectedModifiers || [];
      const groupMap = new Map(dbItem.modifierGroups.map((group) => [group.id, group]));
      const selectedOptionIds = new Set<number>();
      const selectedMods = requestedMods.map((requestedMod) => {
        const group = groupMap.get(requestedMod.modifierGroupId);
        if (!group) {
          throw ApiError.badRequest(
            `Nhóm modifier ID ${requestedMod.modifierGroupId} không thuộc món "${dbItem.name}"`
          );
        }

        const option = group.options.find((candidate) => candidate.id === requestedMod.optionId);
        if (!option) {
          throw ApiError.badRequest(
            `Lựa chọn modifier ID ${requestedMod.optionId} không thuộc nhóm "${group.name}"`
          );
        }

        if (!option.isAvailable) {
          throw ApiError.badRequest(`Lựa chọn "${option.name}" hiện không còn bán`);
        }

        if (selectedOptionIds.has(option.id)) {
          throw ApiError.badRequest(`Lựa chọn "${option.name}" bị chọn trùng`);
        }
        selectedOptionIds.add(option.id);

        return {
          modifierGroupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta
        };
      });

      for (const group of dbItem.modifierGroups) {
        const selectedCount = selectedMods.filter((mod) => mod.modifierGroupId === group.id).length;
        if (selectedCount < group.minSelect) {
          throw ApiError.badRequest(
            `Món "${dbItem.name}" phải chọn tối thiểu ${group.minSelect} lựa chọn trong nhóm "${group.name}"`
          );
        }
        if (selectedCount > group.maxSelect) {
          throw ApiError.badRequest(
            `Món "${dbItem.name}" chỉ được chọn tối đa ${group.maxSelect} lựa chọn trong nhóm "${group.name}"`
          );
        }
      }

      // Tinh gia tien chinh xac tu snapshot da xac thuc voi DB
      const modifierDelta = selectedMods.reduce((sum, mod) => sum + mod.priceDelta, 0);
      const unitPrice = dbItem.basePrice + modifierDelta;
      const subtotal = unitPrice * itemInput.quantity;
      totalAmount += subtotal;

      orderItemsData.push({
        menuItemId: dbItem.id,
        quantity: itemInput.quantity,
        unitPrice,
        subtotal,
        commissionEmployeeId: createdByUserId === undefined ? null : (itemInput.commissionEmployeeId ?? null),
        selectedModifiersJson: selectedMods.length > 0 ? selectedMods : null,
        notes: itemInput.notes
      });
    }

    // 5. Xu ly Voucher khuyen mai neu co
    let voucherDiscount = 0;
    let appliedVoucherId: number | null = null;
    let appliedVoucherCode: string | null = null;

    if (input.voucherCode) {
      const voucherCalc = await VouchersService.validateVoucher(input.voucherCode, totalAmount);
      voucherDiscount = voucherCalc.discountAmount;
      appliedVoucherId = voucherCalc.voucherId;
      appliedVoucherCode = voucherCalc.code;
    }

    // Tinh toan thue VAT 8% tren so tien sau khi tru khuyen mai (800 BPS)
    const taxableAmount = Math.max(0, totalAmount - voucherDiscount);
    let vatAmount = Math.round(taxableAmount * 0.08);
    let finalAmount = taxableAmount + vatAmount + deliveryFee;

    // 6. Tao ma don hang duy nhat CRISPY-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const code = `CRISPY-${dateStr}-${randomSuffix}`;

    // 7. Thuc hien Transaction tao Order va cap nhat Table
    let resolvedPriceListId: number | null = null;
    let transactionResult: { order: any; isDuplicate: boolean; stockChanges: MenuStockChange[]; awaitingPayment?: boolean };
    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        const commissionEmployeeIds = [...new Set(orderItemsData
          .map(item => item.commissionEmployeeId as number | null)
          .filter((id): id is number => id !== null))];
        if (commissionEmployeeIds.length) {
          for (const employeeId of commissionEmployeeIds) await assertCommissionEmployeeEligible(tx, employeeId);
        }
        let reservationContext: { id: number; customerId: number } | null = null;
        if (input.orderType === 'DINE_IN' && resolvedTableId) {
          await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${resolvedTableId} FOR UPDATE`;
          const lockedTable = await tx.diningTable.findUnique({ where: { id: resolvedTableId }, select: { id: true, isActive: true } });
          if (!lockedTable) throw ApiError.badRequest(`Bàn ăn ID ${resolvedTableId} không tồn tại`);
          if (!lockedTable.isActive) throw createdByUserId === undefined ? ApiError.notFound('Mã QR bàn không hợp lệ hoặc đã hết hạn') : ApiError.badRequest('Phòng/bàn đã ngừng hoạt động');
        }

        if (isGuestPrepayment && input.orderType === 'DINE_IN') {
          if (!resolvedTableId || !input.reservationAccessToken) throw ApiError.notFound('Mã đặt bàn không hợp lệ hoặc chưa được check-in');
          reservationContext = await ReservationsService.requireCheckedInToken(tx, input.reservationAccessToken, resolvedTableId);
        }

        const customerId = reservationContext?.customerId ?? input.customerId ?? null;
        const pricingCustomer = customerId ? await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, groupId: true, isActive: true } }) : null;
        if (input.customerId && (!pricingCustomer || !pricingCustomer.isActive)) throw ApiError.badRequest('Khách hàng không tồn tại hoặc đã ngừng hoạt động');
        if (input.payLaterOverride && (!pricingCustomer || !pricingCustomer.isActive)) throw ApiError.badRequest('Cho phép trả sau cần khách hàng đang hoạt động');

        if (input.idempotencyKey) {
          const existing = await findExisting(tx);
          if (existing) {
            assertMatchingRequest(existing.requestHash);
            return { order: existing, isDuplicate: true, stockChanges: [] };
          }
        }

        const menuItemIdsForPricing = input.items.map(item => item.menuItemId);
        const generalPriceList = await PriceListService.getGeneralPriceList(tx);
        const generalPrices = await PriceListService.resolveEffectivePrices(
          tx, menuItemIdsForPricing, generalPriceList ? { priceListId: generalPriceList.id } : undefined
        );
        const customerGroupPriceList = pricingCustomer?.groupId ? await tx.priceList.findFirst({
          where: {
            scopeType: PriceListScopeType.CUSTOMER_GROUP,
            scopeKey: String(pricingCustomer.groupId),
            isActive: true
          },
          orderBy: { id: 'asc' },
          select: { id: true }
        }) : null;
        const customerGroupPrices = customerGroupPriceList
          ? await PriceListService.resolveEffectivePrices(tx, menuItemIdsForPricing, { priceListId: customerGroupPriceList.id })
          : new Map();
        let usedGroupPrice = false;
        resolvedPriceListId = generalPriceList?.id ?? null;
        for (let index = 0; index < input.items.length; index += 1) {
          const itemInput = input.items[index];
          const groupPrice = customerGroupPrices.get(itemInput.menuItemId);
          const resolved = groupPrice?.source === 'PRICE_LIST' ? groupPrice : generalPrices.get(itemInput.menuItemId);
          if (!resolved) {
            throw ApiError.notFound(`Không thể xác định giá món ID ${itemInput.menuItemId}`);
          }
          if (groupPrice?.source === 'PRICE_LIST') usedGroupPrice = true;
          const selectedMods = (orderItemsData[index].selectedModifiersJson ?? []) as Array<{ priceDelta: number }>;
          const modifierDelta = selectedMods.reduce((sum, modifier) => sum + modifier.priceDelta, 0);
          const unitPrice = resolved.salePrice + modifierDelta;
          orderItemsData[index].unitPrice = unitPrice;
          orderItemsData[index].subtotal = unitPrice * itemInput.quantity;
        }
        if (usedGroupPrice && customerGroupPriceList) resolvedPriceListId = customerGroupPriceList.id;
        totalAmount = orderItemsData.reduce((sum, item) => sum + item.subtotal, 0);
        const effectiveTaxable = Math.max(0, totalAmount - voucherDiscount);
        vatAmount = Math.round(effectiveTaxable * 0.08);
        finalAmount = effectiveTaxable + vatAmount + deliveryFee;

        if (isDelivery) {
          await tx.$queryRaw`SELECT id FROM DeliveryPartner WHERE id = ${input.deliveryPartnerId!} FOR UPDATE`;
          const partner = await tx.deliveryPartner.findUnique({ where: { id: input.deliveryPartnerId! }, select: { id: true, isActive: true } });
          if (!partner) throw ApiError.notFound('Đối tác giao hàng không tồn tại');
          if (!partner.isActive) throw ApiError.badRequest('Đối tác giao hàng đã ngừng hoạt động');
        }

        const trackedMenuItemIds = new Set(
          dbMenuItems.filter((menuItem) => menuItem.trackStock).map((menuItem) => menuItem.id)
        );
        const stockChanges = requiresReservationPrepayment ? [] : await reserveMenuStockForOrder(tx, input.items, trackedMenuItemIds);

        const receivedByEmployeeId = await resolveEmployeeForUser(tx, createdByUserId);
        const order = await tx.order.create({
          data: {
            code,
            orderType: input.orderType,
            status: 'PENDING',
            tableId: resolvedTableId,
            customerId,
            reservationId: reservationContext?.id ?? null,
            deliveryPartnerId: isDelivery ? input.deliveryPartnerId : null,
            deliveryAddress: isDelivery ? input.deliveryAddress : null,
            deliveryFee,
            deliveryFeePaid: 0,
            priceListId: resolvedPriceListId,
            buzzerNumber: input.buzzerNumber,
            totalAmount,
            discountAmount: voucherDiscount,
            vatAmount,
            finalAmount,
            voucherId: appliedVoucherId,
            voucherCode: appliedVoucherCode,
            paymentStatus: 'UNPAID', // Mac dinh chua thanh toan (Post-Paid)
            payLaterAuthorized: input.payLaterOverride === true,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            idempotencyScope,
            requestHash,
            createdByUserId,
            receivedByEmployeeId,
            items: {
              create: orderItemsData
            }
          },
          include: {
            items: {
              include: {
                menuItem: true
              }
            },
            deliveryPartner: { select: { id: true, code: true, name: true } }
          }
        });

        if (input.payLaterOverride) await AuditService.logInTransaction(tx, {
          action: 'ORDER_PAY_LATER_AUTHORIZED', targetType: 'Order', targetId: order.id,
          actorId: createdByUserId, metadata: { customerId, reason: input.payLaterReason, amount: finalAmount }
        });

        if (appliedVoucherId) {
          const voucher = await tx.voucher.findUnique({
            where: { id: appliedVoucherId }
          });

          if (!voucher || !voucher.isActive) {
            throw ApiError.badRequest('Mã khuyến mãi không tồn tại hoặc đã ngừng áp dụng');
          }

          if (voucher.usageLimit !== null) {
            // Cap nhat nguyen tu: UPDATE Voucher SET usedCount = usedCount + 1 WHERE id = ? AND usedCount < usageLimit
            const affectedRows = await tx.$executeRaw`
              UPDATE Voucher 
              SET usedCount = usedCount + 1 
              WHERE id = ${appliedVoucherId} 
                AND isActive = true 
                AND usedCount < usageLimit
            `;

            if (affectedRows === 0) {
              throw ApiError.conflict('Mã khuyến mãi đã hết lượt sử dụng do đơn hàng khác vừa áp dụng');
            }
          } else {
            await tx.voucher.update({
              where: { id: appliedVoucherId },
              data: { usedCount: { increment: 1 } }
            });
          }
        }

        // Neu la don an tai ban -> cap nhat trang thai ban sang OCCUPIED
        if (!isGuestPrepayment && input.orderType === 'DINE_IN' && resolvedTableId) {
          await tx.diningTable.update({
            where: { id: resolvedTableId },
            data: {
              status: 'OCCUPIED',
              currentOrderId: order.id
            }
          });
        }

        return { order, isDuplicate: false, stockChanges, awaitingPayment: requiresReservationPrepayment };
      });
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueConstraintError(error)) throw error;
      const existing = await findExisting(prisma);
      if (!existing) throw error;
      assertMatchingRequest(existing.requestHash);
      transactionResult = { order: existing, isDuplicate: true, stockChanges: [] };
    }

    if (transactionResult.isDuplicate) {
      return { order: transactionResult.order, isDuplicate: true };
    }
    emitMenuStockChanged(transactionResult.stockChanges);
    const createdOrder = formatOrderDto(transactionResult.order);

    if (transactionResult.awaitingPayment) {
      return { order: transactionResult.order, isDuplicate: false, awaitingPayment: true };
    }

    // Phat su kien don hang moi chi vao phong KDS bep va toan he thong
    emitToRoom('restaurant:kds', 'order:new', { order: createdOrder });
    emitToAll('order:new', { order: createdOrder });

    if (targetTable) {
      emitToAll('table:statusChanged', {
        tableId: targetTable.id,
        tableNumber: targetTable.tableNumber,
        status: 'OCCUPIED',
        currentOrderId: createdOrder.id
      });
    }

    return { order: transactionResult.order, isDuplicate: false };
  }

  private static async availableReservationCredit(tx: any, reservationId: number) {
    const movements = await tx.reservationDepositTransaction.findMany({
      where: { reservationId, status: 'SUCCESS' }, select: { type: true, amount: true }
    });
    const received = movements.filter((row: any) => row.type === 'DEPOSIT').reduce((sum: number, row: any) => sum + row.amount, 0);
    const used = movements.filter((row: any) => ['REFUND', 'PARTIAL_REFUND', 'FORFEIT', 'APPLY_TO_BILL'].includes(row.type))
      .reduce((sum: number, row: any) => sum + row.amount, 0);
    return Math.max(0, received - used);
  }

  private static async reserveOrderItems(tx: any, items: Array<{ menuItemId: number; quantity: number }>) {
    const menuItems = await tx.menuItem.findMany({ where: { id: { in: items.map(item => item.menuItemId) } }, select: { id: true, trackStock: true } });
    return reserveMenuStockForOrder(tx, items, new Set(menuItems.filter((item: any) => item.trackStock).map((item: any) => item.id)));
  }

  private static emitPrepaidOrder(order: any, stockChanges: MenuStockChange[]) {
    emitMenuStockChanged(stockChanges);
    const orderDto = formatOrderDto(order);
    emitToRoom('restaurant:kds', 'order:new', { order: orderDto });
    emitToAll('order:new', { order: orderDto });
    if (order.table) emitToAll('table:statusChanged', {
      tableId: order.table.id, tableNumber: order.table.tableNumber, status: 'OCCUPIED', currentOrderId: order.id
    });
  }

  static async declareReservationOrderPayment(orderId: number, input: ReservationOrderPaymentDeclarationInput) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
      if (!current || !current.reservationId || !current.tableId) throw ApiError.notFound('Không tìm thấy order đặt bàn');
      const reservation = await ReservationsService.requireCheckedInToken(tx, input.reservationAccessToken, current.tableId);
      if (reservation.id !== current.reservationId) throw ApiError.notFound('Order không thuộc mã đặt bàn này');
      if (current.status !== 'PENDING') throw ApiError.conflict('Order không còn chờ thanh toán');
      if (current.paymentStatus === 'WAITING_CONFIRMATION') {
        const pending = await tx.orderPaymentTransaction.findFirst({ where: { orderId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
        if (!pending) throw ApiError.conflict('Không tìm thấy giao dịch chờ xác nhận');
        return { order: current, amountDue: pending.amount, autoPaid: false, stockChanges: [], commissionChanged: false };
      }
      if (current.paymentStatus !== 'UNPAID') throw ApiError.conflict('Order không còn chờ thanh toán trước');

      const availableCredit = await this.availableReservationCredit(tx, reservation.id);
      const appliedDeposit = Math.min(current.finalAmount, availableCredit);
      const amountDue = amountReceivedAfterCredit(current.finalAmount, appliedDeposit);
      if (amountDue > 0) {
        await tx.orderPaymentTransaction.create({ data: { orderId, status: 'PENDING', amount: amountDue, paymentMethod: 'BANK_TRANSFER' } });
        const order = await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'WAITING_CONFIRMATION' }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
        await AuditService.logInTransaction(tx, {
          action: 'RESERVATION_ORDER_PAYMENT_DECLARED', targetType: 'Order', targetId: orderId,
          metadata: { reservationId: reservation.id, amountDue }
        });
        return { order, amountDue, autoPaid: false, stockChanges: [], commissionChanged: false };
      }

      if (appliedDeposit > 0) {
        await tx.reservationDepositTransaction.create({ data: {
          reservationId: reservation.id, orderId, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: appliedDeposit,
          reason: 'Dùng tiền cọc trả trước cho order', confirmedAt: new Date()
        } });
        await tx.reservation.update({ where: { id: reservation.id }, data: { depositStatus: 'APPLIED_TO_BILL' } });
      }
      const paidAt = new Date();
      const order = await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID', paidAt }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
      const stockChanges = await this.reserveOrderItems(tx, current.items);
      await tx.diningTable.update({ where: { id: current.tableId }, data: { currentOrderId: orderId, status: 'OCCUPIED' } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_ORDER_PAID_BY_DEPOSIT', targetType: 'Order', targetId: orderId,
        metadata: { reservationId: reservation.id, appliedDeposit }
      });
      const commission = await EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, paidAt);
      return { order, amountDue: 0, autoPaid: true, stockChanges, commissionChanged: commission.changed };
    });
    if (result.autoPaid) this.emitPrepaidOrder(result.order, result.stockChanges);
    emitToAll('reservations:changed', { ids: [result.order.reservationId], updatedAt: new Date().toISOString() });
    emitToAll('order:paymentChanged', { orderId, paymentStatus: result.order.paymentStatus, updatedAt: new Date().toISOString() });
    if (result.commissionChanged) emitToAll('employee-commission:changed', { revision: Date.now(), branchId: 1, reason: 'PAYMENT_RECOGNIZED', affectedPlanIds: [], affectedEmployeeIds: [], affectedOrderItemIds: result.order.items.map((item: { id: number }) => item.id), updatedAt: new Date().toISOString() });
    const transferContent = `THU ${result.order.code}`;
    return { order: result.order, paymentStatus: result.order.paymentStatus, amountDue: result.amountDue, transferContent, paymentInstructions: result.amountDue > 0 ? getVietQrInstructions(result.amountDue, transferContent) : null };
  }

  static async confirmReservationOrderPayment(orderId: number, input: ConfirmOrderPaymentInput, actorId: number, actorName: string, actorRole: 'ADMIN' | 'CASHIER' = 'CASHIER') {
    try {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
        const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
        if (!current || !current.reservationId || !current.tableId) throw ApiError.notFound('Không tìm thấy order đặt bàn');
        await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${current.reservationId} FOR UPDATE`;
        const reservation = await tx.reservation.findUnique({ where: { id: current.reservationId } });
        if (!reservation || reservation.status !== 'CHECKED_IN' || reservation.tableId !== current.tableId) throw ApiError.conflict('Order không còn thuộc lượt đặt bàn đang check-in');
        if (current.paymentStatus !== 'WAITING_CONFIRMATION') throw ApiError.conflict('Order không còn chờ xác nhận thanh toán');
        const pending = await tx.orderPaymentTransaction.findFirst({ where: { orderId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
        if (!pending) throw ApiError.conflict('Không tìm thấy giao dịch thanh toán đang chờ');

        const availableCredit = await this.availableReservationCredit(tx, reservation.id);
        const appliedDeposit = Math.min(current.finalAmount, availableCredit);
        const amountDue = amountReceivedAfterCredit(current.finalAmount, appliedDeposit);
        if (input.amount !== pending.amount || input.amount !== amountDue) throw ApiError.conflict('Số tiền chuyển khoản đã thay đổi; cần tạo lại yêu cầu thanh toán');
        const now = new Date();
        if (appliedDeposit > 0) {
          await tx.reservationDepositTransaction.create({ data: {
            reservationId: reservation.id, orderId, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: appliedDeposit,
            reason: 'Dùng tiền cọc trả trước cho order', confirmedByUserId: actorId, confirmedAt: now
          } });
          await tx.reservation.update({ where: { id: reservation.id }, data: { depositStatus: 'APPLIED_TO_BILL' } });
        }

        const financialAccountId = await resolveCashbookAccountForPayment(tx, 'BANK_TRANSFER', input.financialAccountId);
        const payment = await tx.orderPaymentTransaction.create({ data: {
          orderId, status: 'SUCCESS', amount: input.amount, paymentMethod: 'BANK_TRANSFER',
          financialAccountId, externalReference: input.externalReference, confirmedByUserId: actorId, confirmedAt: now
        } });
        const category = await tx.cashFlowCategory.findUniqueOrThrow({ where: { code: 'CUSTOMER_PAYMENT' } });
        const voucher = financialAccountId === null ? null : await CashbookPostingService.post(tx, {
          direction: 'RECEIPT', amount: payment.amount, accountId: financialAccountId, categoryId: category.id,
          paymentMethod: 'BANK_TRANSFER', occurredAt: now, sourceType: 'ORDER_PAYMENT',
          sourceTransactionId: payment.id, sourceCode: current.code,
          counterpartyType: current.customerId ? 'CUSTOMER' : null, counterpartyId: current.customerId,
          note: 'Khách thanh toán trước order đặt bàn'
        }, { id: actorId, name: actorName, role: actorRole });
        const order = await tx.order.update({ where: { id: orderId }, data: {
          paymentStatus: 'PAID', paymentMethod: 'BANK_TRANSFER', paidAt: now
        }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
        const stockChanges = await this.reserveOrderItems(tx, current.items);
        await tx.diningTable.update({ where: { id: current.tableId }, data: { currentOrderId: orderId, status: 'OCCUPIED' } });
        await AuditService.logInTransaction(tx, {
          action: 'RESERVATION_ORDER_PREPAYMENT_CONFIRMED', targetType: 'Order', targetId: orderId,
          actorId, actorName, metadata: { reservationId: reservation.id, amount: input.amount, appliedDeposit, externalReference: input.externalReference }
        });
        const commission = await EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, now, { id: actorId, name: actorName });
        return { order, stockChanges, voucher, commissionChanged: commission.changed };
      });
      this.emitPrepaidOrder(result.order, result.stockChanges);
      emitToAll('reservations:changed', { ids: [result.order.reservationId], updatedAt: new Date().toISOString() });
      if (result.voucher) emitToAll('cashbook:changed', cashbookChangedEvent(result.voucher));
      if (result.commissionChanged) emitToAll('employee-commission:changed', { revision: Date.now(), branchId: 1, reason: 'PAYMENT_RECOGNIZED', affectedPlanIds: [], affectedEmployeeIds: [], affectedOrderItemIds: result.order.items.map((item: { id: number }) => item.id), updatedAt: new Date().toISOString() });
      return result.order;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw ApiError.conflict('Mã giao dịch đã được ghi nhận hoặc tiền cọc đã được áp dụng cho order này');
      normalizeCashbookPersistenceError(error);
    }
  }

  static async rejectReservationOrderPayment(orderId: number, input: RejectOrderPaymentInput, actorId: number, actorName: string) {
    const order = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current || !current.reservationId) throw ApiError.notFound('Không tìm thấy order đặt bàn');
      if (current.paymentStatus !== 'WAITING_CONFIRMATION') throw ApiError.conflict('Order không còn chờ xác nhận thanh toán');
      const pending = await tx.orderPaymentTransaction.findFirst({ where: { orderId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
      if (!pending) throw ApiError.conflict('Không tìm thấy giao dịch thanh toán đang chờ');
      await tx.orderPaymentTransaction.create({ data: {
        orderId, status: 'REJECTED', amount: pending.amount, paymentMethod: 'BANK_TRANSFER', reason: input.reason,
        confirmedByUserId: actorId, confirmedAt: new Date()
      } });
      const updated = await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'UNPAID' } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_ORDER_PREPAYMENT_REJECTED', targetType: 'Order', targetId: orderId,
        actorId, actorName, metadata: { reason: input.reason, amount: pending.amount }
      });
      return updated;
    });
    emitToAll('order:paymentChanged', { orderId, paymentStatus: order.paymentStatus, updatedAt: new Date().toISOString() });
    return order;
  }

  static async authorizeReservationOrderPayLater(orderId: number, input: AuthorizeReservationOrderPayLaterInput, actorId: number, actorName: string) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
      if (!current || !current.reservationId || !current.tableId) throw ApiError.notFound('Không tìm thấy order đặt bàn');
      if (current.status !== 'PENDING' || current.paymentStatus === 'PAID' || current.payLaterAuthorized) throw ApiError.conflict('Order hiện không thể được cấp quyền trả sau');
      await tx.$queryRaw`SELECT id FROM Reservation WHERE id = ${current.reservationId} FOR UPDATE`;
      const reservation = await tx.reservation.findUnique({ where: { id: current.reservationId } });
      if (!reservation || reservation.status !== 'CHECKED_IN' || reservation.tableId !== current.tableId || !['PAID', 'APPLIED_TO_BILL'].includes(reservation.depositStatus)) {
        throw ApiError.conflict('Chỉ được cấp trả sau cho lượt đặt bàn đã check-in và có tiền cọc xác nhận');
      }
      if (current.paymentStatus === 'WAITING_CONFIRMATION') {
        const pending = await tx.orderPaymentTransaction.findMany({ where: { orderId, status: 'PENDING' } });
        for (const transaction of pending) await tx.orderPaymentTransaction.create({ data: {
          orderId, status: 'REJECTED', amount: transaction.amount, paymentMethod: transaction.paymentMethod,
          reason: `Được phép trả sau: ${input.reason}`, confirmedByUserId: actorId, confirmedAt: new Date()
        } });
      }
      const order = await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'UNPAID', payLaterAuthorized: true }, include: { items: true, table: { select: { id: true, tableNumber: true } } } });
      const stockChanges = await this.reserveOrderItems(tx, current.items);
      await tx.diningTable.update({ where: { id: current.tableId }, data: { currentOrderId: orderId, status: 'OCCUPIED' } });
      await AuditService.logInTransaction(tx, {
        action: 'RESERVATION_ORDER_PAY_LATER_AUTHORIZED', targetType: 'Order', targetId: orderId,
        actorId, actorName, metadata: { reservationId: reservation.id, customerId: reservation.customerId, reason: input.reason, amount: current.finalAmount }
      });
      return { order, stockChanges };
    });
    this.emitPrepaidOrder(result.order, result.stockChanges);
    emitToAll('order:paymentChanged', { orderId, paymentStatus: 'UNPAID', payLaterAuthorized: true, updatedAt: new Date().toISOString() });
    emitToAll('reservations:changed', { ids: [result.order.reservationId], updatedAt: new Date().toISOString() });
    return formatOrderDto(result.order);
  }

  /**
   * Thanh toan don hang va tu dong reset ban an ve AVAILABLE khi het don UNPAID
   */
  static async payOrder(orderId: number, input: PayOrderInput, actor?: { id: number; name: string }) {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!existingOrder) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    if (existingOrder.reservationId && existingOrder.createdByUserId === null && !existingOrder.payLaterAuthorized && existingOrder.paymentStatus !== 'PAID') {
      throw ApiError.conflict('Order QR của khách phải được xác nhận prepayment trước khi vào bếp');
    }

    // Double-pay guard (FSM check): Nếu đơn đã trả thì ném 409 CONFLICT
    if (existingOrder.paymentStatus === 'PAID') {
      throw ApiError.conflict(`Đơn hàng ID ${orderId} đã được thanh toán từ trước`);
    }

    const { order: updatedOrder, tableState, inventoryChange, cashVoucher } = await prisma.$transaction(async (tx) => {
      if (existingOrder.tableId) {
        // Serialize create/pay operations on the same table before reading its unpaid orders.
        await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${existingOrder.tableId} FOR UPDATE`;
      }

      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;

      const lockedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          table: { select: { id: true, tableNumber: true } }
        }
      });
      if (!lockedOrder) {
        throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
      }

      if (lockedOrder.paymentStatus === 'PAID') {
        throw ApiError.conflict(`Đơn hàng ID ${orderId} đã được thanh toán từ trước`);
      }

      const paidAt = new Date();
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: input.paymentMethod as PaymentMethod,
          paidAt,
          status: 'COMPLETED',
          completedAt: new Date()
        },
        include: { items: true }
      });

      // Tu dong tru kho nguyen lieu theo cong thuc dinh luong BOM (Atomic Transaction)
      const inventoryChange = await InventoryService.deductInventoryForOrder(tx, order.id, order.items);

      const cashVoucher = await CashbookPostingService.post(tx, {
        direction: 'RECEIPT',
        paymentMethod: input.paymentMethod as PaymentMethod,
        accountId: input.paymentMethod === 'CASH' ? undefined : input.financialAccountId,
        categoryCode: 'CUSTOMER_PAYMENT',
        amount: order.finalAmount,
        occurredAt: paidAt,
        sourceType: CashVoucherSourceType.ORDER_PAYMENT,
        sourceId: order.id,
        sourceCode: order.code,
        affectsBusinessResult: false
      }, actor ?? { id: null, name: 'Hệ thống' });

      let nextTableState: { tableId: number; tableNumber: number; status: 'AVAILABLE' | 'OCCUPIED'; currentOrderId: number | null } | null = null;
      if (order.tableId) {
        const remainingOrder = await tx.order.findFirst({
          where: {
            tableId: order.tableId,
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });
        const status = remainingOrder ? 'OCCUPIED' as const : 'AVAILABLE' as const;
        const currentOrderId = remainingOrder?.id ?? null;
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: {
            status,
            currentOrderId
          }
        });
        if (lockedOrder.table) {
          nextTableState = {
            tableId: lockedOrder.table.id,
            tableNumber: lockedOrder.table.tableNumber,
            status,
            currentOrderId
          };
        }
      }

      return { order, tableState: nextTableState, inventoryChange, cashVoucher };
    });

    if (cashVoucher) {
      emitCashbookChanged({ voucherIds: [cashVoucher.id], reason: 'SOURCE_POSTED', updatedAt: new Date().toISOString() });
    }

    emitInventoryChanged({
      sourceType: 'INGREDIENT',
      sourceIds: inventoryChange.ingredientIds,
      reason: 'ORDER_PAID',
      updatedAt: new Date().toISOString()
    });
    if (voucher) emitToAll('cashbook:changed', cashbookChangedEvent(voucher));

    // Phat su kien WebSocket realtime
    emitToAll('order:statusChanged', {
      orderId: updatedOrder.id,
      code: updatedOrder.code,
      status: 'COMPLETED',
      tableId: updatedOrder.tableId,
      tableNumber: tableState?.tableNumber,
      completedAt: updatedOrder.completedAt?.toISOString()
    });

    if (tableState) {
      emitToAll('table:statusChanged', tableState);
    }
    if (commissionChanged) emitToAll('employee-commission:changed', {
      revision: Date.now(), branchId: 1, reason: 'PAYMENT_RECOGNIZED', affectedPlanIds: [], affectedEmployeeIds: [],
      affectedOrderItemIds: updatedOrder.items.map((item: { id: number }) => item.id), updatedAt: new Date().toISOString()
    });

    return { order: updatedOrder };
  }

  /**
   * Lay danh sach don hang cho man hinh bep KDS hoac quan ly
   */
  static async getOrders(filter?: { status?: string[] }) {
    const where: any = { OR: [
      { createdByUserId: { not: null } },
      { payLaterAuthorized: true },
      { reservationId: null },
      { paymentStatus: 'PAID' }
    ] };
    if (filter?.status && filter.status.length > 0) {
      where.status = { in: filter.status };
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        table: { select: { id: true, tableNumber: true } }
      }
    });

    return orders.map(formatOrderDto);
  }

  static async getReservationPaymentConfirmations() {
    const orders = await prisma.order.findMany({
      where: {
        reservationId: { not: null }, status: 'PENDING', paymentStatus: { in: ['UNPAID', 'WAITING_CONFIRMATION'] },
        payLaterAuthorized: false, reservation: { is: { status: 'CHECKED_IN' } }
      },
      orderBy: { updatedAt: 'asc' },
      include: {
        items: true,
        table: { select: { id: true, tableNumber: true } },
        customer: { select: { id: true, name: true, phone: true } },
        reservation: { select: { id: true, code: true, contactName: true, contactPhone: true } },
        paymentTransactions: {
          where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, amount: true, paymentMethod: true, createdAt: true }
        }
      }
    });
    return orders.map(order => ({
      ...formatOrderDto(order),
      reservationId: order.reservationId,
      reservation: order.reservation,
      customer: order.customer,
      paymentDeclaration: order.paymentTransactions[0] ?? null
    }));
  }

  /**
   * Chuyen trang thai don hang theo Finite State Machine (FSM):
   * PENDING -> PREPARING -> READY -> COMPLETED
   */
  static async updateOrderStatus(orderId: number, nextStatus: 'PREPARING' | 'READY' | 'COMPLETED', userId?: number) {
    const updatedOrder = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          table: { select: { id: true, tableNumber: true } }
        }
      });

      if (!order) {
        throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
      }

      // FSM State transitions: PENDING -> PREPARING -> READY -> COMPLETED
      const validTransitions: Record<string, string[]> = {
        PENDING: ['PREPARING'],
        PREPARING: ['READY'],
        READY: ['COMPLETED']
      };

      const allowed = validTransitions[order.status];
      if (!allowed || !allowed.includes(nextStatus)) {
        throw ApiError.orderStateInvalid(
          `Không thể chuyển trạng thái từ ${order.status} sang ${nextStatus}. Luồng trạng thái hợp lệ: PENDING -> PREPARING -> READY -> COMPLETED`
        );
      }

      const now = new Date();
      const data: any = { status: nextStatus };

      if (nextStatus === 'PREPARING') {
        if (!order.preparingAt) {
          data.preparingAt = now;
        }
      } else if (nextStatus === 'READY') {
        if (!order.readyAt) {
          data.readyAt = now;
        }
      } else if (nextStatus === 'COMPLETED') {
        if (!order.completedAt) {
          data.completedAt = now;
        }
      }

      await claimInitialOrderReceiver(tx, orderId, userId);
      return tx.order.update({
        where: { id: orderId },
        data,
        include: {
          items: true,
          table: { select: { id: true, tableNumber: true } }
        }
      });
    });

    const orderDto = formatOrderDto(updatedOrder);

    // Phat su kien Socket toi room restaurant:kds va toan he thong
    const socketPayload = {
      orderId: updatedOrder.id,
      code: updatedOrder.code,
      status: updatedOrder.status,
      tableId: updatedOrder.tableId ?? updatedOrder.table?.id,
      tableNumber: updatedOrder.table?.tableNumber,
      prepTimeSec: orderDto.prepTimeSec,
      preparingAt: orderDto.preparingAt,
      readyAt: orderDto.readyAt,
      completedAt: orderDto.completedAt
    };

    emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
    emitToAll('order:statusChanged', socketPayload);

    return orderDto;
  }

  static async voidOrder(orderId: number, input: VoidOrderInput, voidedByUserId?: number, actorName?: string) {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true,
        items: true
      }
    });

    if (!existingOrder) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    if (existingOrder.status === 'CANCELLED') {
      throw ApiError.orderStateInvalid('Đơn hàng đã bị hủy trước đó');
    }

    const { order, tableState, stockChanges, cashbookReversal } = await prisma.$transaction(async (tx) => {
      if (existingOrder.tableId) {
        await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${existingOrder.tableId} FOR UPDATE`;
      }

      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
      const lockedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { menuItem: { select: { sku: true, name: true } } } }, table: true }
      });

      if (!lockedOrder) {
        throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
      }
      if (lockedOrder.status === 'CANCELLED') {
        throw ApiError.orderStateInvalid('Đơn hàng đã bị hủy trước đó');
      }
      const cashbookReversal = lockedOrder.paymentStatus === 'PAID'
        ? await CashbookPostingService.reverseSystemVoucher(
            tx,
            CashVoucherSourceType.ORDER_PAYMENT,
            lockedOrder.id,
            { id: voidedByUserId ?? null, name: actorName ?? 'Hệ thống' }
          )
        : null;

      const restoredStock = await restoreMenuStockForOrder(tx, lockedOrder.items);
      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'VOIDED',
          voidedByUserId: voidedByUserId ?? null,
          voidReason: input.reason,
          voidedAt: now,
          cancelledAt: now
        },
        include: {
          items: true,
          table: true
        }
      });

      let nextTableState: any = null;
      if (lockedOrder.tableId) {
        const remainingOrder = await tx.order.findFirst({
          where: {
            tableId: lockedOrder.tableId,
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' },
            id: { not: orderId }
          },
          select: { id: true }
        });

        const status = remainingOrder ? 'OCCUPIED' : 'AVAILABLE';
        const currentOrderId = remainingOrder?.id ?? null;

        await tx.diningTable.update({
          where: { id: lockedOrder.tableId },
          data: {
            status,
            currentOrderId
          }
        });

        if (updatedOrder.table) {
          nextTableState = {
            tableId: updatedOrder.table.id,
            tableNumber: updatedOrder.table.tableNumber,
            status,
            currentOrderId
          };
        }
      }

      return { order: updatedOrder, tableState: nextTableState, stockChanges: restoredStock, cashbookReversal };
    });

    if (cashbookReversal) {
      emitCashbookChanged({ voucherIds: [cashbookReversal.id], reason: 'SOURCE_REVERSED', updatedAt: new Date().toISOString() });
    }

    emitInventoryChanged({
      sourceType: 'MENU_ITEM',
      sourceIds: stockChanges.map(change => change.menuItemId),
      reason: 'ORDER_VOIDED',
      updatedAt: new Date().toISOString()
    });
    emitMenuStockChanged(stockChanges);
    const orderDto = formatOrderDto(order);

    const socketPayload = {
      orderId: orderDto.id,
      code: orderDto.code,
      status: orderDto.status,
      tableId: orderDto.tableId,
      tableNumber: orderDto.tableNumber,
      cancelledAt: orderDto.cancelledAt
    };

    emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
    emitToAll('order:statusChanged', socketPayload);

    if (tableState) {
      emitToAll('table:statusChanged', tableState);
    }

    return { order: orderDto };
  }

  /**
   * Tu dong huy cac don hang PENDING qua timeoutMinutes (mac dinh 60 phut)
   * voi ly do qua gio, kem cap nhat giai phong ban va phat su kien Socket.io
   */
  static async autoCancelExpiredOrders(timeoutMinutes: number = 60) {
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: { not: 'PAID' },
        createdAt: { lte: cutoffDate }
      },
      include: {
        table: true
      }
    });

    if (expiredOrders.length === 0) {
      return {
        cancelledCount: 0,
        cancelledOrderIds: []
      };
    }

    const cancelledOrderIds: number[] = [];
    const now = new Date();
    const defaultReason = timeoutMinutes === 60
      ? 'Quá thời gian: Hơn 1 giờ chưa cập nhật trạng thái'
      : `Quá thời gian: Hơn ${timeoutMinutes} phút chưa cập nhật trạng thái`;

    for (const expOrder of expiredOrders) {
      try {
        const transactionResult = await prisma.$transaction(async (tx) => {
          if (expOrder.tableId) {
            await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${expOrder.tableId} FOR UPDATE`;
          }

          await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${expOrder.id} FOR UPDATE`;
          const lockedOrder = await tx.order.findUnique({
            where: { id: expOrder.id },
            include: { items: { include: { menuItem: { select: { sku: true, name: true } } } }, table: true }
          });

          if (!lockedOrder || lockedOrder.status !== 'PENDING' || lockedOrder.paymentStatus === 'PAID') {
            return null;
          }

          const restoredStock = await restoreMenuStockForOrder(tx, lockedOrder.items);
          const updatedOrder = await tx.order.update({
            where: { id: lockedOrder.id },
            data: {
              status: 'CANCELLED',
              paymentStatus: 'VOIDED',
              voidedByUserId: null,
              voidReason: defaultReason,
              voidedAt: now,
              cancelledAt: now
            },
            include: {
              items: true,
              table: true
            }
          });

          let nextTableState: any = null;
          if (lockedOrder.tableId) {
            const remainingOrder = await tx.order.findFirst({
              where: {
                tableId: lockedOrder.tableId,
                paymentStatus: 'UNPAID',
                status: { not: 'CANCELLED' },
                id: { not: lockedOrder.id }
              },
              select: { id: true }
            });

            const status = remainingOrder ? 'OCCUPIED' : 'AVAILABLE';
            const currentOrderId = remainingOrder?.id ?? null;

            await tx.diningTable.update({
              where: { id: lockedOrder.tableId },
              data: {
                status,
                currentOrderId
              }
            });

            if (updatedOrder.table) {
              nextTableState = {
                tableId: updatedOrder.table.id,
                tableNumber: updatedOrder.table.tableNumber,
                status,
                currentOrderId
              };
            }
          }

          await recordOrderVoidCancellations(tx, lockedOrder, {
            reason: defaultReason,
            cancelledAt: now,
            cancelledByUserId: null,
            restoredMenuItemIds: restoredStock.map(change => change.menuItemId)
          });
          await AuditService.logInTransaction(tx, {
            action: 'ORDER_VOIDED',
            targetType: 'Order',
            targetId: updatedOrder.id,
            actorId: null,
            actorName: null,
            metadata: {
              code: updatedOrder.code,
              reason: defaultReason,
              totalAmount: updatedOrder.totalAmount,
              tableNumber: updatedOrder.table?.tableNumber,
              source: 'ORDER_VOID',
              trigger: 'AUTO_CANCEL_TIMEOUT',
              timeoutMinutes
            }
          });

          return { order: updatedOrder, tableState: nextTableState, stockChanges: restoredStock };
        });

        if (!transactionResult) continue;
        const { order, tableState, stockChanges } = transactionResult;

        cancelledOrderIds.push(order.id);

        emitInventoryChanged({
          sourceType: 'MENU_ITEM',
          sourceIds: stockChanges.map(change => change.menuItemId),
          reason: 'ORDER_VOIDED',
          updatedAt: new Date().toISOString()
        });

        const orderDto = formatOrderDto(order);
        const socketPayload = {
          orderId: orderDto.id,
          code: orderDto.code,
          status: orderDto.status,
          tableId: orderDto.tableId,
          tableNumber: orderDto.tableNumber,
          cancelledAt: orderDto.cancelledAt,
          voidReason: defaultReason
        };

        emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
        emitToAll('order:statusChanged', socketPayload);
        emitMenuStockChanged(stockChanges);

        if (tableState) {
          emitToAll('table:statusChanged', tableState);
        }
      } catch (err) {
        console.error(`[AutoCancel] Loi khi tu dong huy don ID ${expOrder.id}:`, err);
      }
    }

    return {
      cancelledCount: cancelledOrderIds.length,
      cancelledOrderIds
    };
  }
}

function formatOrderDto(order: any) {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  let prepTimeSec: number | null = null;
  if (order.readyAt && order.preparingAt) {
    prepTimeSec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) / 1000));
  } else if (order.readyAt) {
    prepTimeSec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.createdAt).getTime()) / 1000));
  }

  return {
    id: order.id,
    code: order.code,
    orderType: order.orderType,
    status: order.status,
    receivedByEmployeeId: order.receivedByEmployeeId ?? null,
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    deliveryPartnerId: order.deliveryPartnerId ?? null,
    deliveryPartner: order.deliveryPartner ? { id: order.deliveryPartner.id, code: order.deliveryPartner.code, name: order.deliveryPartner.name } : null,
    deliveryAddress: order.deliveryAddress ?? null,
    deliveryFee: order.deliveryFee ?? 0,
    deliveryFeePaid: order.deliveryFeePaid ?? 0,
    buzzerNumber: order.buzzerNumber ?? null,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount ?? 0,
    voucherId: order.voucherId ?? null,
    voucherCode: order.voucherCode ?? null,
    vatAmount: order.vatAmount,
    finalAmount: order.finalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    payLaterAuthorized: order.payLaterAuthorized ?? false,
    paidAt: order.paidAt ? (order.paidAt instanceof Date ? order.paidAt.toISOString() : order.paidAt) : null,
    notes: order.notes,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
    preparingAt: order.preparingAt ? (order.preparingAt instanceof Date ? order.preparingAt.toISOString() : order.preparingAt) : null,
    readyAt: order.readyAt ? (order.readyAt instanceof Date ? order.readyAt.toISOString() : order.readyAt) : null,
    completedAt: order.completedAt ? (order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt) : null,
    cancelledAt: order.cancelledAt ? (order.cancelledAt instanceof Date ? order.cancelledAt.toISOString() : order.cancelledAt) : null,
    prepTimeSec,
    voidedByUserId: order.voidedByUserId ?? null,
    voidReason: order.voidReason ?? null,
    voidedAt: order.voidedAt ? (order.voidedAt instanceof Date ? order.voidedAt.toISOString() : order.voidedAt) : null,
    items: orderItems.map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      selectedModifiersJson: item.selectedModifiersJson,
      notes: item.notes
    }))
  };
}
