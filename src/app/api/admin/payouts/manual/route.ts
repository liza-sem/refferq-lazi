import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { isPaypalConfigured, paypalMode } from '@/lib/paypal';
import { isValidPaypalEmail, paypalEmailFromDetails } from '@/lib/onboarding';
import { getProgramDefaults } from '@/lib/program-defaults';
import { payoutFrequencyLabel, resolvePayoutFrequency } from '@/lib/payout-schedule';
import { runManualPaypalPayout } from '@/lib/auto-payouts';

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

  const affiliateId = new URL(request.url).searchParams.get('affiliateId');
  if (!affiliateId) {
    return NextResponse.json({ error: 'affiliateId is required' }, { status: 400 });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: {
      user: { select: { name: true, email: true, status: true } },
      partnerGroup: { select: { name: true, payoutFrequency: true } },
    },
  });

  if (!affiliate) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }

  const defaults = await getProgramDefaults();
  const frequency = resolvePayoutFrequency(
    affiliate.partnerGroup?.payoutFrequency,
    defaults.payoutFrequency,
  );
  const paypalEmail = paypalEmailFromDetails(affiliate.payoutDetails);
  const paypalConfigured = isPaypalConfigured();
  const mode = paypalMode();

  const commissions = await prisma.commission.findMany({
    where: {
      affiliateId,
      payoutId: null,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    include: {
      conversion: {
        select: {
          eventMetadata: true,
          referral: { select: { leadName: true, leadEmail: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const historyRows = await prisma.commission.findMany({
    where: { affiliateId },
    include: {
      conversion: {
        select: {
          eventMetadata: true,
          referral: { select: { leadName: true, leadEmail: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const toRow = (commission: (typeof commissions)[number] | (typeof historyRows)[number]) => {
    const meta = (commission.conversion.eventMetadata || {}) as Record<string, unknown>;
    const customerName =
      commission.conversion.referral?.leadName ||
      (typeof meta.customerName === 'string' ? meta.customerName : null) ||
      (typeof meta.email === 'string' ? meta.email : null) ||
      'Sale';
    return {
      id: commission.id,
      amountCents: commission.amountCents,
      rate: commission.rate,
      status: commission.status,
      createdAt: commission.createdAt,
      maturesAt: commission.maturesAt,
      paidAt: commission.paidAt,
      customerName,
    };
  };

  const unpaid = commissions.map(toRow);

  const amountCents = unpaid.reduce((sum, c) => sum + c.amountCents, 0);
  const pendingCount = unpaid.filter((c) => c.status === 'PENDING').length;
  const approvedCount = unpaid.filter((c) => c.status === 'APPROVED').length;
  const blockers: string[] = [];

  if (unpaid.length === 0) blockers.push('No unpaid commissions.');
  if (!isValidPaypalEmail(paypalEmail)) {
    blockers.push('No PayPal email on this partner. Add a sandbox personal email in payout details.');
  }
  if (!paypalConfigured) {
    blockers.push('PayPal keys missing. Add sandbox Client ID and Secret in Dokploy.');
  }
  if (unpaid.length > 0 && amountCents < 1) {
    blockers.push('Payout amount must be at least $0.01.');
  }

  return NextResponse.json({
    success: true,
    preview: {
      affiliateId,
      affiliateName: affiliate.user.name,
      paypalEmail: paypalEmail || null,
      paypalConfigured,
      paypalMode: mode,
      payoutFrequency: frequency,
      payoutFrequencyLabel: payoutFrequencyLabel(frequency),
      refundHoldDays: defaults.commissionHoldDays,
      cookieDuration: defaults.cookieDuration,
      minPayoutCents: defaults.minPayoutCents,
      amountCents,
      pendingCount,
      approvedCount,
      canPay: blockers.length === 0,
      canSkipHold: pendingCount > 0,
      blockers,
      commissions: unpaid,
      history: historyRows.map(toRow),
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const affiliateId = typeof body.affiliateId === 'string' ? body.affiliateId : '';
  if (!affiliateId) {
    return NextResponse.json({ error: 'affiliateId is required' }, { status: 400 });
  }

  const commissionIds = Array.isArray(body.commissionIds)
    ? body.commissionIds.filter((id: unknown) => typeof id === 'string')
    : undefined;

  const result = await runManualPaypalPayout({
    actorId: user.id,
    affiliateId,
    commissionIds,
    skipHold: body.skipHold !== false,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Failed to send payout',
        blockers: result.blockers,
        paypalMode: result.paypalMode,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...result,
    success: true,
    message: result.paypalMode === 'live'
      ? `Paid ${result.commissionCount} commission(s) via live PayPal.`
      : `Sandbox payout sent for ${result.commissionCount} commission(s).`,
  });
}
