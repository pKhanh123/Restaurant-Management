import { z } from 'zod';

export const selectedModifierSchema = z.object({
  modifierGroupId: z.number(),
  optionId: z.number()
});

export const orderItemCreateSchema = z.object({
  menuItemId: z.number({ required_error: 'menuItemId là bắt buộc' }),
  quantity: z.number().int().min(1, 'Số lượng tối thiểu là 1'),
  commissionEmployeeId: z.number().int().positive().nullable().optional(),
  selectedModifiers: z.array(selectedModifierSchema).optional().default([]),
  notes: z.string().max(120).optional()
});

export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']).default('DINE_IN'),
  tableId: z.number().optional(),
  customerId: z.number().int().positive().optional(),
  payLaterOverride: z.boolean().optional(),
  payLaterReason: z.string().trim().min(3).max(500).optional(),
  qrCodeToken: z.string().trim().min(1, 'Mã QR bàn là bắt buộc khi khách tự gọi món').optional(),
  reservationAccessToken: z.string().trim().min(32).max(96).optional(),
  buzzerNumber: z.number().optional(),
  deliveryPartnerId: z.number().int().positive().optional(),
  deliveryAddress: z.string().trim().min(3, 'Địa chỉ giao hàng phải có ít nhất 3 ký tự').max(255).optional(),
  deliveryFee: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  idempotencyKey: z.string().optional(),
  voucherCode: z.string().trim().optional(),
  notes: z.string().max(200).optional(),
  items: z.array(orderItemCreateSchema).min(1, 'Đơn hàng phải chứa ít nhất 1 món')
}).superRefine((value, context) => {
  if (value.payLaterOverride && !value.customerId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerId'], message: 'Cho phép trả sau cần chọn khách hàng' });
  if (value.payLaterOverride && !value.payLaterReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['payLaterReason'], message: 'Cho phép trả sau cần ghi lý do' });
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET'], {
    required_error: 'Phương thức thanh toán là bắt buộc'
  }),
  financialAccountId: z.number().int().positive().nullable().optional()
});

export const reservationOrderPaymentDeclarationSchema = z.object({
  reservationAccessToken: z.string().trim().min(32).max(96)
});

export const confirmOrderPaymentSchema = z.object({
  amount: z.number().int().positive(),
  financialAccountId: z.number().int().positive().nullable().optional(),
  externalReference: z.string().trim().min(1).max(120)
});

export const rejectOrderPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const authorizeReservationOrderPayLaterSchema = z.object({
  reason: z.string().trim().min(3).max(500)
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
export type ReservationOrderPaymentDeclarationInput = z.infer<typeof reservationOrderPaymentDeclarationSchema>;
export type ConfirmOrderPaymentInput = z.infer<typeof confirmOrderPaymentSchema>;
export type RejectOrderPaymentInput = z.infer<typeof rejectOrderPaymentSchema>;
export type AuthorizeReservationOrderPayLaterInput = z.infer<typeof authorizeReservationOrderPayLaterSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type GetOrdersQueryInput = z.infer<typeof getOrdersQuerySchema>;
export type VoidOrderInput = z.infer<typeof voidOrderSchema>;


