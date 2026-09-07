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

    const revenueByPartner = await prisma.conversion.groupBy({
      by: ['affiliateId'],
      where: confirmedPurchaseWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { _sum: { amountCents: 'desc' } },
    });

    const topRevenue = revenueByPartner
      .filter((row) => (row._sum.amountCents || 0) > 0)
      .slice(0, 5);
    const topIds = topRevenue.map((row) => row.affiliateId);

    const [topAffiliates, customerCounts] = topIds.length
      ? await Promise.all([
          prisma.affiliate.findMany({
            where: { id: { in: topIds } },
            select: {
              id: true,
              referralCode: true,
              user: { select: { name: true, email: true } },
            },
          }),
          prisma.referral.groupBy({
            by: ['affiliateId'],
            where: { affiliateId: { in: topIds }, ...approvedCustomerWhere },
            _count: { _all: true },
          }),
        ])
      : [[], []];

    const affiliateById = new Map(topAffiliates.map((affiliate) => [affiliate.id, affiliate]));
    const customersById = new Map(
      customerCounts.map((row) => [row.affiliateId, row._count._all])
    );

    const topPartners = topRevenue.flatMap((row) => {
      const affiliate = affiliateById.get(row.affiliateId);
      if (!affiliate) return [];
      const customers = customersById.get(row.affiliateId) || 0;
      return [{
        id: affiliate.id,
        name: affiliate.user.name || 'Partner',
        email: affiliate.user.email,
        referralCode: affiliate.referralCode,
        totalRevenue: row._sum.amountCents || 0,
        totalReferrals: customers > 0 ? customers : row._count._all,
      }];
    });

    const currencySymbol = await getCurrencySymbol();

    return NextResponse.json({ success: true, stats, topPartners, currencySymbol });

  } catch (error) {
    console.error('Admin dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin data' },
      { status: 500 }
    );
  }
}
