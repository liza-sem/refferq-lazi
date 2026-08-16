import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { getCurrencySymbol } from '@/lib/currency';
import { commissionMultiplier } from '@/lib/commission-rate';
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
      totalUsers,
      totalReferrals,
      totalConversions,
      totalClicks,
      pendingReferrals,
      approvedReferrals,
      confirmedRevenue,
      owedCommission,
      referrals,
      partnerGroups,
    ] = await Promise.all([
      prisma.affiliate.count(),
      prisma.user.count(),
      prisma.referral.count({ where: realLeadWhere }),
      prisma.conversion.count({ where: confirmedPurchaseWhere }),
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
      prisma.referral.findMany({
        where: realLeadWhere,
        include: { affiliate: true },
      }),
      prisma.partnerGroup.findMany(),
    ]);

    const partnerGroupMap = new Map(
      partnerGroups.map(pg => [pg.id, pg.commissionRate])
    );

    let totalEstimatedRevenue = 0;
    let totalEstimatedCommission = 0;

    referrals.forEach((ref) => {
      const metadata = ref.metadata as Record<string, unknown> | null;
      const estimatedValue = Number(metadata?.estimated_value) || 0;
      const valueInCents = Math.round(estimatedValue * 100);
      const affiliate = ref.affiliate as { partnerGroupId?: string | null };
      const commissionRate = commissionMultiplier(
        affiliate.partnerGroupId ? partnerGroupMap.get(affiliate.partnerGroupId) : undefined
      );
      totalEstimatedRevenue += valueInCents;
      totalEstimatedCommission += Math.floor(valueInCents * commissionRate);
    });

    const confirmedCents = confirmedRevenue._sum?.amountCents || 0;
    const stats = {
      totalAffiliates,
      totalUsers,
      totalReferrals,
      totalConversions: approvedReferrals,
      totalClicks,
      pendingReferrals,
      approvedReferrals,
      totalRevenue: confirmedCents,
      totalEstimatedRevenue: totalEstimatedRevenue || confirmedCents,
      totalEstimatedCommission: owedCommission._sum?.amountCents || totalEstimatedCommission,
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
