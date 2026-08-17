import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { listEligiblePayoutPartners } from '@/lib/auto-payouts';

async function verifyAdmin(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const listed = await listEligiblePayoutPartners({
    includeBelowThreshold: true,
    requirePaypalEmail: true,
  });

  return NextResponse.json({
    success: true,
    minPayoutCents: listed.minPayoutCents,
    currency: listed.currency,
    partners: listed.partners,
  });
}
