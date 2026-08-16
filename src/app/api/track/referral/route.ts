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

    const { recordClick, clientIp } = await import('@/lib/record-click');
    const result = await recordClick({
      affiliateId: affiliate.id,
      ipAddress: clientIp(req),
      userAgent: userAgent || req.headers.get('user-agent'),
      referer: referrer || req.headers.get('referer'),
      metadata: {
        source: 'tracker',
        url,
        timestamp,
      },
    });

    return trackJson({
      success: true,
      duplicate: result.duplicate,
      message: result.duplicate ? 'Referral already counted' : 'Referral tracked successfully',
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
