# Refferq security fixes — 13 November 2026

Scope: G06 and G14 from the November security review, applied on `security-fixes` based on `origin/main` (`1c96499`) and merged locally into `pinit-integration`. No push, deployment, production request, database mutation or real email/payout was performed during validation.

## G06: authenticated identity and closed diagnostic endpoints

- `getRequestUserId` now derives identity exclusively from the `auth-token` cookie. It verifies HS256, signature and expiry against `JWT_SECRET`, requires a nonempty string identity and a recognized session role, and rejects invite-purpose tokens. Missing secrets, invalid/expired tokens and malformed cookie encoding deny identity. Login and OTP login already issue compatible 24-hour HS256 session tokens.
- The middleware is now `src/proxy.ts`, following the installed Next 16 documentation's replacement for the deprecated middleware convention. It removes every incoming `x-user-*` header before other proxy logic and forwards the sanitized request headers on all pass-through paths. Its matcher includes all paths, including static assets and image requests. Role guards and the legacy host redirect remain; route handlers independently verify the cookie and never consume identity hints.
- The existing shared cron guard already requires either a nonempty matching `CRON_SECRET` (`x-cron-secret` or Bearer) or a session whose user is currently an ACTIVE ADMIN in the database. Removing header-based identity closes its fallback bypass. Unset/empty `CRON_SECRET` never authorizes a secret-based caller; an independently verified ACTIVE admin may still run the job.
- Both `/api/test/email` methods now return the actual denial response before reading configuration or sending mail. They require a verified session and current ACTIVE ADMIN status in every environment. In production they return 404 unless `ENABLE_TEST_EMAIL_ROUTE` is exactly `true`; opting in does not bypass authentication.
- The complete helper-caller review found the same mixed-response denial bug in `/api/admin/webhooks`. Its helper now has an explicit result union and returns an error result on missing identity, consistently with all four callers. Other callers already return or check their missing-identity denial.

## Routes checked

This is a check for trusted-client identity and denial fall-through assumptions, not a new audit of all business logic or status/revocation rules. Existing role/status policies outside cron/test-email remain as before.

All direct `getRequestUserId` route callers on the main baseline (48 route files):

- `/api/admin/affiliates/[id]`
- `/api/admin/affiliates/batch`
- `/api/admin/affiliates/invite`
- `/api/admin/affiliates`
- `/api/admin/analytics`
- `/api/admin/api-keys`
- `/api/admin/api-usage`
- `/api/admin/coupons`
- `/api/admin/dashboard`
- `/api/admin/emails`
- `/api/admin/emails/test`
- `/api/admin/integration/generate-key`
- `/api/admin/integration`
- `/api/admin/invoices`
- `/api/admin/partner-groups/evaluate`
- `/api/admin/partner-groups`
- `/api/admin/payouts/bulk`
- `/api/admin/payouts/cancel`
- `/api/admin/payouts/eligible`
- `/api/admin/payouts/manual`
- `/api/admin/payouts/paypal-csv`
- `/api/admin/payouts`
- `/api/admin/payouts/schedule`
- `/api/admin/profile`
- `/api/admin/programs`
- `/api/admin/referrals/[id]`
- `/api/admin/referrals`
- `/api/admin/refunds`
- `/api/admin/reports/cohort`
- `/api/admin/reports/email`
- `/api/admin/reports`
- `/api/admin/reset-tracking`
- `/api/admin/resources`
- `/api/admin/saved-reports`
- `/api/admin/scheduled-reports`
- `/api/admin/settings/integration`
- `/api/admin/settings/profile`
- `/api/admin/settings`
- `/api/admin/team`
- `/api/admin/transactions`
- `/api/admin/webhooks`
- `/api/affiliate/generate-code`
- `/api/affiliate/payouts`
- `/api/affiliate/profile`
- `/api/affiliate/referrals`
- `/api/affiliate/resources`
- `/api/auth/me`
- `/api/test/email`

The additional `getRequestUserId` caller is `src/lib/cron-auth.ts`, used by `/api/cron/payouts`, `/api/cron/tiers`, `/api/admin/commissions/mature`, `/api/admin/payouts/auto` and `/api/admin/purchases/replay`. Each caller returns `auth.response` on `!auth.ok` before doing work. Admin-prefixed cron-helper routes additionally retain the proxy's session/role guard.

Every route outside `/api/admin` and `/api/affiliate` was checked:

| Routes | Identity/authentication boundary |
| --- | --- |
| `/api/auth/me` | Shared verified cookie helper, denies absent identity before lookup |
| `/api/test/email` (GET/POST) | Production gate plus verified ACTIVE admin; repaired denial |
| `/api/cron/payouts`, `/api/cron/tiers` (GET/POST) | Secret or verified ACTIVE admin; no client identity fallback |
| `/api/auth/login` | Password verification before signing session |
| `/api/auth/verify-otp` | OTP verification before signing session |
| `/api/auth/send-otp`, `/api/auth/register` | Public onboarding; no `x-user-*` identity consumption |
| `/api/auth/invite` | Verified signed invite token, purpose and database role/status |
| `/api/auth/logout` | Clears cookie; no privileged identity assumption |
| `/api/docs` | Public API documentation |
| `/api/track/conversion`, `/api/track/referral` | Tracking/API key validation; OPTIONS is public CORS |
| `/api/webhook/conversion`, `/api/webhook/refund` | API key or configured webhook HMAC signature |
| `/api/webhook/stripe` | Configured Stripe webhook secret and signature |
| `/r/[code]` | Public referral capability/redirect; no account-header identity |

Pinit-specific additions reviewed from `pinit-integration`: `/api/admin/pinit-referrals` is the 49th direct helper route caller and checks current ACTIVE ADMIN status; `/api/integrations/pinit/[action]` (outside the protected prefixes) validates the hashed API key, active/expiry/admin scope through `pinitKeyAllowed`, independently of session headers. No additional identity-header trust or mixed-response denial was found there. `rg` found no production consumer of `x-user-*` after these changes.

## G14: dependency closure

The checked-in lockfile, not just package ranges, contains the updates. `npm ci` succeeds and `npm audit --omit=dev --json` reports **0 vulnerabilities** (also 0 in the full install audit). The review baseline recorded 21 affected production packages. Audit results reflect the npm advisory database on the validation date, not a guarantee against future vulnerabilities.

| Dependency or chain | Before | After / action |
| --- | --- | --- |
| Next / @next packages | 16.2.6 | 16.4.6, same major |
| sharp / libvips platform packages | 0.34.5 / 1.2.4 | 0.35.5 / 1.3.4 via Next |
| Prisma client / CLI / config | 6.16.3 | 6.19.3, same major |
| effect | 3.16.12 | 3.21.0 via Prisma |
| deepmerge-ts | 7.1.5 | 8.0.0, scoped override under @prisma/config |
| Zod | 4.3.6 | 4.6.7, same major |
| lodash / nanoid | 4.17.23 / 3.3.11 | 4.18.1 / 3.3.20 |
| picomatch | 2.3.1 | 2.3.2; separate 4.x chain is patched too |
| sucrase | 3.35.0 | 3.35.1; glob/minimatch/brace-expansion removed from its chain |
| PostCSS / selector parser / source-map-js | 8.5.10 / 6.1.2 / 1.2.1 | 8.5.23 / 6.1.6 / 1.2.2 |
| baseline-browser-mapping | 2.10.29 | 2.11.37 |
| @react-email/render | 1.3.2 | Removed: unused anywhere in the application; also removes vulnerable html-to-text/deepmerge dependencies |

There are no remaining known production advisories or deferred vulnerable updates. The one forced major upgrade is `deepmerge-ts`: the [maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) lists all versions below 8.0.0 as affected, so retaining 7.x cannot close it. The override is limited to Prisma config rather than changing Prisma's major. Prisma generation and the build pass with this override; reassess/remove it when Prisma's 6.x dependency range includes the fix. CLI/database schema synchronization against an actual deployment database was not run. Application code uses no React Email renderer; removal preserves the existing mail service.

## Local verification

Clean install and generated client:

```sh
npm ci
npx prisma generate
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev --json
```

On `security-fixes`: **15/15 tests pass**, TypeScript passes, and the production build passes. Also repeated tests, TypeScript and build on Node **20.20.2**, matching the Dockerfile's Node 20 major; all pass. The host Node 26.8.1 run also passed. On the merged `pinit-integration` branch, **21/21 tests pass** (15 security regressions plus the six existing Pinit integration tests), Prisma Client generation passes, TypeScript passes, and the production build passes on Node 20.20.2; the production audit again reports 0 vulnerabilities. The only merge conflict was the test script: resolving it to `tsx --test src/lib/*.test.ts` preserves both suites.

The new Node test-runner suite uses injected fake Prisma records and fake mail delivery. It covers forged headers on me/test/cron, valid cookie precedence, invalid/expired/malformed/invite tokens, missing JWT secret, inactive/non-admin/deleted admin denial, valid cron headers/Bearer and admin success through both methods of both cron routes, missing/empty/wrong cron secrets, production test-email disable/opt-in, proxy stripping/matcher coverage including assets, and all four webhook denial methods. Cron success uses empty fake job records with PayPal credentials removed; no live services are contacted.

## Required environment and deployment verification

Before the owner deploys either branch:

1. Ensure `JWT_SECRET` is a strong, nonempty secret shared by login and request verification. Missing configuration now denies identity rather than accepting headers. Existing correctly signed login sessions remain compatible.
2. Set a strong random **`CRON_SECRET`** on each instance and use the same value in its scheduler's `x-cron-secret` or Bearer header. It must be configured for unattended cron to continue working; an unset/empty secret denies unauthenticated jobs. The two instances may use different secrets.
3. Leave **`ENABLE_TEST_EMAIL_ROUTE` unset or `false`** in production (default). Only set exactly `true` for a deliberate diagnostic window; a current ACTIVE admin session is still mandatory. This is an optional enable flag, not a required deployment setting. Turn it off afterward.
4. Build from the committed lockfile (`npm ci`), regenerate Prisma Client and run the checks above. This change requires no schema migration.

After the owner's deployment, verify on each instance:

- With no cookie, `/api/auth/me` returns 401 even when sent `x-user-id`/`x-user-role`; invalid cookies also deny. A legitimate login session still returns that user's account.
- With the production test flag disabled, GET and POST `/api/test/email` both return 404 for anonymous and admin callers and send no mail. If deliberately enabled, missing identity returns 401 and a non-active/non-admin user returns 403; use GET to verify without sending email.
- Both cron routes/methods return 401 without a valid secret or ACTIVE admin cookie, including forged identity headers and wrong secrets. On staging with controlled records, confirm a configured secret and ACTIVE admin each run successfully, and missing `CRON_SECRET` denies the anonymous caller. On production, verify the successful case through the next scheduled legitimate run: cron can change commissions and initiate real payouts.
- Confirm `/api/admin/webhooks` denies an anonymous request, authenticated portal navigation and assets still load, and the deployment's proxy entry is present in the build output.
- Re-run the production dependency audit for the deployed lockfile and record the deployed SHA. Docker image/Linux native-image behavior and real database/PayPal/mail interactions remain owner-side deployment smoke checks; local tests/builds used macOS and fakes.

Both branches remain local. The owner controls pushing, deployment and the timing of updates to Lazi (`main`) and Pinit (`pinit-integration`).
