import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronOrAdmin } from '@/lib/cron-auth';
import { matureDueCommissions } from '@/lib/mature-commissions';
import { runAutoPayouts } from '@/lib/auto-payouts';
import { evaluateAllAffiliateTiers } from '@/lib/partner-tier-automation';

/**
 * Cron-safe payout drip.
 *
 * Dokploy / Hostinger cron (every 15–60 minutes):
 *   curl -sS -X POST https://referrals.lazi.studio/api/cron/payouts \
 *     -H "x-cron-secret: $CRON_SECRET"
 *
 * Each run matures due commissions, then pays at most dripSize affiliates
 * whose commissions have reached approvedAt + term (oldest first) via PayPal.
 */
async function handle(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const matured = await matureDueCommissions(auth.actorId);
    let tiers = { evaluated: 0, changed: 0, skippedLocked: 0 };
    try {
      tiers = await evaluateAllAffiliateTiers();
    } catch (error) {
      console.error('Partner tier evaluation failed during payout cron:', error);
    }
    const payouts = await runAutoPayouts({ actorId: auth.actorId });

    return NextResponse.json({
      success: true,
      matured: matured.matured,
      affiliatesUpdated: matured.affiliatesUpdated,
      tiersEvaluated: tiers.evaluated,
      tiersChanged: tiers.changed,
      tiersLocked: tiers.skippedLocked,
      processed: payouts.processed,
      skipped: payouts.skipped,
      failed: payouts.failed,
      totalAmountCents: payouts.totalAmountCents,
      dripSize: payouts.dripSize,
      autoPayoutEnabled: payouts.autoPayoutEnabled,
      paypalConfigured: payouts.paypalConfigured,
      lastAutoPayoutAt: payouts.lastAutoPayoutAt,
      results: payouts.results,
    });
  } catch (error) {
    console.error('Cron payouts error:', error);
    return NextResponse.json({ error: 'Failed to run payout cron' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
