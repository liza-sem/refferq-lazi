import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { nextPayoutFromCommissions, payoutFrequencyLabel, resolvePayoutSchedule } from '@/lib/payout-schedule';
import { owedCommissionWhere } from '@/lib/program-metrics';
import { getCurrencySymbol } from '@/lib/currency';
import { resolveHoldDays } from '@/lib/commission-hold';
import { humanPayoutStatus } from '@/lib/payout-status';

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
        affiliate: {
          include: {
            partnerGroup: { select: { payoutFrequency: true, payoutWeekday: true, payoutDayOfMonth: true } },
          },
        },
      },
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

    const [settings, unpaidCommissions, currencySymbol] = await Promise.all([
      prisma.programSettings.findFirst({
        select: {
          minimumPayoutThreshold: true,
          minPayoutCents: true,
          payoutTerm: true,
          payoutFrequency: true,
          payoutWeekday: true,
          payoutDayOfMonth: true,
          lastAutoPayoutAt: true,
          commissionHoldDays: true,
        },
      }),
      prisma.commission.findMany({
        where: { affiliateId: user.affiliate.id, ...owedCommissionWhere },
        select: { amountCents: true, status: true, approvedAt: true, createdAt: true, payoutId: true },
      }),
      getCurrencySymbol(),
    ]);

    const minimumPayoutCents = settings?.minimumPayoutThreshold ?? settings?.minPayoutCents ?? 0;
    const { frequency: payoutFrequency, payday } = resolvePayoutSchedule(
      user.affiliate,
      user.affiliate.partnerGroup,
      settings,
    );
    const holdDays = resolveHoldDays(settings?.commissionHoldDays);
    const unpaidBalanceCents = unpaidCommissions.reduce((sum, c) => sum + c.amountCents, 0);
    const approvedUnpaid = unpaidCommissions.filter((c) => c.status === 'APPROVED' && !c.payoutId);
    const nextPayout = nextPayoutFromCommissions(
      approvedUnpaid,
      payoutFrequency,
      payday,
      new Date(),
      settings?.lastAutoPayoutAt || null,
    );
    const nextPayoutCents = nextPayout.nextPayoutCents;
    const pendingHoldCents = unpaidCommissions
      .filter((c) => c.status === 'PENDING')
      .reduce((sum, c) => sum + c.amountCents, 0);
    const inPayoutCents = payouts
      .filter((p) => p.status === 'PROCESSING')
      .reduce((sum, p) => sum + p.amountCents, 0);
    const paidSoFarCents = payouts
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amountCents, 0);
    const nextPayoutAt = nextPayout.nextPayoutAt?.toISOString() || null;

    return NextResponse.json({
      success: true,
      payouts: payouts.map(p => ({
        id: p.id,
        amount: p.amountCents,
        status: p.status,
        displayStatus: humanPayoutStatus(p.status, p.paypalStatus),
        paypalStatus: p.paypalStatus,
        method: p.method,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.processedAt?.toISOString() || null
      })),
      unpaidBalanceCents,
      inPayoutCents,
      nextPayoutCents,
      paidSoFarCents,
      pendingHoldCents,
      currencySymbol,
      schedule: {
        minimumPayoutCents,
        payoutTerm: settings?.payoutTerm || 'NET-15',
        payoutFrequency,
        payoutFrequencyLabel: payoutFrequencyLabel(payoutFrequency),
        payoutWeekday: payday.weekday,
        payoutDayOfMonth: payday.dayOfMonth,
        commissionHoldDays: holdDays,
        nextPayoutAt,
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
