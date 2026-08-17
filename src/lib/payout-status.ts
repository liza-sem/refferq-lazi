/** PayPal Payouts item statuses that are still in flight (not paid, not failed). */
const PAYPAL_IN_FLIGHT = new Set([
  'PENDING',
  'PROCESSING',
  'UNCLAIMED',
  'ONHOLD',
  'BLOCKED',
]);

const PAYPAL_FAILED = new Set([
  'FAILED',
  'RETURNED',
  'REFUNDED',
  'REVERSED',
  'CANCELED',
  'CANCELLED',
  'DENIED',
]);

export type PaypalPayoutOutcome = 'paid' | 'in_flight' | 'failed';

export type HumanPayoutStatus = 'Unpaid' | 'Sent to PayPal' | 'Paid' | 'Failed' | 'Cancelled';

export const PAYPAL_CONFIRM_HINT =
  'PayPal usually confirms in minutes. Unclaimed can take longer.';

/** Prefer item transaction_status; batch SUCCESS can still leave an item UNCLAIMED. */
export function classifyPaypalStatus(
  batchStatus?: string | null,
  itemStatus?: string | null,
): PaypalPayoutOutcome {
  const item = (itemStatus || '').toUpperCase();
  const batch = (batchStatus || '').toUpperCase();

  if (item === 'SUCCESS') return 'paid';
  if (PAYPAL_FAILED.has(item) || PAYPAL_FAILED.has(batch)) return 'failed';
  if (item && PAYPAL_IN_FLIGHT.has(item)) return 'in_flight';
  if (batch === 'SUCCESS') return 'paid';
  return 'in_flight';
}

export function humanPayoutStatus(
  payoutStatus: string,
  _paypalStatus?: string | null,
): HumanPayoutStatus {
  if (payoutStatus === 'COMPLETED') return 'Paid';
  if (payoutStatus === 'CANCELED' || payoutStatus === 'CANCELLED') return 'Cancelled';
  if (payoutStatus === 'FAILED') return 'Failed';
  if (payoutStatus === 'PROCESSING') return 'Sent to PayPal';
  if (payoutStatus === 'PENDING') return 'Unpaid';
  return 'Sent to PayPal';
}
