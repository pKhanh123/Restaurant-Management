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
import { CashbookService } from './cashbook.service';
import { serializeCashbookCsv, serializeCashbookWorkbook } from './cashbook.export';
import { voucherCancelSchema, voucherCreateSchema, voucherListQuerySchema } from './cashbook.schemas';

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
  static async vouchers(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookService.list(voucherListQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async createVoucher(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await CashbookService.createManual(voucherCreateSchema.parse(req.body), actor(req)) }); } catch (error) { next(error); } }
  static async voucherDetail(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookService.detail(id(req.params.id)) }); } catch (error) { next(error); } }
  static async voucherPrint(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookService.detail(id(req.params.id)) }); } catch (error) { next(error); } }
  static async cancelVoucher(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await CashbookService.cancel(id(req.params.id), voucherCancelSchema.parse(req.body).reason, actor(req)) }); } catch (error) { next(error); } }
  static async exportVouchers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = voucherListQuerySchema.parse(req.query);
      const rows = await CashbookService.exportRows(query);
      const format = query.format ?? 'xlsx';
      res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .attachment(`So_quy.${format}`)
        .send(format === 'csv' ? serializeCashbookCsv(rows) : serializeCashbookWorkbook(rows));
    } catch (error) { next(error); }
  }
}
