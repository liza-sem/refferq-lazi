import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    
    // Get user from database
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'AFFILIATE') {
      return NextResponse.json(
        { error: 'Access denied. Affiliate role required.' },
        { status: 403 }
      );
    }

    if (!user.affiliate) {
      return NextResponse.json(
        { error: 'Affiliate profile not found' },
        { status: 404 }
      );
    }

    // Get payouts for this affiliate
    const payouts = await prisma.payout.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        commissions: true
      }
    });

    const settings = await prisma.programSettings.findFirst({
      select: {
        minimumPayoutThreshold: true,
        minPayoutCents: true,
        payoutTerm: true,
        payoutFrequency: true,
        commissionHoldDays: true,
      },
    });

    const minimumPayoutCents = settings?.minimumPayoutThreshold ?? settings?.minPayoutCents ?? 0;

    return NextResponse.json({
      success: true,
      payouts: payouts.map(p => ({
        id: p.id,
        amount: p.amountCents,
        status: p.status,
        method: p.method,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.processedAt?.toISOString() || null
      })),
      schedule: {
        minimumPayoutCents,
        payoutTerm: settings?.payoutTerm || 'NET-15',
        payoutFrequency: settings?.payoutFrequency || 'MONTHLY',
        commissionHoldDays: settings?.commissionHoldDays ?? 0,
      },
    });
  } catch (error) {
    console.error('Affiliate payouts API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payouts' },
      { status: 500 }
    );
  }
}
