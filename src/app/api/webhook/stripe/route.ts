import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { recordPurchase } from '@/lib/record-purchase';

export const runtime = 'nodejs';

function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unused');
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error('Stripe webhook signature failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return NextResponse.json({ received: true, ignored: 'unpaid' });
  }

  const amountCents = session.amount_total ?? 0;
  if (amountCents <= 0) {
    return NextResponse.json({ received: true, ignored: 'zero_amount' });
  }

  const metadata = session.metadata || {};
  const referralCode = metadata.referral_code || metadata.refferq_ref || '';
  if (!referralCode) {
    return NextResponse.json({ received: true, attributed: false, reason: 'no_referral_code' });
  }

  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    metadata.email ||
    '';
  const customerName = session.customer_details?.name || metadata.name || '';

  const result = await recordPurchase({
    referralCode,
    customerEmail,
    customerName,
    amountCents,
    currency: session.currency || 'usd',
    orderId: session.id,
    metadata: {
      source: 'stripe_webhook',
      stripeSessionId: session.id,
      paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      country: session.customer_details?.address?.country || null,
    },
  });

  if ('error' in result && result.error) {
    console.error('Stripe purchase recording failed:', result.error, session.id);
    return NextResponse.json({ received: true, attributed: false, error: result.error });
  }

  return NextResponse.json({
    received: true,
    attributed: true,
    duplicate: result.duplicate,
    conversionId: result.conversion.id,
  });
}
