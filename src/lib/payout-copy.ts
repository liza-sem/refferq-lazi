import { formatMoney } from '@/lib/money';
import { formatPayoutWhen, payoutTermExplanation } from '@/lib/payout-schedule';
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

export function payoutScheduleLine(frequency: string | null | undefined): string {
  return payoutTermExplanation(frequency);
}
