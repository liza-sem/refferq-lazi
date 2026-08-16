import { NextRequest } from 'next/server';
import { extractTrackingKey, isValidTrackingKey, trackJson, trackOptionsResponse } from '@/lib/tracking-auth';

/**
 * Browser conversion pings are ignored. Paid sales are approved only by
 * POST /api/webhook/stripe after Stripe signs checkout.session.completed.
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

    return trackJson({
      success: true,
      ignored: true,
      message: 'Purchases are confirmed by the Stripe webhook, not the browser.',
    });
  } catch (error) {
    console.error('POST /api/track/conversion error:', error);
    return trackJson({ success: false, error: 'Failed to track conversion' }, 500);
  }
}

export async function OPTIONS() {
  return trackOptionsResponse();
}
