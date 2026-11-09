ALTER TABLE "affiliates" ADD COLUMN "pinit_reward_mode" TEXT NOT NULL DEFAULT 'cash';
CREATE TABLE "pinit_referral_events" (
 "id" TEXT PRIMARY KEY, "affiliate_id" TEXT NOT NULL REFERENCES "affiliates"("id") ON DELETE CASCADE,
 "referred_studio_id" TEXT NOT NULL, "event_type" TEXT NOT NULL CHECK ("event_type" IN ('signup','reward','revoke')),
 "reward_type" TEXT NOT NULL CHECK ("reward_type" IN ('free','cash')), "occurred_at" TIMESTAMP(3) NOT NULL,
 "digest" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pinit_referral_events_affiliate_id_occurred_at_idx" ON "pinit_referral_events"("affiliate_id", "occurred_at");
