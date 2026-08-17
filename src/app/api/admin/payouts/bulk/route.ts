import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { runSelectedPaypalPayouts } from '@/lib/auto-payouts';

async function verifyAdmin(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return null;
  return user;
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const affiliateIds = Array.isArray(body.affiliateIds)
    ? body.affiliateIds.filter((id: unknown) => typeof id === 'string')
    : [];
  if (affiliateIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one partner' }, { status: 400 });
  }

  const result = await runSelectedPaypalPayouts({
    actorId: user.id,
    affiliateIds,
    skipThreshold: Boolean(body.skipThreshold),
  });

  if (result.processed === 0 && result.failed > 0) {
    return NextResponse.json({
      success: false,
      error: result.results[0]?.error || 'Payout failed',
      ...result,
    }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: result.processed === 0
      ? 'No eligible commissions to pay for the selected partners'
      : `Sent ${result.processed} payout(s)`,
    ...result,
  });
}
