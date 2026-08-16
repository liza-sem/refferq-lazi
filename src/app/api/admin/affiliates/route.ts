import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { commissionPercent } from '@/lib/commission-rate';
import {
  approvedCustomerWhere,
  confirmedPurchaseWhere,
  earnedCommissionWhere,
  realLeadWhere,
} from '@/lib/program-metrics';

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    const affiliates = await prisma.affiliate.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true
          }
        },
        partnerGroup: {
          select: {
            id: true,
            name: true,
            commissionRate: true,
          }
        },
        _count: {
          select: {
            clicks: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const affiliateIds = affiliates.map((a) => a.id);
    const [leadCounts, customerCounts, revenues, earnings] = affiliateIds.length
      ? await Promise.all([
          prisma.referral.groupBy({
            by: ['affiliateId'],
            where: { affiliateId: { in: affiliateIds }, ...realLeadWhere },
            _count: { _all: true },
          }),
          prisma.referral.groupBy({
            by: ['affiliateId'],
            where: { affiliateId: { in: affiliateIds }, ...approvedCustomerWhere },
            _count: { _all: true },
          }),
          prisma.conversion.groupBy({
            by: ['affiliateId'],
            where: { affiliateId: { in: affiliateIds }, ...confirmedPurchaseWhere },
            _sum: { amountCents: true },
          }),
          prisma.commission.groupBy({
            by: ['affiliateId'],
            where: { affiliateId: { in: affiliateIds }, ...earnedCommissionWhere },
            _sum: { amountCents: true },
          }),
        ])
      : [[], [], [], []];

    const leadMap = new Map(leadCounts.map((row) => [row.affiliateId, row._count._all]));
    const customerMap = new Map(customerCounts.map((row) => [row.affiliateId, row._count._all]));
    const revenueMap = new Map(revenues.map((row) => [row.affiliateId, row._sum.amountCents || 0]));
    const earningsMap = new Map(earnings.map((row) => [row.affiliateId, row._sum.amountCents || 0]));

    const { getCurrencySymbol } = await import('@/lib/currency');
    const currencySymbol = await getCurrencySymbol();

    return NextResponse.json({
      success: true,
      affiliates: affiliates.map((affiliate) => ({
        ...affiliate,
        name: affiliate.user.name,
        email: affiliate.user.email,
        status: affiliate.user.status,
        totalClicks: affiliate._count.clicks,
        totalLeads: leadMap.get(affiliate.id) || 0,
        totalCustomers: customerMap.get(affiliate.id) || 0,
        totalRevenue: revenueMap.get(affiliate.id) || 0,
        totalEarnings: earningsMap.get(affiliate.id) || 0,
        partnerGroup: affiliate.partnerGroup?.name || 'Standard',
        partnerGroupId: affiliate.partnerGroupId,
        partnerGroupLocked: affiliate.partnerGroupLocked,
        commissionRate: affiliate.partnerGroup?.commissionRate ?? 20,
        commissionPercent: commissionPercent(affiliate.partnerGroup?.commissionRate ?? 20),
        tierAssignedAt: affiliate.tierAssignedAt,
        tierAssignedReason: affiliate.tierAssignedReason,
      })),
      currencySymbol,
    });
  } catch (error) {
    console.error('Get affiliates API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { success, data, error: validationError } = await import('@/lib/validations').then(m => m.affiliateCreateSchema.safeParse(body));

    if (!success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationError.issues },
        { status: 400 }
      );
    }

    const { name, email, password, paypalEmail, company } = data;
    const requestedGroupId = typeof body.partnerGroupId === 'string' ? body.partnerGroupId : null;

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    const crypto = await import('crypto');
    const userPassword = password || `AF${crypto.randomBytes(12).toString('base64url')}`;

    const hashedPassword = await (await import('bcryptjs')).hash(userPassword, 12);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        role: 'AFFILIATE',
        status: 'ACTIVE',
        password: hashedPassword
      }
    });

    const { getOrCreateDefaultPartnerGroup } = await import('@/lib/default-partner-group');
    const defaultGroup = await getOrCreateDefaultPartnerGroup();
    let partnerGroupId = defaultGroup.id;
    if (requestedGroupId) {
      const requested = await prisma.partnerGroup.findUnique({ where: { id: requestedGroupId } });
      if (requested) partnerGroupId = requested.id;
    }
    const affiliate = await prisma.affiliate.create({
      data: {
        userId: newUser.id,
        referralCode: `AF${Date.now()}${(await import('crypto')).randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`,
        partnerGroupId,
        balanceCents: 0,
        payoutDetails: {
          paymentMethod: 'PayPal',
          ...(paypalEmail ? { paymentEmail: paypalEmail.trim().toLowerCase() } : {}),
          ...(company ? { company } : {}),
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Affiliate created successfully',
      affiliate: {
        id: affiliate.id,
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        referralCode: affiliate.referralCode,
        balanceCents: affiliate.balanceCents,
        createdAt: affiliate.createdAt
      },
      temporaryPassword: userPassword
    });
  } catch (error) {
    console.error('Create affiliate API error:', error);
    return NextResponse.json(
      { error: 'Failed to create affiliate' },
      { status: 500 }
    );
  }
}
