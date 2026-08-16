export const PAYOUT_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type PayoutFrequency = (typeof PAYOUT_FREQUENCIES)[number];

const PERIOD_MS: Record<PayoutFrequency, number> = {
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  BIWEEKLY: 14 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
  QUARTERLY: 90 * 24 * 60 * 60 * 1000,
};

export const PAYOUT_FREQUENCY_OPTIONS: Array<{ value: PayoutFrequency; label: string }> = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
];

export function normalizePayoutFrequency(value: string | null | undefined): PayoutFrequency {
  const raw = (value || '').trim().toUpperCase().replace(/[-_\s]/g, '');
  if (raw === 'WEEKLY') return 'WEEKLY';
  if (raw === 'BIWEEKLY' || raw === 'FORTNIGHTLY') return 'BIWEEKLY';
  if (raw === 'QUARTERLY') return 'QUARTERLY';
  return 'MONTHLY';
}

export function isPayoutFrequency(value: string | null | undefined): value is PayoutFrequency {
  const raw = (value || '').trim().toUpperCase();
  return (PAYOUT_FREQUENCIES as readonly string[]).includes(raw);
}

/** Null / blank / INHERIT means use the program default. Undefined means “field omitted”. */
export function parseTierPayoutFrequency(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'INHERIT') return null;
  const raw = String(value).trim().toUpperCase();
  if (!isPayoutFrequency(raw)) return null;
  return raw;
}

export function resolvePayoutFrequency(
  tierFrequency: string | null | undefined,
  programFrequency: string | null | undefined,
): PayoutFrequency {
  if (tierFrequency && tierFrequency !== 'INHERIT') {
    return normalizePayoutFrequency(tierFrequency);
  }
  return normalizePayoutFrequency(programFrequency);
}

export function payoutFrequencyLabel(frequency: string | null | undefined): string {
  const normalized = normalizePayoutFrequency(frequency);
  return PAYOUT_FREQUENCY_OPTIONS.find((option) => option.value === normalized)?.label || 'Monthly';
}

export function payoutFrequencyPeriodMs(frequency: PayoutFrequency): number {
  return PERIOD_MS[frequency];
}

/**
 * Calendar pay days, aligned with the existing scheduled-report cadence:
 * weekly = Monday, monthly = 1st, bi-weekly = 1st and 15th, quarterly = 1st of Jan/Apr/Jul/Oct.
 */
export function isCalendarPayoutDay(frequency: PayoutFrequency, now = new Date()): boolean {
  const day = now.getUTCDay();
  const date = now.getUTCDate();
  const month = now.getUTCMonth();
  switch (frequency) {
    case 'WEEKLY':
      return day === 1;
    case 'BIWEEKLY':
      return date === 1 || date === 15;
    case 'MONTHLY':
      return date === 1;
    case 'QUARTERLY':
      return date === 1 && month % 3 === 0;
    default:
      return false;
  }
}

export function isOnPayoutSchedule(input: {
  frequency: PayoutFrequency;
  lastPayoutAt: Date | null;
  oldestPayableAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (isCalendarPayoutDay(input.frequency, now)) return true;

  const period = payoutFrequencyPeriodMs(input.frequency);
  if (input.lastPayoutAt && now.getTime() - input.lastPayoutAt.getTime() >= period) {
    return true;
  }
  if (!input.lastPayoutAt && input.oldestPayableAt && now.getTime() - input.oldestPayableAt.getTime() >= period) {
    return true;
  }
  return false;
}
