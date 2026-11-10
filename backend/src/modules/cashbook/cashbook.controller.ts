import type { NextFunction, Request, Response } from 'express';
import { CashbookService } from './cashbook.service';
import { CashbookSettingsService } from './cashbook-settings.service';
import {
  parseCancelVoucherInput, parseCashbookAccountCreateInput, parseCashbookAccountUpdateInput,
  parseCashbookActivationInput, parseCashbookCategoryCreateInput, parseCashbookCategoryUpdateInput,
  parseCashbookExportQuery, parseCashbookListQuery, parseCashbookPartyInput, parseCashbookRouteId,
  parseCashbookSearchQuery, parseManualVoucherInput
} from './cashbook.schemas';

function actor(req: Request) {
  const user = req.user!;
  return { id: user.id, name: user.name, role: user.role === 'ADMIN' ? 'ADMIN' as const : 'CASHIER' as const };
}

export class CashbookController {
  static async settings(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookSettingsService.workspace(_req.user?.role === 'ADMIN') }); }
    catch (error) { next(error); }
  }

  static async createAccount(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await CashbookSettingsService.createAccount(parseCashbookAccountCreateInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async updateAccount(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookSettingsService.updateAccount(parseCashbookRouteId(req.params.id), parseCashbookAccountUpdateInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await CashbookSettingsService.createCategory(parseCashbookCategoryCreateInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookSettingsService.updateCategory(parseCashbookRouteId(req.params.id), parseCashbookCategoryUpdateInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async activate(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await CashbookSettingsService.activate(parseCashbookActivationInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async counterparties(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseCashbookSearchQuery(req.query);
      res.json({ data: await CashbookSettingsService.counterparties(query.search, query.page, query.pageSize) });
    } catch (error) { next(error); }
  }

  static async parties(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseCashbookSearchQuery(req.query);
      res.json({ data: await CashbookSettingsService.parties(query.search, query.page, query.pageSize) });
    } catch (error) { next(error); }
  }

  static async createParty(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await CashbookSettingsService.createParty(parseCashbookPartyInput(req.body), { id: req.user!.id, name: req.user!.name }) }); }
    catch (error) { next(error); }
  }

  static async purchaseInvoices(req: Request, res: Response, next: NextFunction) {
    try { const query = parseCashbookSearchQuery(req.query); res.json({ data: await CashbookSettingsService.purchaseInvoices(query.search) }); }
    catch (error) { next(error); }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookService.list(parseCashbookListQuery(req.query)) }); }
    catch (error) { next(error); }
  }

  static async getVoucher(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookService.getVoucher(parseCashbookRouteId(req.params.id)) }); }
    catch (error) { next(error); }
  }

  static async createManual(req: Request, res: Response, next: NextFunction) {
    try {
      const input = parseManualVoucherInput(req.body, req.get('Idempotency-Key'));
      res.status(201).json({ data: await CashbookService.createManual(input, actor(req)) });
    } catch (error) { next(error); }
  }

  static async cancelManual(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CashbookService.cancelManual(
        parseCashbookRouteId(req.params.id), parseCancelVoucherInput(req.body), actor(req)
      );
      res.json({ data: result });
    } catch (error) { next(error); }
  }

  static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseCashbookListQuery(req.query);
      const { format } = parseCashbookExportQuery({ format: req.query.format });
      const file = await CashbookService.export(query, format);
      res.type(file.contentType).attachment(file.filename).send(file.body);
    } catch (error) { next(error); }
  }

  static async print(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await CashbookService.getVoucher(parseCashbookRouteId(req.params.id)) }); }
    catch (error) { next(error); }
  }
}
