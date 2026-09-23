import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const code = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, gạch ngang và gạch dưới');
const openingBalance = z.number().int().min(0).max(2_000_000_000);

const accountBase = {
  code: code.optional(),
  name: z.string().trim().min(1).max(150),
  openingBalance: openingBalance.optional().default(0),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true)
};

export const financialAccountSchema = z.discriminatedUnion('type', [
  z.object({
    ...accountBase,
    type: z.literal('CASH'),
    bankName: z.null().optional(),
    accountNumber: z.null().optional(),
    walletProvider: z.null().optional(),
    walletIdentifier: z.null().optional()
  }),
  z.object({
    ...accountBase,
    type: z.literal('BANK'),
    bankName: z.string().trim().min(1).max(150),
    accountNumber: z.string().trim().min(1).max(100),
    walletProvider: z.null().optional(),
    walletIdentifier: z.null().optional()
  }),
  z.object({
    ...accountBase,
    type: z.literal('E_WALLET'),
    bankName: z.null().optional(),
    accountNumber: z.null().optional(),
    walletProvider: z.string().trim().min(1).max(150),
    walletIdentifier: z.string().trim().min(1).max(100)
  })
]);

export const financialAccountUpdateSchema = z.object({
  code: code.optional(),
  name: z.string().trim().min(1).max(150).optional(),
  openingBalance: openingBalance.optional(),
  bankName: optionalText(150),
  accountNumber: optionalText(100),
  walletProvider: optionalText(150),
  walletIdentifier: optionalText(100),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
}).strict();

export const activateCashbookSchema = z.object({
  activatedAt: z.string().datetime({ offset: true }).transform(value => new Date(value)),
  accounts: z.array(z.object({ id: z.number().int().positive(), openingBalance })).min(1)
});

export const categoryCreateSchema = z.object({
  code: code.optional(),
  name: z.string().trim().min(1).max(150),
  direction: z.enum(['RECEIPT', 'PAYMENT']),
  affectsBusinessResultDefault: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true)
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  affectsBusinessResultDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
}).strict();

export const partySchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: optionalText(30),
  note: optionalText(1000)
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default('')
});

export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;
export type FinancialAccountUpdate = z.infer<typeof financialAccountUpdateSchema>;
export type ActivateCashbookInput = z.infer<typeof activateCashbookSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type PartyInput = z.infer<typeof partySchema>;
