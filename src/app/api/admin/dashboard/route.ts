import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { getCurrencySymbol } from '@/lib/currency';
import {
  approvedCustomerWhere,
  confirmedPurchaseWhere,
  owedCommissionWhere,
  realLeadWhere,
} from '@/lib/program-metrics';
import { backfillReferralPublicIds } from '@/lib/lead-public-id';

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    try {
      await backfillReferralPublicIds();
    } catch (error) {
      console.error('Lead public ID backfill skipped:', error);
    }

    const [
      totalAffiliates,
      totalReferrals,
      totalClicks,
      pendingReferrals,
      approvedReferrals,
      confirmedRevenue,
      owedCommission,
    ] = await Promise.all([
      prisma.affiliate.count(),
      prisma.referral.count({ where: realLeadWhere }),
      prisma.referralClick.count(),
      prisma.referral.count({ where: { status: 'PENDING', ...realLeadWhere } }),
      prisma.referral.count({ where: approvedCustomerWhere }),
      prisma.conversion.aggregate({
        where: confirmedPurchaseWhere,
        _sum: { amountCents: true },
      }),
      prisma.commission.aggregate({
        where: owedCommissionWhere,
        _sum: { amountCents: true },
      }),
    ]);

    const confirmedCents = confirmedRevenue._sum?.amountCents || 0;
    const owedCommissionCents = owedCommission._sum?.amountCents || 0;
    const stats = {
      totalAffiliates,
      totalReferrals,
      totalConversions: approvedReferrals,
      totalClicks,
      pendingReferrals,
      approvedReferrals,
      totalRevenue: confirmedCents,
      owedCommissionCents,
    };

    const currencySymbol = await getCurrencySymbol();

    return NextResponse.json({ success: true, stats, currencySymbol });

  } catch (error) {
    console.error('Admin dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin data' },
      { status: 500 }
    );
  }
}
