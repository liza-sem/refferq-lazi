import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronOrAdmin } from '@/lib/cron-auth';
import { matureDueCommissions } from '@/lib/mature-commissions';

/**
 * POST /api/admin/commissions/mature
 *
 * Matures PENDING commissions whose hold period has expired.
 * Prefer /api/cron/payouts for scheduled runs (it matures, then pays).
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await matureDueCommissions(auth.actorId);
    return NextResponse.json({
      success: true,
      message: result.matured === 0
        ? 'No commissions to mature'
        : `${result.matured} commission(s) matured and approved`,
      matured: result.matured,
      affiliatesUpdated: result.affiliatesUpdated,
    });
  } catch (error) {
    console.error('Commission maturation error:', error);
    return NextResponse.json(
      { error: 'Failed to mature commissions' },
      { status: 500 }
    );
  }
}
