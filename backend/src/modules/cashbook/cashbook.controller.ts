import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import {
  activateCashbookSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  financialAccountSchema,
  financialAccountUpdateSchema,
  partySchema,
  searchQuerySchema
} from './cashbook.schemas';
import { CashbookSettingsService } from './cashbook-settings.service';

function actor(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, name: req.user.name };
}

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw ApiError.badRequest('ID không hợp lệ');
  return parsed;
}

export class CashbookController {
  static async settings(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.getSettings() }); } catch (error) { next(error); } }
  static async activate(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.activate(activateCashbookSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async accounts(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.listAccounts() }); } catch (error) { next(error); } }
  static async createAccount(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await CashbookSettingsService.saveAccount(null, financialAccountSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async updateAccount(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.saveAccount(id(req.params.id), financialAccountUpdateSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async categories(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.listCategories() }); } catch (error) { next(error); } }
  static async createCategory(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await CashbookSettingsService.saveCategory(null, categoryCreateSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async updateCategory(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.saveCategory(id(req.params.id), categoryUpdateSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async parties(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.listParties(searchQuerySchema.parse(req.query).q) }); } catch (error) { next(error); } }
  static async createParty(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await CashbookSettingsService.createParty(partySchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async counterparties(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.searchCounterparties(searchQuerySchema.parse(req.query).q) }); } catch (error) { next(error); } }
  static async purchaseInvoices(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookSettingsService.listPurchaseInvoices(searchQuerySchema.parse(req.query).q) }); } catch (error) { next(error); } }
}
