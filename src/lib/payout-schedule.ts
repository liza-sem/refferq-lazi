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

const TERM_EXPLANATION: Record<PayoutFrequency, string> = {
  WEEKLY: '7 days after each approved sale',
  BIWEEKLY: '14 days after each approved sale',
  MONTHLY: '1 month after each approved sale',
  QUARTERLY: '3 months after each approved sale',
};

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

export function payoutTermExplanation(frequency: string | null | undefined): string {
  return TERM_EXPLANATION[normalizePayoutFrequency(frequency)];
}

/** UTC calendar day as “23 Aug”. */
export function formatPayoutWhen(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day} ${month}`;
}

export function payoutFrequencyPeriodMs(frequency: PayoutFrequency): number {
  return PERIOD_MS[frequency];
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(day, lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

/**
 * When this commission becomes payable: approvedAt + the partner’s term.
 * Weekly = +7 days, bi-weekly = +14 days, monthly = +1 calendar month, quarterly = +3 months.
 */
export function commissionDueAt(
  approvedAt: Date,
  frequency: PayoutFrequency,
): Date {
  switch (frequency) {
    case 'WEEKLY':
      return addUtcDays(approvedAt, 7);
    case 'BIWEEKLY':
      return addUtcDays(approvedAt, 14);
    case 'MONTHLY':
      return addUtcMonths(approvedAt, 1);
    case 'QUARTERLY':
      return addUtcMonths(approvedAt, 3);
  }
}

export function isCommissionDue(
  approvedAt: Date,
  frequency: PayoutFrequency,
  now = new Date(),
): boolean {
  return now.getTime() >= commissionDueAt(approvedAt, frequency).getTime();
}

export type UnpaidCommissionForPayout = {
  amountCents: number;
  approvedAt: Date | null;
  createdAt: Date;
};

/** Soonest due date among unpaid commissions, and the sum due on or before that date. */
export function nextPayoutFromCommissions(
  commissions: UnpaidCommissionForPayout[],
  frequency: PayoutFrequency,
): { nextPayoutAt: Date | null; nextPayoutCents: number } {
  if (commissions.length === 0) {
    return { nextPayoutAt: null, nextPayoutCents: 0 };
  }

  const dated = commissions.map((commission) => ({
    amountCents: commission.amountCents,
    dueAt: commissionDueAt(commission.approvedAt || commission.createdAt, frequency),
  }));

  let soonest = dated[0].dueAt;
  for (const row of dated) {
    if (row.dueAt < soonest) soonest = row.dueAt;
  }

  const nextPayoutCents = dated
    .filter((row) => row.dueAt.getTime() <= soonest.getTime())
    .reduce((sum, row) => sum + row.amountCents, 0);

  return { nextPayoutAt: soonest, nextPayoutCents };
}
