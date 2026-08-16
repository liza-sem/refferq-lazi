import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractTrackingKey, isValidTrackingKey, trackJson, trackOptionsResponse } from '@/lib/tracking-auth';

/**
 * POST /api/track/referral - Track referral clicks
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = extractTrackingKey(req);

    if (!apiKey) {
      return trackJson({ success: false, error: 'API key is required' }, 401);
    }

    if (!(await isValidTrackingKey(apiKey))) {
      return trackJson({ success: false, error: 'Invalid or inactive API key' }, 401);
    }

    const body = await req.json();
    const { referralCode, url, referrer, userAgent, timestamp } = body;

    if (!referralCode) {
      return trackJson({ success: false, error: 'Referral code is required' }, 400);
    }

    // Find affiliate by referral code
    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!affiliate) {
      return trackJson({ success: false, error: 'Invalid referral code' }, 404);
    }

    if (affiliate.user.status !== 'ACTIVE') {
      return trackJson({ success: false, error: 'Affiliate is not active' }, 403);
    }

    // Log the referral click
    console.log('✅ Referral click tracked:', {
      affiliateId: affiliate.id,
      referralCode,
      url,
      referrer,
      timestamp,
    });

    // You can optionally create a ReferralClick record or update stats
    // For now, we'll just log it and return success

    return trackJson({
      success: true,
      message: 'Referral tracked successfully',
      affiliate: {
        name: affiliate.user.name,
        code: affiliate.referralCode,
      },
    });
  } catch (error) {
    console.error('POST /api/track/referral error:', error);
    return trackJson({ success: false, error: 'Failed to track referral' }, 500);
  }
}

export async function OPTIONS() {
  return trackOptionsResponse();
}
