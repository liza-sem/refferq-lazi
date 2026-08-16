import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronOrAdmin } from '@/lib/cron-auth';
import { recordPurchase } from '@/lib/record-purchase';

/**
 * Admin/cron replay of a paid Stripe Checkout session onto recordPurchase.
 * Idempotent on Stripe session id (orderId / stripeSessionId).
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const referralCode = typeof body.referralCode === 'string' ? body.referralCode.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const amountCents = Math.round(Number(body.amountCents));
  if (!referralCode || !orderId || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: 'referralCode, orderId, and a positive amountCents are required' },
      { status: 400 }
    );
  }

  const metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
    ? (body.metadata as Record<string, unknown>)
    : {};

  const result = await recordPurchase({
    referralCode,
    customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail : '',
    customerName: typeof body.customerName === 'string' ? body.customerName : '',
    amountCents,
    currency: typeof body.currency === 'string' ? body.currency : 'usd',
    orderId,
    metadata: {
      source: 'admin_replay',
      stripeSessionId: orderId,
      ...metadata,
    },
  });

  if ('error' in result && result.error) {
    return NextResponse.json({ success: false, attributed: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    success: true,
    attributed: true,
    duplicate: result.duplicate,
    conversionId: result.conversion.id,
    amountCents: result.conversion.amountCents,
  });
}
