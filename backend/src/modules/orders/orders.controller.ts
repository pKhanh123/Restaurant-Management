import { Request, Response, NextFunction } from 'express';
import { OrdersService } from './orders.service';
import { createOrderSchema, payOrderSchema, updateOrderStatusSchema, voidOrderSchema } from './orders.schemas';

export class OrdersController {
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
      const userId = req.user?.id;

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

      const result = await OrdersService.payOrder(orderId, input, req.user ? { id: req.user.id, name: req.user.name } : undefined);

      res.status(200).json({
        data: {
          order: result.order
        }
      });
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

