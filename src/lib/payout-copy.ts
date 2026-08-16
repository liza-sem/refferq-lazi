import { formatMoney } from '@/lib/money';
import { formatPayoutWhen, payoutTermExplanation, type PayoutPayday } from '@/lib/payout-schedule';
import { PAYPAL_CONFIRM_HINT } from '@/lib/payout-status';

export { PAYPAL_CONFIRM_HINT };

/** Amount + day for the next automatic pay, or a quiet empty state. */
export function nextPayoutAmountLabel(
  cents: number,
  nextAt: string | Date | null | undefined,
  symbol = '$',
): string {
  if (!cents) return 'Nothing waiting.';
  const when = formatPayoutWhen(nextAt);
  const amount = formatMoney(cents, symbol);
  return when ? `${amount} on ${when}` : amount;
}

export function nextPayoutHint(
  cents: number,
  nextAt: string | Date | null | undefined,
): string | undefined {
  if (!cents) return undefined;
  const when = formatPayoutWhen(nextAt);
  return when ? `Pays ${when}` : undefined;
}

export function inPayoutHint(cents: number, symbol = '$'): string | undefined {
  if (!cents) return undefined;
  return `${formatMoney(cents, symbol)} sent, waiting on PayPal`;
}

export function payoutScheduleLine(
  frequency: string | null | undefined,
  payday?: PayoutPayday | null,
): string {
  return payoutTermExplanation(frequency, payday);
}

/** Chargeback hold date, e.g. “Held until 15 Sep”. Not the payout term. */
export function formatHoldUntil(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `Held until ${day} ${month}`;
}

export function payMeNowCopy(holdDays = 30): string {
  const days = holdDays > 0 ? holdDays : 30;
  return `Available after ${days} days. Monthly payout on your day, or Pay me now once a sale has matured.`;
}
