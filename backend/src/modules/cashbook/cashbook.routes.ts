import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { CashbookController } from './cashbook.controller';

export const cashbookRouter = Router();

cashbookRouter.use(authenticate, authorize('CASHIER', 'ADMIN'));
cashbookRouter.get('/settings', CashbookController.settings);
cashbookRouter.get('/accounts', CashbookController.accounts);
cashbookRouter.get('/categories', CashbookController.categories);
cashbookRouter.get('/parties', CashbookController.parties);
cashbookRouter.post('/parties', CashbookController.createParty);
cashbookRouter.get('/counterparties', CashbookController.counterparties);
cashbookRouter.get('/purchase-invoices', CashbookController.purchaseInvoices);

cashbookRouter.post('/activate', authorize('ADMIN'), CashbookController.activate);
cashbookRouter.post('/accounts', authorize('ADMIN'), CashbookController.createAccount);
cashbookRouter.patch('/accounts/:id', authorize('ADMIN'), CashbookController.updateAccount);
cashbookRouter.post('/categories', authorize('ADMIN'), CashbookController.createCategory);
cashbookRouter.patch('/categories/:id', authorize('ADMIN'), CashbookController.updateCategory);
