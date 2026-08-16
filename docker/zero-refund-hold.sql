-- Idempotent: set refund hold to 0 and release unpaid PENDING commissions
-- that were only waiting on the hold. Does not touch PAID / already-approved rows.
UPDATE program_settings
SET commission_hold_days = 0
WHERE commission_hold_days IS DISTINCT FROM 0;

WITH held AS (
  SELECT id, affiliate_id, amount_cents
  FROM commissions
  WHERE status = 'PENDING'
    AND payout_id IS NULL
),
bumped AS (
  UPDATE affiliates AS a
  SET balance_cents = a.balance_cents + s.total_cents
  FROM (
    SELECT affiliate_id, SUM(amount_cents)::int AS total_cents
    FROM held
    GROUP BY affiliate_id
  ) AS s
  WHERE a.id = s.affiliate_id
  RETURNING a.id
)
UPDATE commissions AS c
SET
  status = 'APPROVED',
  matures_at = NOW(),
  approved_at = COALESCE(c.approved_at, NOW()),
  approved_by = COALESCE(c.approved_by, 'system-zero-hold-backfill')
FROM held
WHERE c.id = held.id
  AND c.status = 'PENDING'
  AND c.payout_id IS NULL
  AND (SELECT COUNT(*) FROM bumped) >= 0;
