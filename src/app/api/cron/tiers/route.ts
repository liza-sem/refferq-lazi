import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronOrAdmin } from '@/lib/cron-auth';
import { evaluateAllAffiliateTiers } from '@/lib/partner-tier-automation';

async function handle(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const summary = await evaluateAllAffiliateTiers();
    return NextResponse.json({
      success: true,
      evaluated: summary.evaluated,
      changed: summary.changed,
      skippedLocked: summary.skippedLocked,
      results: summary.results.filter((r) => r.changed),
    });
  } catch (error) {
    console.error('Cron partner tiers error:', error);
    return NextResponse.json({ error: 'Failed to evaluate partner tiers' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
