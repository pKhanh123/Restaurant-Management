export const CASHBOOK_MAX_VND_AMOUNT = 2_000_000_000;

export type CashbookAccountType = 'CASH' | 'BANK' | 'E_WALLET';
export type CashbookPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'E_WALLET';
export type CashbookDirection = 'RECEIPT' | 'PAYMENT';
export type CashbookActorRole = 'ADMIN' | 'CASHIER';

export function assertVndAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > CASHBOOK_MAX_VND_AMOUNT) {
    throw new Error(`Số tiền phải là số nguyên VND từ 1 đến ${CASHBOOK_MAX_VND_AMOUNT}`);
  }
  return value;
}

export function requiredAccountType(paymentMethod: CashbookPaymentMethod): CashbookAccountType {
  switch (paymentMethod) {
    case 'CASH': return 'CASH';
    case 'BANK_TRANSFER':
    case 'CREDIT_CARD': return 'BANK';
    case 'E_WALLET': return 'E_WALLET';
  }
}

export function signedAmount(direction: CashbookDirection, amount: number): number {
  const validAmount = assertVndAmount(amount);
  return direction === 'RECEIPT' ? validAmount : -validAmount;
}

export function amountReceivedAfterCredit(totalDue: number, appliedCredit: number): number {
  if (!Number.isSafeInteger(totalDue) || totalDue < 0 || !Number.isSafeInteger(appliedCredit) || appliedCredit < 0 || appliedCredit > totalDue) {
    throw new Error('Khoản tiền áp dụng không hợp lệ so với tổng hóa đơn');
  }
  return totalDue - appliedCredit;
}

export function sourceTransactionKey(sourceType: string, transactionId: number): string {
  if (!sourceType.trim() || !Number.isSafeInteger(transactionId) || transactionId <= 0) {
    throw new Error('Nguồn tiền phải gắn với ID giao dịch hợp lệ');
  }
  return `${sourceType}:${transactionId}`;
}

export function manualSourceKey(actorId: number, clientRequestId: string): string {
  const stableRequestId = clientRequestId.trim();
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('Người tạo phiếu không hợp lệ');
  if (!stableRequestId || stableRequestId.length > 128) throw new Error('Idempotency key không hợp lệ');
  return `MANUAL:${actorId}:${stableRequestId}`;
}

export interface PostingTimePolicyInput {
  role: CashbookActorRole;
  occurredAt: Date;
  now: Date;
  activatedAt: Date;
  reason?: string;
}

export function assertPostingTimePolicy({ role, occurredAt, now, activatedAt, reason }: PostingTimePolicyInput): void {
  const occurred = occurredAt.getTime();
  const current = now.getTime();
  const activation = activatedAt.getTime();
  if (![occurred, current, activation].every(Number.isFinite)) throw new Error('Thời gian ghi sổ không hợp lệ');
  if (occurred < activation) throw new Error('Không thể ghi sổ trước ngày kích hoạt Sổ quỹ');
  if (occurred > current) throw new Error('Không thể ghi sổ trong tương lai');
  if (role === 'CASHIER' && occurred !== current) throw new Error('Thu ngân chỉ được ghi sổ theo thời gian máy chủ');
  if (role === 'ADMIN' && occurred < current && !reason?.trim()) throw new Error('Quản trị viên phải nêu lý do khi ghi lùi ngày');
}
