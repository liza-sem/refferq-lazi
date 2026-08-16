import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { nextPayoutFromCommissions, payoutFrequencyLabel, resolvePayoutSchedule } from '@/lib/payout-schedule';
import { owedCommissionWhere } from '@/lib/program-metrics';
import { getCurrencySymbol } from '@/lib/currency';
import { isCommissionMatured, maturedUnpaidWhere, resolveHoldDays } from '@/lib/commission-hold';
import { humanPayoutStatus } from '@/lib/payout-status';
import { isValidPaypalEmail, paypalEmailFromDetails } from '@/lib/onboarding';
import { runManualPaypalPayout } from '@/lib/auto-payouts';

async function loadAffiliate(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
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
    return { error: NextResponse.json({ error: 'User not found' }, { status: 401 }) };
  }
  if (user.role !== 'AFFILIATE') {
    return { error: NextResponse.json({ error: 'Access denied. Affiliate role required.' }, { status: 403 }) };
  }
  if (!user.affiliate) {
    return { error: NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 }) };
  }

  return { user, affiliate: user.affiliate };
}

function payNowDisabledReason(input: {
  availableCents: number;
  hasPaypalEmail: boolean;
  payoutInFlight: boolean;
  holdDays: number;
}): string | null {
  if (input.payoutInFlight) return 'A payout is already on the way.';
  if (!input.hasPaypalEmail) return 'Add a PayPal email in Settings.';
  if (input.availableCents <= 0) {
    return `Nothing available yet. Sales are held for ${input.holdDays} day${input.holdDays === 1 ? '' : 's'}.`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const loaded = await loadAffiliate(request);
    if ('error' in loaded) return loaded.error;
    const { user, affiliate } = loaded;

    const payouts = await prisma.payout.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        commissions: true,
      },
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
        where: { affiliateId: affiliate.id, ...owedCommissionWhere },
        select: { amountCents: true, status: true, approvedAt: true, createdAt: true, payoutId: true, maturesAt: true },
      }),
      getCurrencySymbol(),
    ]);

    const minimumPayoutCents = settings?.minimumPayoutThreshold ?? settings?.minPayoutCents ?? 0;
    const { frequency: payoutFrequency, payday } = resolvePayoutSchedule(
      affiliate,
      affiliate.partnerGroup,
      settings,
    );
    const holdDays = resolveHoldDays(settings?.commissionHoldDays);
    const now = new Date();
    const unpaidBalanceCents = unpaidCommissions.reduce((sum, c) => sum + c.amountCents, 0);
    const pendingHoldCents = unpaidCommissions
      .filter((c) => c.status === 'PENDING')
      .reduce((sum, c) => sum + c.amountCents, 0);
    const availableCents = unpaidCommissions
      .filter((c) => !c.payoutId && isCommissionMatured(c, now))
      .reduce((sum, c) => sum + c.amountCents, 0);
    const approvedUnpaid = unpaidCommissions.filter((c) => !c.payoutId && isCommissionMatured(c, now));
    const nextPayout = nextPayoutFromCommissions(
      approvedUnpaid,
      payoutFrequency,
      payday,
      now,
      settings?.lastAutoPayoutAt || null,
    );
    const nextPayoutCents = nextPayout.nextPayoutCents;
    const inPayoutCents = payouts
      .filter((p) => p.status === 'PROCESSING')
      .reduce((sum, p) => sum + p.amountCents, 0);
    const paidSoFarCents = payouts
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amountCents, 0);
    const nextPayoutAt = nextPayout.nextPayoutAt?.toISOString() || null;
    const nextMaturesAt = unpaidCommissions
      .filter((c) => c.status === 'PENDING' && c.maturesAt)
      .sort((a, b) => ((a.maturesAt?.getTime() || 0) - (b.maturesAt?.getTime() || 0)))[0]?.maturesAt || null;
    const hasPaypalEmail = isValidPaypalEmail(paypalEmailFromDetails(affiliate.payoutDetails));
    const payoutInFlight = inPayoutCents > 0;
    const disabledReason = payNowDisabledReason({
      availableCents,
      hasPaypalEmail,
      payoutInFlight,
      holdDays,
    });

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
        paidAt: p.processedAt?.toISOString() || null,
      })),
      unpaidBalanceCents,
      pendingHoldCents,
      availableCents,
      inPayoutCents,
      nextPayoutCents,
      paidSoFarCents,
      currencySymbol,
      hasPaypalEmail,
      payoutInFlight,
      canPayNow: !disabledReason,
      payNowDisabledReason: disabledReason,
      schedule: {
        minimumPayoutCents,
        payoutTerm: settings?.payoutTerm || 'NET-15',
        payoutFrequency,
        payoutFrequencyLabel: payoutFrequencyLabel(payoutFrequency),
        payoutWeekday: payday.weekday,
        payoutDayOfMonth: payday.dayOfMonth,
        commissionHoldDays: holdDays,
        nextPayoutAt,
        nextMaturesAt: nextMaturesAt?.toISOString() || null,
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

export async function POST(request: NextRequest) {
  try {
    const loaded = await loadAffiliate(request);
    if ('error' in loaded) return loaded.error;
    const { user, affiliate } = loaded;

    const settings = await prisma.programSettings.findFirst({
      select: { commissionHoldDays: true },
    });
    const holdDays = resolveHoldDays(settings?.commissionHoldDays);
    const hasPaypalEmail = isValidPaypalEmail(paypalEmailFromDetails(affiliate.payoutDetails));
    const inFlight = await prisma.payout.findFirst({
      where: { affiliateId: affiliate.id, status: 'PROCESSING' },
      select: { id: true },
    });
    const now = new Date();
    const matured = await prisma.commission.findMany({
      where: { affiliateId: affiliate.id, ...maturedUnpaidWhere(now) },
      select: { id: true, amountCents: true },
    });
    const availableCents = matured.reduce((sum, c) => sum + c.amountCents, 0);
    const disabledReason = payNowDisabledReason({
      availableCents,
      hasPaypalEmail,
      payoutInFlight: Boolean(inFlight),
      holdDays,
    });

    if (disabledReason) {
      return NextResponse.json({ success: false, error: disabledReason }, { status: 400 });
    }

    const result = await runManualPaypalPayout({
      actorId: user.id,
      affiliateId: affiliate.id,
      commissionIds: matured.map((c) => c.id),
      skipHold: false,
      initiatedBy: 'partner',
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send payout',
          blockers: result.blockers,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ...result,
      success: true,
      message: 'Pay me now sent. PayPal usually confirms in minutes.',
    });
  } catch (error) {
    console.error('Affiliate Pay me now error:', error);
    return NextResponse.json(
      { error: 'Failed to request payout' },
      { status: 500 },
    );
  }
}
