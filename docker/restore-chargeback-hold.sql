-- Idempotent: restore the 30-day chargeback hold after the hold-0 experiment.
-- Does not re-zero hold. Does not touch PAID or commissions already in a payout.
-- Sales older than 30 days stay APPROVED.

UPDATE program_settings
SET commission_hold_days = 30
WHERE commission_hold_days = 0;

UPDATE program_settings
SET payout_frequency = 'MONTHLY'
WHERE payout_frequency IS DISTINCT FROM 'MONTHLY';

UPDATE programs
SET payout_frequency = 'MONTHLY'
WHERE is_default = true
  AND payout_frequency IS DISTINCT FROM 'MONTHLY';

UPDATE partner_groups
SET payout_frequency = 'MONTHLY'
WHERE is_default = true
  AND payout_frequency IS NOT NULL
  AND payout_frequency IS DISTINCT FROM 'MONTHLY';

WITH to_hold AS (
  SELECT
    c.id,
    c.affiliate_id,
    c.amount_cents,
    COALESCE(conv.created_at, c.created_at) AS sale_at
  FROM commissions c
  JOIN conversions conv ON conv.id = c.conversion_id
  WHERE c.status = 'APPROVED'
    AND c.payout_id IS NULL
    AND COALESCE(conv.created_at, c.created_at) > NOW() - INTERVAL '30 days'
),
debited AS (
  UPDATE affiliates AS a
  SET balance_cents = a.balance_cents - s.total_cents
  FROM (
    SELECT affiliate_id, SUM(amount_cents)::int AS total_cents
    FROM to_hold
    GROUP BY affiliate_id
  ) AS s
  WHERE a.id = s.affiliate_id
  RETURNING a.id
)
UPDATE commissions AS c
SET
  status = 'PENDING',
  matures_at = to_hold.sale_at + INTERVAL '30 days',
  approved_at = NULL,
  approved_by = NULL
FROM to_hold
WHERE c.id = to_hold.id
  AND c.status = 'APPROVED'
  AND c.payout_id IS NULL
  AND (SELECT COUNT(*) FROM debited) >= 0;
