import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { getRequestUserId } from '@/lib/request-user';

function generateReferralCode(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `${cleanName.substr(0, 6)}-${random}`;
}

/**
 * POST /api/affiliate/generate-code - Generate or regenerate referral code
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    
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
        { success: false, error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'AFFILIATE') {
      return NextResponse.json(
        { success: false, error: 'Access denied. Affiliate role required.' },
        { status: 403 }
      );
    }

    let affiliate = user.affiliate;

    // If affiliate record doesn't exist, create it
    if (!affiliate) {
      const referralCode = generateReferralCode(user.name);
      
      const { getOrCreateDefaultPartnerGroup } = await import('@/lib/default-partner-group');
      const defaultGroup = await getOrCreateDefaultPartnerGroup();
      affiliate = await prisma.affiliate.create({
        data: {
          userId: user.id,
          referralCode,
          partnerGroupId: defaultGroup.id,
          payoutDetails: {},
          balanceCents: 0
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Affiliate profile created with referral code',
        affiliate,
      });
    }

    // If affiliate exists but no referral code, generate one
    if (!affiliate.referralCode || affiliate.referralCode.trim() === '') {
      const referralCode = generateReferralCode(user.name);
      
      affiliate = await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { referralCode }
      });

      return NextResponse.json({
        success: true,
        message: 'Referral code generated',
        affiliate,
      });
    }

    // Affiliate already has a referral code
    return NextResponse.json({
      success: true,
      message: 'Referral code already exists',
      affiliate,
    });

  } catch (error) {
    console.error('Generate code API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate referral code' },
      { status: 500 }
    );
  }
}
