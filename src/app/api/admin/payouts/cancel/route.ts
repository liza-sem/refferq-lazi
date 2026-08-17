import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { cancelPayout } from '@/lib/auto-payouts';

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
  const payoutId = typeof body.payoutId === 'string' ? body.payoutId : '';
  if (!payoutId) {
    return NextResponse.json({ error: 'payoutId is required' }, { status: 400 });
  }

  const result = await cancelPayout({ actorId: user.id, payoutId });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    payoutId: result.payoutId,
    message: 'Payout cancelled. Commissions are unpaid again. It will not retry.',
  });
}
