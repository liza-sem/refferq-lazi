import assert from 'node:assert/strict';
import {
  LAST_DAY_OF_MONTH,
  commissionDueAt,
  isCommissionDue,
  nextPaydayOnOrAfter,
  payoutCycleWindow,
  nextPayoutFromCommissions,
  perSaleDueAt,
} from './payout-schedule';

const payday15 = { weekday: 1, dayOfMonth: 15 };
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// Mass + monthly + 15th → next 15th on or after the sale becoming eligible
assert.equal(
  commissionDueAt(utc(2026, 0, 10), 'MONTHLY', payday15, 'MASS').toISOString(),
  utc(2026, 0, 15).toISOString(),
);
assert.equal(
  commissionDueAt(utc(2026, 0, 20), 'MONTHLY', payday15, 'MASS').toISOString(),
  utc(2026, 1, 15).toISOString(),
);
assert.equal(
  isCommissionDue(utc(2026, 0, 10), 'MONTHLY', payday15, 'MASS', utc(2026, 0, 15)),
  true,
);
assert.equal(
  isCommissionDue(utc(2026, 0, 20), 'MONTHLY', payday15, 'MASS', utc(2026, 0, 15)),
  false,
);

// Per sale + weekly + hold 0 → 7 days after the sale
assert.equal(
  perSaleDueAt(utc(2026, 0, 10), 'WEEKLY').toISOString(),
  utc(2026, 0, 17).toISOString(),
);
assert.equal(
  commissionDueAt(utc(2026, 0, 10), 'WEEKLY', payday15, 'PER_SALE').toISOString(),
  utc(2026, 0, 17).toISOString(),
);
assert.equal(
  isCommissionDue(utc(2026, 0, 10), 'WEEKLY', payday15, 'PER_SALE', utc(2026, 0, 16)),
  false,
);
assert.equal(
  isCommissionDue(utc(2026, 0, 10), 'WEEKLY', payday15, 'PER_SALE', utc(2026, 0, 17)),
  true,
);

// Hold > 0 → cadence starts at maturesAt, not the sale
assert.equal(
  perSaleDueAt(utc(2026, 1, 9), 'WEEKLY').toISOString(),
  utc(2026, 1, 16).toISOString(),
);

// Last day of month
assert.equal(
  nextPaydayOnOrAfter(utc(2026, 1, 1), 'MONTHLY', { weekday: 1, dayOfMonth: LAST_DAY_OF_MONTH }).toISOString(),
  utc(2026, 1, 28).toISOString(),
);

const next = nextPayoutFromCommissions(
  [{ amountCents: 5400, approvedAt: utc(2026, 0, 10), createdAt: utc(2026, 0, 10), maturesAt: utc(2026, 0, 10) }],
  'MONTHLY',
  payday15,
  utc(2026, 0, 12),
  null,
  'MASS',
);
assert.equal(next.nextPayoutAt?.toISOString(), utc(2026, 0, 15).toISOString());
assert.equal(next.nextPayoutCents, 5400);

const cycleOnPayday = payoutCycleWindow(utc(2026, 7, 15), 'MONTHLY', payday15);
assert.equal(cycleOnPayday.start.toISOString(), utc(2026, 7, 15).toISOString());
assert.equal(cycleOnPayday.end.toISOString(), utc(2026, 8, 15).toISOString());
const cycleAfterPayday = payoutCycleWindow(utc(2026, 7, 20), 'MONTHLY', payday15);
assert.equal(cycleAfterPayday.start.toISOString(), utc(2026, 7, 15).toISOString());
assert.equal(cycleAfterPayday.end.toISOString(), utc(2026, 8, 15).toISOString());

console.log('payout-schedule.self-check ok');
