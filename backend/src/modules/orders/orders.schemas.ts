import { z } from 'zod';

export const selectedModifierSchema = z.object({
  modifierGroupId: z.number(),
  optionId: z.number()
});

export const orderItemCreateSchema = z.object({
  menuItemId: z.number({ required_error: 'menuItemId là bắt buộc' }),
  quantity: z.number().int().min(1, 'Số lượng tối thiểu là 1'),
  selectedModifiers: z.array(selectedModifierSchema).optional().default([]),
  notes: z.string().max(120).optional()
});

export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKE_AWAY']).default('DINE_IN'),
  tableId: z.number().optional(),
  qrCodeToken: z.string().trim().min(1, 'Mã QR bàn là bắt buộc khi khách tự gọi món').optional(),
  buzzerNumber: z.number().optional(),
  idempotencyKey: z.string().optional(),
  notes: z.string().max(200).optional(),
  items: z.array(orderItemCreateSchema).min(1, 'Đơn hàng phải chứa ít nhất 1 món')
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET'], {
    required_error: 'Phương thức thanh toán là bắt buộc (CASH | BANK_TRANSFER | CREDIT_CARD | E_WALLET)'
  }),
  financialAccountId: z.number().int().positive().optional()
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'COMPLETED'], {
    required_error: 'Trạng thái là bắt buộc (PREPARING | READY | COMPLETED)'
  })
});

export const getOrdersQuerySchema = z.object({
  status: z.string().optional()
});

export const voidOrderSchema = z.object({
  reason: z.string({ required_error: 'Lý do hủy đơn là bắt buộc' }).trim().min(3, 'Lý do hủy phải có ít nhất 3 ký tự')
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type PayOrderInput = z.infer<typeof payOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type GetOrdersQueryInput = z.infer<typeof getOrdersQuerySchema>;
export type VoidOrderInput = z.infer<typeof voidOrderSchema>;


