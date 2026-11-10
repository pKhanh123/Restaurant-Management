import type { CashVoucher } from '@prisma/client';

export interface CashbookChangedEvent {
  accountIds: number[];
  voucherId: number;
  reason: 'created' | 'auto-posted' | 'reversed';
  updatedAt: string;
}

export function cashbookChangedEvent(voucher: Pick<CashVoucher, 'id' | 'accountId' | 'sourceType' | 'reversalOfId'>, now = new Date()): CashbookChangedEvent {
  return {
    accountIds: [voucher.accountId],
    voucherId: voucher.id,
    reason: voucher.reversalOfId !== null ? 'reversed' : voucher.sourceType === 'MANUAL' ? 'created' : 'auto-posted',
    updatedAt: now.toISOString()
  };
}
