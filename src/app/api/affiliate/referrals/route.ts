import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';

export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);

    // Get user from database

    // Get user from database
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

    // Get user from database

    // Get user from database
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

    const referrals = await prisma.referral.findMany({
      where: {
        affiliateId: user.affiliate.id,
        NOT: { leadEmail: { endsWith: '@tracking.internal' } },
      },
      orderBy: { createdAt: 'desc' }
    });

    // Map referrals to include estimatedValue from metadata
    const mappedReferrals = referrals.map((ref: any) => {
      const metadata = ref.metadata as any;
      return {
        ...ref,
        estimatedValue: Number(metadata?.estimated_value) || 0,
        company: metadata?.company || '',
      };
    });

    return NextResponse.json({
      success: true,
      referrals: mappedReferrals,
    });
  } catch (error) {
    console.error('Get referrals API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}