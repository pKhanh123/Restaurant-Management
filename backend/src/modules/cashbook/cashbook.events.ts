import { emitToAll } from '../../lib/socket';

export type CashbookChangedPayload = {
  voucherIds: number[];
  reason: 'VOUCHER_POSTED' | 'VOUCHER_CANCELLED' | 'SOURCE_POSTED' | 'SOURCE_REVERSED';
  updatedAt: string;
};

export function emitCashbookChanged(payload: CashbookChangedPayload) {
  if (!payload.voucherIds.length) return;
  emitToAll('cashbook:changed', {
    ...payload,
    voucherIds: [...new Set(payload.voucherIds)].sort((left, right) => left - right)
  });
}
