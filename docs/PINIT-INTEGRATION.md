# Pinit server integration

POST `/api/integrations/pinit/{affiliate,stats,conversion,refund}` with `x-api-key` using an active, unexpired key with the `admin` scope from admin. Public tracking and read/write keys are rejected; keep this key server-only. These endpoints never send email. Install the additive Prisma migration `20261109000000_pinit_receipts` and regenerate the Prisma client.

- affiliate: `{external_id: studioId, referral_code: 8 short chars (or legacy 24 hex), email, name}` returns `{affiliateId,status,commissionPercent}`. Creates PENDING affiliate with random unusable password; approve in admin. Repeated studio enrollment returns the binding. Existing emails/codes cannot be claimed.
- stats: `{referral_code}` returns only `{commissionPercent,status,earnedCents,pendingCents,paidCents}`. Rate is the default active percentage commission rule, 15% fallback; partner-group overrides are not used here.
- conversion: `{external_id: paymentId, referral_code, customer_email, amount_cents, event_type:'PURCHASE'}`. Affiliate must be ACTIVE. Uses program hold days; PENDING commissions mature through existing cron. Payment ID receipts reject changed retries.
- refund: `{external_id: paymentId, refund_id: uniqueRefundId, referral_code, customer_email, amount_cents}`. Reverses only this conversion, proportionally for partial refunds. Refunds pending an in-flight payout return a retryable conflict. Approved/paid commission reversals decrement the affiliate balance; a paid reversal may leave a clawback balance, matching existing policy.

PostgreSQL advisory transaction locks serialize requests for the same affiliate; receipts and commission changes commit together. Keep the dedicated key secret: it is privileged, like existing webhook API keys. The old generic conversion/refund routes remain unchanged. Deploy behind the canonical `partners.pinit.studio` URL; `referrals.lazi.studio` redirects.

Tests: `PLUNK_API_KEY= npx tsx --test src/lib/pinit-integration.test.ts`, `npx tsc --noEmit`. Unit/contract tests use a database double. Before production, validate enrollment/approval, duplicate sandbox events, partial/full refund, retry after lost response and payout conflict on staging PostgreSQL.

## Independent free mirror

Install migration `20261109010000_pinit_mirror` and regenerate Prisma. POST `mirror` accepts `{event_id: "signup|reward|revoke:<referred studio ID>", event_type: "signup|reward|revoke", external_id: referrerStudioId, referral_code, email: referrerOwnerEmail, name: referrerOwnerName, referred_studio_id, reward_type: "free|cash", occurred_at: ISO date}`. Enrolls a bound free-reward affiliate without approval; account status remains PENDING to prevent generic cash tracking. Immutable event rows with payload digests make retries idempotent and reject changed payloads. Free events never create Commission rows. Payout selection/manual creation reject free-mode affiliates even if their account is manually activated.

Admin → Pinit referrals shows referrer (linked to Partners), referred studio ID, date, signed up/rewarded/revoked, snapshotted reward type and current partner mode. $0 free rewards are history, not payable commissions. Customers keep using Pinit Settings → Referrals. A later affiliate enrollment upgrades an existing free binding to cash and resets approval to PENDING, retaining event history; delayed free events never downgrade cash mode. The owner approves cash in Partners as usual.

Host this in a dedicated Pinit instance/database, separate from Lazi. Free events contain only referrer enrollment name/email, opaque studio IDs/codes, dates and reward status; no referred email, project content or payment details. Include mirror data in access/deletion/retention procedures. No integration emails are sent.
