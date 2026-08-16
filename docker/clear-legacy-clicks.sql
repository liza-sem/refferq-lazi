-- One-time: old clicks have no affiliate_id, which blocks the schema push.
-- Safe after the column exists (the WHERE is false, so nothing is deleted).
DELETE FROM referral_clicks
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'referral_clicks'
    AND column_name = 'affiliate_id'
);
