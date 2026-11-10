import { OrderStatus, OrderType, PaymentStatus, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { OrderInvoiceQuery } from './order-invoice.schemas';
import { OrderInvoiceExportRow } from './order-invoice.export';

const invoiceInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: { include: { menuItem: { select: { sku: true, name: true } } }, orderBy: { id: 'asc' } },
  table: { select: { tableNumber: true } },
  customer: { select: { name: true } },
  deliveryPartner: { select: { name: true } },
  createdByUser: { select: { id: true, name: true } }
});
type InvoiceRecord = Prisma.OrderGetPayload<{ include: typeof invoiceInclude }>;

// Lazy-load để các test/router chỉ kiểm tra authentication không cần DATABASE_URL.
async function getPrisma(): Promise<PrismaClient> {
  const module = await import('../../config/prisma');
  return module.prisma;
}

export type OrderInvoiceListItem = {
  id: number; code: string; createdAt: Date; orderType: OrderType; status: OrderStatus; paymentStatus: PaymentStatus;
  paymentMethod: string | null; customerName: string | null; tableNumber: number | null;
  totalGoods: number; discountAmount: number; totalAfterDiscount: number; vatAmount: number; finalAmount: number; paidAmount: number; itemCount: number;
};

export type OrderInvoiceDetail = OrderInvoiceListItem & {
  deliveryFee: number; deliveryAddress: string | null; deliveryPartnerName: string | null; buzzerNumber: number | null;
  voucherCode: string | null; voidReason: string | null;
  paidAt: Date | null; notes: string | null; createdByUser: { id: number; name: string } | null;
  items: Array<{ id: number; menuItemId: number; sku: string; menuItemName: string; quantity: number; unitPrice: number; subtotal: number; notes: string | null; selectedModifiers: Prisma.JsonValue | null }>;
};

export type OrderInvoiceData = {
  items: OrderInvoiceListItem[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalGoods: number; totalDiscount: number; totalAfterDiscount: number; totalVat: number; totalFinal: number; totalPaid: number };
};

function dateRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00+07:00`);
  if (to) {
    const end = new Date(`${to}T00:00:00+07:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  return range;
}

function whereFromQuery(query: OrderInvoiceQuery): Prisma.OrderWhereInput {
  const createdAt = dateRange(query.from, query.to);
  return {
    ...(query.search ? { code: { contains: query.search } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.statuses ? { status: { in: query.statuses as OrderStatus[] } } : {}),
    ...(query.paymentStatuses ? { paymentStatus: { in: query.paymentStatuses as PaymentStatus[] } } : {}),
    ...(query.orderTypes ? { orderType: { in: query.orderTypes as OrderType[] } } : {})
  };
}

function mapListItem(order: InvoiceRecord): OrderInvoiceListItem {
  return {
    id: order.id, code: order.code, createdAt: order.createdAt, orderType: order.orderType, status: order.status,
    paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, customerName: order.customer?.name ?? null,
    tableNumber: order.table?.tableNumber ?? null, totalGoods: order.totalAmount, discountAmount: order.discountAmount,
    totalAfterDiscount: Math.max(0, order.totalAmount - order.discountAmount), vatAmount: order.vatAmount, finalAmount: order.finalAmount,
    paidAmount: order.paymentStatus === PaymentStatus.PAID ? order.finalAmount : 0, itemCount: order.items.length
  };
}

function mapDetail(order: InvoiceRecord): OrderInvoiceDetail {
  return {
    ...mapListItem(order), deliveryFee: order.deliveryFee, deliveryAddress: order.deliveryAddress,
    deliveryPartnerName: order.deliveryPartner?.name ?? null, buzzerNumber: order.buzzerNumber,
    voucherCode: order.voucherCode, voidReason: order.voidReason,
    paidAt: order.paidAt, notes: order.notes, createdByUser: order.createdByUser,
    items: order.items.map((item) => ({
      id: item.id, menuItemId: item.menuItemId, sku: item.menuItem.sku, menuItemName: item.menuItem.name,
      quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal, notes: item.notes,
      selectedModifiers: item.selectedModifiersJson
    }))
  };
}

export class OrderInvoiceService {
  static async list(query: OrderInvoiceQuery): Promise<OrderInvoiceData> {
    const prisma = await getPrisma();
    const where = whereFromQuery(query);
    const [totalRows, records, allTotals] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({ where, include: invoiceInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.order.findMany({ where, select: { totalAmount: true, discountAmount: true, vatAmount: true, finalAmount: true, paymentStatus: true } })
    ]);
    const summary = allTotals.reduce((result, order) => ({
      totalGoods: result.totalGoods + order.totalAmount,
      totalDiscount: result.totalDiscount + order.discountAmount,
      totalAfterDiscount: result.totalAfterDiscount + Math.max(0, order.totalAmount - order.discountAmount),
      totalVat: result.totalVat + order.vatAmount,
      totalFinal: result.totalFinal + order.finalAmount,
      totalPaid: result.totalPaid + (order.paymentStatus === PaymentStatus.PAID ? order.finalAmount : 0)
    }), { totalGoods: 0, totalDiscount: 0, totalAfterDiscount: 0, totalVat: 0, totalFinal: 0, totalPaid: 0 });
    return {
      items: records.map(mapListItem),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.ceil(totalRows / query.pageSize) },
      summary
    };
  }

  static async detail(id: number): Promise<OrderInvoiceDetail> {
    const prisma = await getPrisma();
    const order = await prisma.order.findUnique({ where: { id }, include: invoiceInclude });
    if (!order) throw ApiError.notFound('Không tìm thấy hóa đơn');
    return mapDetail(order);
  }

  static async exportRows(query: OrderInvoiceQuery): Promise<OrderInvoiceExportRow[]> {
    const prisma = await getPrisma();
    const where = whereFromQuery(query);
    const records = await prisma.order.findMany({ where, include: invoiceInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return records.map((order) => {
      const row = mapListItem(order);
      return {
        code: row.code, createdAt: row.createdAt.toISOString(), orderType: row.orderType, status: row.status,
        paymentStatus: row.paymentStatus, customerName: row.customerName, totalGoods: row.totalGoods,
        discountAmount: row.discountAmount, totalAfterDiscount: row.totalAfterDiscount, vatAmount: row.vatAmount,
        finalAmount: row.finalAmount, paidAmount: row.paidAmount
      };
    });
  }
}
