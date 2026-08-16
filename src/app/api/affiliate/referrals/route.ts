import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { realLeadWhere } from '@/lib/program-metrics';
import { toAffiliateLead } from '@/lib/lead-privacy';
import { backfillReferralPublicIds } from '@/lib/lead-public-id';

export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

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

    return NextResponse.json(
      {
        error: 'Manual lead submission is disabled. Email hello@lazi.studio if a sale looks wrong.',
      },
      { status: 403 }
    );
  } catch (error) {
    console.error('Submit referral API error:', error);
    return NextResponse.json(
      { error: 'Failed to submit referral' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

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

    try {
      await backfillReferralPublicIds();
    } catch (error) {
      console.error('Lead public ID backfill skipped:', error);
    }

    const referrals = await prisma.referral.findMany({
      where: {
        affiliateId: user.affiliate.id,
        ...realLeadWhere,
      },
      include: {
        conversions: { select: { amountCents: true, status: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      referrals: referrals.map((ref) => toAffiliateLead(ref)),
    });
  } catch (error) {
    console.error('Get referrals API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}
