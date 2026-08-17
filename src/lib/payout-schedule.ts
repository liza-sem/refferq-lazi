export const PAYOUT_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type PayoutFrequency = (typeof PAYOUT_FREQUENCIES)[number];

export const PAYOUT_FREQUENCY_OPTIONS: Array<{ value: PayoutFrequency; label: string }> = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
];

/** JS getUTCDay(): 0 Sunday … 6 Saturday. Default weekday is Monday. */
export const DEFAULT_PAYOUT_WEEKDAY = 1;
/** Monthly/quarterly default: the 15th. */
export const DEFAULT_PAYOUT_DAY_OF_MONTH = 15;

export const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

/** 0 = last calendar day of the month (monthly / quarterly). */
export const LAST_DAY_OF_MONTH = 0;

export const DAY_OF_MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })),
  { value: LAST_DAY_OF_MONTH, label: 'Last' },
];

export const PAYOUT_TYPES = ['MASS', 'PER_SALE'] as const;
export type PayoutType = (typeof PAYOUT_TYPES)[number];

export const PAYOUT_TYPE_OPTIONS: Array<{ value: PayoutType; label: string; help: string }> = [
  {
    value: 'MASS',
    label: 'Mass payout',
    help: 'Everyone with eligible commissions is paid on the same calendar day.',
  },
  {
    value: 'PER_SALE',
    label: 'Per sale',
    help: 'Each commission pays on a cadence counted from when that sale became eligible.',
  },
];

export type PayoutPayday = {
  weekday: number;
  dayOfMonth: number;
};

export type PaydayFields = {
  payoutFrequency?: string | null;
  payoutWeekday?: number | null;
  payoutDayOfMonth?: number | null;
};

export function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function weekdayLabel(value: number | null | undefined): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === value)?.label || 'Monday';
}

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

export function normalizeWeekday(value: unknown, fallback = DEFAULT_PAYOUT_WEEKDAY): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(n) || n < 0 || n > 6) return fallback;
  return n;
}

export function normalizePayoutType(value: string | null | undefined): PayoutType {
  const raw = (value || '').trim().toUpperCase().replace(/[-_\s]/g, '');
  if (raw === 'PERSALE' || raw === 'ONSALE' || raw === 'ONSCHEDULE') return 'PER_SALE';
  return 'MASS';
}

export function isMassPayout(value: string | null | undefined): boolean {
  return normalizePayoutType(value) === 'MASS';
}

export function normalizeDayOfMonth(value: unknown, fallback = DEFAULT_PAYOUT_DAY_OF_MONTH): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (n === LAST_DAY_OF_MONTH) return LAST_DAY_OF_MONTH;
  if (!Number.isInteger(n) || n < 1 || n > 28) return fallback;
  return n;
}

export function parseOptionalWeekday(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'INHERIT') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

export function parseOptionalDayOfMonth(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'INHERIT') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (n === LAST_DAY_OF_MONTH) return LAST_DAY_OF_MONTH;
  if (!Number.isInteger(n) || n < 1 || n > 28) return null;
  return n;
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

function firstInt(
  values: Array<number | null | undefined>,
  fallback: number,
): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  return fallback;
}

export function resolvePayday(input: {
  tierWeekday?: number | null;
  tierDayOfMonth?: number | null;
  programWeekday?: number | null;
  programDayOfMonth?: number | null;
}): PayoutPayday {
  return {
    weekday: normalizeWeekday(
      firstInt([input.tierWeekday, input.programWeekday], DEFAULT_PAYOUT_WEEKDAY),
    ),
    dayOfMonth: normalizeDayOfMonth(
      firstInt([input.tierDayOfMonth, input.programDayOfMonth], DEFAULT_PAYOUT_DAY_OF_MONTH),
    ),
  };
}

export function resolvePayoutSchedule(
  tier: PaydayFields | null | undefined,
  program: PaydayFields | null | undefined,
  payoutType: string | null | undefined = 'MASS',
): { frequency: PayoutFrequency; payday: PayoutPayday; payoutType: PayoutType } {
  const type = normalizePayoutType(payoutType);
  if (type === 'MASS') {
    return {
      payoutType: type,
      frequency: normalizePayoutFrequency(program?.payoutFrequency),
      payday: resolvePayday({
        programWeekday: program?.payoutWeekday,
        programDayOfMonth: program?.payoutDayOfMonth,
      }),
    };
  }
  return {
    payoutType: type,
    frequency: resolvePayoutFrequency(tier?.payoutFrequency, program?.payoutFrequency),
    payday: resolvePayday({
      programWeekday: program?.payoutWeekday,
      programDayOfMonth: program?.payoutDayOfMonth,
    }),
  };
}

export function payoutFrequencyLabel(frequency: string | null | undefined): string {
  const normalized = normalizePayoutFrequency(frequency);
  return PAYOUT_FREQUENCY_OPTIONS.find((option) => option.value === normalized)?.label || 'Monthly';
}

export function paydayNeedsWeekday(frequency: string | null | undefined): boolean {
  return normalizePayoutFrequency(frequency) === 'WEEKLY';
}

export function paydayNeedsDayOfMonth(frequency: string | null | undefined): boolean {
  const normalized = normalizePayoutFrequency(frequency);
  return normalized === 'MONTHLY' || normalized === 'QUARTERLY';
}

function dayOfMonthLabel(day: number): string {
  if (day === LAST_DAY_OF_MONTH) return 'last day';
  return ordinal(day);
}

export function payoutTermExplanation(
  frequency: string | null | undefined,
  payday?: PayoutPayday | null,
  payoutType: string | null | undefined = 'MASS',
): string {
  const normalized = normalizePayoutFrequency(frequency);
  if (normalizePayoutType(payoutType) === 'PER_SALE') {
    switch (normalized) {
      case 'WEEKLY':
        return 'Pays 7 days after each sale becomes eligible';
      case 'BIWEEKLY':
        return 'Pays 14 days after each sale becomes eligible';
      case 'MONTHLY':
        return 'Pays 1 month after each sale becomes eligible';
      case 'QUARTERLY':
        return 'Pays 3 months after each sale becomes eligible';
    }
  }
  const day = payday || { weekday: DEFAULT_PAYOUT_WEEKDAY, dayOfMonth: DEFAULT_PAYOUT_DAY_OF_MONTH };
  switch (normalized) {
    case 'WEEKLY':
      return `Pays every ${weekdayLabel(day.weekday)}`;
    case 'BIWEEKLY':
      return 'Pays on the 1st and 15th';
    case 'MONTHLY':
      return `Pays on the ${dayOfMonthLabel(day.dayOfMonth)} of each month`;
    case 'QUARTERLY':
      return `Pays on the ${dayOfMonthLabel(day.dayOfMonth)} of January, April, July, and October`;
  }
}

/** UTC calendar day as “15 Sep”. */
export function formatPayoutWhen(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day} ${month}`;
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}

function monthDay(year: number, month: number, dayOfMonth: number): Date {
  if (dayOfMonth === LAST_DAY_OF_MONTH) {
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return new Date(Date.UTC(year, month, dayOfMonth));
}

/** Next occurrence of this payday on or after `from` (UTC calendar). */
export function nextPaydayOnOrAfter(
  from: Date,
  frequency: PayoutFrequency,
  payday: PayoutPayday,
): Date {
  const start = utcDay(from);
  switch (frequency) {
    case 'WEEKLY': {
      const current = start.getUTCDay();
      const delta = (payday.weekday - current + 7) % 7;
      return addUtcDays(start, delta);
    }
    case 'BIWEEKLY': {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth();
      const day = start.getUTCDate();
      if (day <= 1) return new Date(Date.UTC(year, month, 1));
      if (day <= 15) return new Date(Date.UTC(year, month, 15));
      return new Date(Date.UTC(year, month + 1, 1));
    }
    case 'MONTHLY': {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth();
      const thisMonth = monthDay(year, month, payday.dayOfMonth);
      if (start.getTime() <= thisMonth.getTime()) return thisMonth;
      return monthDay(year, month + 1, payday.dayOfMonth);
    }
    case 'QUARTERLY': {
      const year = start.getUTCFullYear();
      const quarterMonths = [0, 3, 6, 9];
      for (const quarterMonth of quarterMonths) {
        const candidate = monthDay(year, quarterMonth, payday.dayOfMonth);
        if (candidate.getTime() >= start.getTime()) return candidate;
      }
      return monthDay(year + 1, 0, payday.dayOfMonth);
    }
  }
}

/** Current mass-payout cycle: last payday on or before `from`, through the next payday. */
export function payoutCycleWindow(
  from: Date,
  frequency: PayoutFrequency,
  payday: PayoutPayday,
): { start: Date; end: Date } {
  const startDay = utcDay(from);
  const next = nextPaydayOnOrAfter(startDay, frequency, payday);
  if (next.getTime() === startDay.getTime()) {
    return {
      start: next,
      end: nextPaydayOnOrAfter(addUtcDays(next, 1), frequency, payday),
    };
  }
  switch (frequency) {
    case 'WEEKLY':
      return { start: addUtcDays(next, -7), end: next };
    case 'BIWEEKLY': {
      const start = next.getUTCDate() === 15
        ? new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 1))
        : new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() - 1, 15));
      return { start, end: next };
    }
    case 'MONTHLY':
      return {
        start: monthDay(next.getUTCFullYear(), next.getUTCMonth() - 1, payday.dayOfMonth),
        end: next,
      };
    case 'QUARTERLY':
      return {
        start: monthDay(next.getUTCFullYear(), next.getUTCMonth() - 3, payday.dayOfMonth),
        end: next,
      };
  }
}

export function perSaleDueAt(eligibleAt: Date, frequency: PayoutFrequency): Date {
  const start = utcDay(eligibleAt);
  switch (frequency) {
    case 'WEEKLY':
      return addUtcDays(start, 7);
    case 'BIWEEKLY':
      return addUtcDays(start, 14);
    case 'MONTHLY':
      return addUtcMonths(start, 1);
    case 'QUARTERLY':
      return addUtcMonths(start, 3);
  }
}

export function commissionEligibleAt(row: {
  maturesAt?: Date | null;
  approvedAt?: Date | null;
  createdAt: Date;
}): Date {
  return row.maturesAt || row.approvedAt || row.createdAt;
}

/** When this commission becomes payable under the current payout type. */
export function commissionDueAt(
  eligibleAt: Date,
  frequency: PayoutFrequency,
  payday: PayoutPayday,
  payoutType: string | null | undefined = 'MASS',
): Date {
  if (normalizePayoutType(payoutType) === 'PER_SALE') {
    return perSaleDueAt(eligibleAt, frequency);
  }
  return nextPaydayOnOrAfter(eligibleAt, frequency, payday);
}

export function isCommissionDue(
  eligibleAt: Date,
  frequency: PayoutFrequency,
  payday: PayoutPayday,
  payoutType: string | null | undefined = 'MASS',
  now = new Date(),
  lastRun: Date | null = null,
): boolean {
  const dueAt = commissionDueAt(eligibleAt, frequency, payday, payoutType);
  const today = utcDay(now);
  if (dueAt.getTime() < today.getTime()) return true;
  if (dueAt.getTime() > today.getTime()) return false;
  if (
    lastRun
    && utcDay(lastRun).getTime() === today.getTime()
    && eligibleAt.getTime() >= lastRun.getTime()
  ) {
    return false;
  }
  return true;
}

export type UnpaidCommissionForPayout = {
  amountCents: number;
  approvedAt: Date | null;
  createdAt: Date;
  maturesAt?: Date | null;
};

export function nextPayoutFromCommissions(
  commissions: UnpaidCommissionForPayout[],
  frequency: PayoutFrequency,
  payday: PayoutPayday,
  now = new Date(),
  lastRun: Date | null = null,
  payoutType: string | null | undefined = 'MASS',
): { nextPayoutAt: Date | null; nextPayoutCents: number } {
  const type = normalizePayoutType(payoutType);
  const today = utcDay(now);
  const lastRunToday = Boolean(lastRun && utcDay(lastRun).getTime() === today.getTime());

  if (type === 'PER_SALE') {
    if (commissions.length === 0) {
      return { nextPayoutAt: null, nextPayoutCents: 0 };
    }
    const nextPayoutCents = commissions.reduce((sum, row) => sum + row.amountCents, 0);
    let earliest: Date | null = null;
    for (const row of commissions) {
      const due = perSaleDueAt(commissionEligibleAt(row), frequency);
      if (!earliest || due.getTime() < earliest.getTime()) earliest = due;
    }
    if (!earliest) return { nextPayoutAt: null, nextPayoutCents };
    if (earliest.getTime() < today.getTime() || (earliest.getTime() === today.getTime() && lastRunToday)) {
      return { nextPayoutAt: lastRunToday ? addUtcDays(today, 1) : today, nextPayoutCents };
    }
    return { nextPayoutAt: earliest, nextPayoutCents };
  }

  const from = lastRunToday ? addUtcDays(today, 1) : now;
  const nextPayoutAt = nextPaydayOnOrAfter(from, frequency, payday);
  const nextPayoutCents = commissions.reduce((sum, row) => sum + row.amountCents, 0);
  return { nextPayoutAt, nextPayoutCents };
}
