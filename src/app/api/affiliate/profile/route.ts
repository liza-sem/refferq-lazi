import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { isValidPaypalEmail } from '@/lib/onboarding';
import { commissionPercent } from '@/lib/commission-rate';
import { realLeadWhere } from '@/lib/program-metrics';
import { toAffiliateLead } from '@/lib/lead-privacy';
import { backfillReferralPublicIds } from '@/lib/lead-public-id';
import { nextCalendarPayoutDate, resolvePayoutFrequency } from '@/lib/payout-schedule';
import { resolveHoldDays } from '@/lib/commission-hold';

export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: { include: { partnerGroup: true } }
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

    let affiliate = user.affiliate as any;
    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate profile not found' },
        { status: 404 }
      );
    }

    if (!affiliate.partnerGroupId) {
      const { assignDefaultPartnerGroup } = await import('@/lib/default-partner-group');
      affiliate = await assignDefaultPartnerGroup(affiliate.id);
      affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliate.id },
        include: { partnerGroup: true },
      });
    }

    try {
      await backfillReferralPublicIds();
    } catch (error) {
      console.error('Lead public ID backfill skipped:', error);
    }

    const referrals = await prisma.referral.findMany({
      where: { affiliateId: affiliate.id, ...realLeadWhere },
      include: {
        conversions: { select: { amountCents: true, status: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    const conversions = await prisma.conversion.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' }
    });

    const commissions = await prisma.commission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' }
    });

    const availableEarnings = commissions
      .filter(c => c.status === 'PAID' || c.status === 'APPROVED')
      .reduce((sum, c) => sum + c.amountCents, 0);

    const pendingCommissionsList = commissions.filter(c => c.status === 'PENDING');
    const pendingEarningsCents = pendingCommissionsList.reduce((sum, c) => sum + c.amountCents, 0);

    const totalCommissions = commissions.length;
    const pendingCommissionsCount = pendingCommissionsList.length;
    const totalConversions = conversions.length;
    const totalClicks = await prisma.referralClick.count({
      where: { affiliateId: affiliate.id },
    });
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    const settings = await prisma.programSettings.findFirst();
    const commissionHoldDays = resolveHoldDays(settings?.commissionHoldDays);
    const payoutFrequency = resolvePayoutFrequency(
      affiliate.partnerGroup?.payoutFrequency,
      settings?.payoutFrequency,
    );
    const nextPayoutAt = nextCalendarPayoutDate(payoutFrequency);
    const nextMaturesAt = commissionHoldDays > 0
      ? pendingCommissionsList
          .filter(c => c.maturesAt)
          .sort((a, b) => ((a.maturesAt?.getTime() || 0) - (b.maturesAt?.getTime() || 0)))[0]?.maturesAt || null
      : null;

    const stats = {
      totalEarnings: availableEarnings,
      pendingEarnings: pendingEarningsCents,
      pendingEarningsList: pendingCommissionsList.length,
      nextMaturesAt,
      nextPayoutAt,
      commissionHoldDays,
      payoutFrequency,
      totalCommissions,
      pendingCommissions: pendingCommissionsCount,
      totalConversions,
      totalClicks,
      conversionRate
    };

    const mappedReferrals = referrals.map((ref) => toAffiliateLead(ref));

    const { getCurrencySymbol } = await import('@/lib/currency');
    const currencySymbol = await getCurrencySymbol();
    const { publicReferralLink } = await import('@/lib/referral-link');
    const referralLink = affiliate.referralCode
      ? publicReferralLink(settings?.websiteUrl, affiliate.referralCode)
      : '';
    const commissionRate = commissionPercent(affiliate.partnerGroup?.commissionRate ?? 20);

    const payoutDetails = (affiliate.payoutDetails || {}) as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      affiliate: {
        id: affiliate.id,
        referralCode: affiliate.referralCode,
        balanceCents: affiliate.balanceCents,
        partnerGroup: affiliate.partnerGroup?.name || 'Standard',
        notifySaleEarned: affiliate.notifySaleEarned,
        notifyPayouts: affiliate.notifyPayouts,
        notifyTierUpgraded: affiliate.notifyTierUpgraded,
        payoutDetails: {
          paymentMethod: payoutDetails.paymentMethod || 'PayPal',
          paymentEmail: payoutDetails.paymentEmail || '',
          company: payoutDetails.company || '',
          country: payoutDetails.country || '',
        },
      },
      referralLink,
      announcement: settings?.portalAnnouncement || '',
      stats: {
        ...stats,
        referralLink,
        commissionRate,
      },
      referrals: mappedReferrals,
      conversions: conversions.map((c) => ({
        id: c.id,
        amountCents: c.amountCents,
        currency: c.currency,
        status: c.status,
        eventType: c.eventType,
        createdAt: c.createdAt,
      })),
      commissions: commissions.map((c) => ({
        id: c.id,
        amountCents: c.amountCents,
        status: c.status,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
        maturesAt: c.maturesAt,
      })),
      currencySymbol,
    });
  } catch (error) {
    console.error('Affiliate profile API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliate profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { name, company, email, country, paymentEmail, notifySaleEarned, notifyPayouts, notifyTierUpgraded } = body;

    const userUpdateData: any = {};
    if (name && name.trim()) {
      userUpdateData.name = name.trim();
    }
    if (email && email.trim() && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() }
      });
      if (existingUser && existingUser.id !== user.id) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
      userUpdateData.email = email.trim().toLowerCase();
    }

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData
      });
    }

    if (user.affiliate) {
      const existing = (user.affiliate.payoutDetails as Record<string, unknown>) || {};
      const paypalEmail = typeof paymentEmail === 'string' ? paymentEmail.trim().toLowerCase() : '';

      if (paypalEmail && !isValidPaypalEmail(paypalEmail)) {
        return NextResponse.json(
          { error: 'Enter a valid PayPal email address' },
          { status: 400 }
        );
      }

      await prisma.affiliate.update({
        where: { id: user.affiliate.id },
        data: {
          payoutDetails: {
            ...existing,
            ...(company !== undefined ? { company: String(company).trim() } : {}),
            ...(country !== undefined ? { country } : {}),
            paymentMethod: 'PayPal',
            ...(paypalEmail ? { paymentEmail: paypalEmail } : {}),
          },
          ...(typeof notifySaleEarned === 'boolean' ? { notifySaleEarned } : {}),
          ...(typeof notifyPayouts === 'boolean' ? { notifyPayouts } : {}),
          ...(typeof notifyTierUpgraded === 'boolean' ? { notifyTierUpgraded } : {}),
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Affiliate profile update API error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
