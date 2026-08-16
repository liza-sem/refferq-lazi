import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { commissionMultiplier, commissionPercent } from '@/lib/commission-rate';
import { realLeadWhere } from '@/lib/program-metrics';
import { backfillReferralPublicIds, normalizeLeadPublicId } from '@/lib/lead-public-id';
import { countryFromMetadata } from '@/lib/lead-privacy';
import { toAdminPurchase } from '@/lib/admin-purchase';

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
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    try {
      await backfillReferralPublicIds();
    } catch (error) {
      console.error('Lead public ID backfill skipped:', error);
    }

    const q = normalizeLeadPublicId(request.nextUrl.searchParams.get('q') || '');

    const referrals = await prisma.referral.findMany({
      where: {
        ...realLeadWhere,
        ...(q
          ? {
              OR: [
                { publicId: { equals: q, mode: 'insensitive' } },
                { publicId: { contains: q.replace(/^LD-?/, ''), mode: 'insensitive' } },
                { leadEmail: { contains: q, mode: 'insensitive' } },
                { leadName: { contains: q, mode: 'insensitive' } },
                { id: q },
              ],
            }
          : {}),
      },
      include: {
        affiliate: {
          include: {
            user: true,
            partnerGroup: { select: { name: true, commissionRate: true } },
          }
        },
        conversions: {
          select: {
            id: true,
            amountCents: true,
            currency: true,
            status: true,
            eventType: true,
            createdAt: true,
            eventMetadata: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const conversionIdsByReferral = referrals.map((r) => r.id);
    const commissions = conversionIdsByReferral.length
      ? await prisma.commission.findMany({
          where: { conversion: { referralId: { in: conversionIdsByReferral } } },
          select: { amountCents: true, conversion: { select: { referralId: true } } },
        })
      : [];
    const commissionByReferral = new Map<string, number>();
    for (const row of commissions) {
      const referralId = row.conversion.referralId;
      if (!referralId) continue;
      commissionByReferral.set(referralId, (commissionByReferral.get(referralId) || 0) + row.amountCents);
    }

    return NextResponse.json({
      success: true,
      referrals: referrals.map(referral => {
        const metadata = referral.metadata as Record<string, unknown> | null;
        const affiliate = referral.affiliate;
        const rate = affiliate.partnerGroup?.commissionRate ?? 20;
        const purchases = referral.conversions.map(toAdminPurchase);
        const confirmedCents = purchases
          .filter((p) => p.status !== 'REJECTED')
          .reduce((sum, p) => sum + p.amountCents, 0);

        return {
          id: referral.id,
          publicId: referral.publicId,
          affiliateId: affiliate.id,
          leadEmail: referral.leadEmail,
          leadName: referral.leadName,
          leadPhone: referral.leadPhone,
          status: referral.status,
          notes: referral.notes,
          createdAt: referral.createdAt,
          estimatedValue: Number(metadata?.estimated_value) || 0,
          confirmedRevenueCents: confirmedCents,
          purchaseCount: purchases.length,
          purchases,
          commissionCents: commissionByReferral.get(referral.id) || Math.round(confirmedCents * commissionMultiplier(rate)),
          company: typeof metadata?.company === 'string' ? metadata.company : '',
          country: countryFromMetadata(metadata),
          affiliate: {
            id: affiliate.id,
            name: affiliate.user.name,
            email: affiliate.user.email,
            referralCode: affiliate.referralCode,
            partnerGroup: affiliate.partnerGroup?.name || 'Default',
            partnerGroupId: affiliate.partnerGroupId,
            commissionRate: rate,
            commissionPercent: commissionPercent(rate),
          }
        };
      })
    });

  } catch (error) {
    console.error('Admin referrals API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
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

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { referralIds, action } = body;

    if (!referralIds || !Array.isArray(referralIds) || referralIds.length === 0) {
      return NextResponse.json(
        { error: 'Referral IDs array is required' },
        { status: 400 }
      );
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    const updatedReferrals = await prisma.referral.updateMany({
      where: {
        id: { in: referralIds },
        status: 'PENDING'
      },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        reviewedBy: user.id,
        reviewedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: `${updatedReferrals.count} referrals ${action}d successfully`,
      updatedCount: updatedReferrals.count
    });

  } catch (error) {
    console.error('Batch referral API error:', error);
    return NextResponse.json(
      { error: 'Failed to process referrals' },
      { status: 500 }
    );
  }
}
