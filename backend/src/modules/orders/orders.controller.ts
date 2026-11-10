import { Request, Response, NextFunction } from 'express';
import { OrdersService } from './orders.service';
import {
  confirmOrderPaymentSchema,
  authorizeReservationOrderPayLaterSchema,
  createOrderSchema,
  payOrderSchema,
  rejectOrderPaymentSchema,
  reservationOrderPaymentDeclarationSchema,
  updateOrderStatusSchema,
  voidOrderSchema
} from './orders.schemas';
import { ApiError } from '../../lib/api-error';

export class OrdersController {
  static async getReservationPaymentConfirmations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const confirmations = await OrdersService.getReservationPaymentConfirmations();
      res.status(200).json({ data: confirmations });
    } catch (error) {
      next(error);
    }
  }

  static async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const statusParam = req.query.status as string | undefined;
      const statusList = statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const orders = await OrdersService.getOrders(statusList ? { status: statusList } : undefined);
      res.status(200).json({ data: orders });
    } catch (error) {
      next(error);
    }
  }

  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createOrderSchema.parse(req.body);
      const createdByUserId = req.user?.id;
      if (input.payLaterOverride && (!req.user || !['CASHIER', 'ADMIN'].includes(req.user.role))) {
        throw ApiError.forbidden('Chỉ thu ngân hoặc quản trị viên được cho phép order trả sau');
      }
      if (input.orderType === 'DELIVERY' && (!req.user || !['CASHIER', 'ADMIN'].includes(req.user.role))) {
        throw ApiError.forbidden('Chỉ thu ngân hoặc quản trị viên được tạo đơn giao hàng');
      }

      const result = await OrdersService.createOrder(input, createdByUserId);

      res.status(result.isDuplicate ? 200 : 201).json({
        data: {
          order: result.order
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id, 10);
      const input = updateOrderStatusSchema.parse(req.body);
      const userId = req.user!.id;

      const order = await OrdersService.updateOrderStatus(orderId, input.status, userId);
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  }

  static async payOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id, 10);
      const input = payOrderSchema.parse(req.body);

      const result = await OrdersService.payOrder(orderId, input, req.user?.id, req.user?.name, req.user?.role === 'ADMIN' ? 'ADMIN' : 'CASHIER');

      res.status(200).json({
        data: {
          order: result.order
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async declareReservationOrderPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = reservationOrderPaymentDeclarationSchema.parse(req.body);
      const result = await OrdersService.declareReservationOrderPayment(parseInt(req.params.id, 10), input);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  static async confirmReservationOrderPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = confirmOrderPaymentSchema.parse(req.body);
      const order = await OrdersService.confirmReservationOrderPayment(parseInt(req.params.id, 10), input, req.user!.id, req.user!.name, req.user!.role === 'ADMIN' ? 'ADMIN' : 'CASHIER');
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  }

  static async rejectReservationOrderPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = rejectOrderPaymentSchema.parse(req.body);
      const order = await OrdersService.rejectReservationOrderPayment(parseInt(req.params.id, 10), input, req.user!.id, req.user!.name);
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  }

  static async authorizeReservationOrderPayLater(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = authorizeReservationOrderPayLaterSchema.parse(req.body);
      const order = await OrdersService.authorizeReservationOrderPayLater(parseInt(req.params.id, 10), input, req.user!.id, req.user!.name);
      res.status(200).json({ data: order });
    } catch (error) {
      next(error);
    }
  }

  static async voidOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id, 10);
      const input = voidOrderSchema.parse(req.body);
      const voidedByUserId = req.user?.id;
      const voidedByName = req.user?.name;

      const result = await OrdersService.voidOrder(orderId, input, voidedByUserId, voidedByName);

      res.status(200).json({
        data: {
          order: result.order
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async autoCancelExpired(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const timeoutMinutes = req.query.timeoutMinutes ? parseInt(req.query.timeoutMinutes as string, 10) : 60;
      const result = await OrdersService.autoCancelExpiredOrders(timeoutMinutes);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

