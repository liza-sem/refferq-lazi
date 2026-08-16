import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronOrAdmin } from '@/lib/cron-auth';
import { matureDueCommissions } from '@/lib/mature-commissions';
import { getAutoPayoutStatus, runAutoPayouts } from '@/lib/auto-payouts';

export async function POST(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const dripSize = typeof body.dripSize === 'number' ? body.dripSize : undefined;

    const matured = await matureDueCommissions(auth.actorId);
    const payouts = await runAutoPayouts({ actorId: auth.actorId, dripSize });

    return NextResponse.json({
      success: true,
      message: payouts.processed === 0
        ? 'No affiliates were paid on this drip'
        : `Auto-payout sent for ${payouts.processed} affiliate(s)`,
      matured: matured.matured,
      processed: payouts.processed,
      skipped: payouts.skipped,
      failed: payouts.failed,
      totalAmountCents: payouts.totalAmountCents,
      dripSize: payouts.dripSize,
      results: payouts.results,
    });
  } catch (error) {
    console.error('Auto-payout error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process auto-payouts' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const status = await getAutoPayoutStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error('Auto-payout config error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch config' }, { status: 500 });
  }
}
