/** Partner groups store rates as either 20 (percent) or 0.20 (fraction). */

export function commissionMultiplier(rate: number | null | undefined): number {
  if (rate == null || Number.isNaN(rate) || rate <= 0) return 0.2;
  return rate > 1 ? rate / 100 : rate;
}

export function commissionPercent(rate: number | null | undefined): number {
  return Math.round(commissionMultiplier(rate) * 10000) / 100;
}

export function parseCommissionPercent(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const percent = n <= 1 ? n * 100 : n;
  if (percent > 100) return null;
  return percent;
}
