const SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const LIVE_API = 'https://api-m.paypal.com';

type PayPalTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type PayPalPayoutResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
    sender_batch_header?: { sender_batch_id?: string };
  };
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
};

export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function paypalApiBase(): string {
  return process.env.PAYPAL_MODE === 'live' ? LIVE_API : SANDBOX_API;
}

function formatPaypalAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error('PayPal is not configured');
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = (await res.json()) as PayPalTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'PayPal authentication failed');
  }
  return data.access_token;
}

function isDuplicateBatch(status: number, body: PayPalPayoutResponse): boolean {
  if (status !== 400) return false;
  const issue = body.details?.[0]?.issue || '';
  const message = `${body.name || ''} ${body.message || ''} ${issue}`.toUpperCase();
  return (
    issue === 'SENDER_BATCH_ID_ALREADY_EXISTS' ||
    message.includes('ALREADY_EXISTS') ||
    message.includes('DUPLICATE')
  );
}

export async function sendPaypalPayout(input: {
  senderBatchId: string;
  receiverEmail: string;
  amountCents: number;
  currency: string;
  note?: string;
}): Promise<{ payoutBatchId: string; duplicate: boolean }> {
  if (input.amountCents < 1) {
    throw new Error('Payout amount must be at least 1 cent');
  }

  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: 'You have a payout from LAZI',
        email_message: 'You received a commission payout from the LAZI partner program.',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: formatPaypalAmount(input.amountCents),
            currency: (input.currency || 'USD').toUpperCase(),
          },
          receiver: input.receiverEmail,
          note: input.note || 'LAZI partner commission',
          sender_item_id: input.senderBatchId,
        },
      ],
    }),
  });

  const data = (await res.json()) as PayPalPayoutResponse;
  if (isDuplicateBatch(res.status, data)) {
    return {
      payoutBatchId: data.batch_header?.payout_batch_id || input.senderBatchId,
      duplicate: true,
    };
  }

  if (!res.ok) {
    const detail = data.details?.[0]?.description || data.details?.[0]?.issue;
    throw new Error(detail || data.message || data.name || `PayPal payout failed (${res.status})`);
  }

  const payoutBatchId = data.batch_header?.payout_batch_id;
  if (!payoutBatchId) {
    throw new Error('PayPal payout succeeded without a batch id');
  }

  return { payoutBatchId, duplicate: false };
}
