/** Kirby and the public tracker send `amount` in cents (e.g. 3400 = $34). */
export function dollarsToCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value * 100));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed * 100));
  }
  return 0;
}

export function centsToDollarInput(cents: number | null | undefined): string {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return (n / 100).toFixed(2);
}

export function formatMoney(cents: number | null | undefined, symbol = '$'): string {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return `${symbol}${(n / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function toAmountCents(amount?: unknown, amountCents?: unknown): number {
  if (typeof amountCents === 'number' && Number.isFinite(amountCents) && amountCents >= 0) {
    return Math.round(amountCents);
  }
  if (typeof amountCents === 'string' && amountCents.trim() !== '') {
    const parsed = Number(amountCents);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }

  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;

  return Math.round(value);
}

export function isClickPlaceholderEmail(email?: string | null): boolean {
  return typeof email === 'string' && email.endsWith('@tracking.internal');
}
