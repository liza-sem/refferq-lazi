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
  items?: Array<{
    payout_item_id?: string;
    transaction_id?: string;
    transaction_status?: string;
  }>;
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
};

export type PaypalPayoutSnapshot = {
  payoutBatchId: string;
  batchStatus: string;
  items: Array<{
    payoutItemId: string | null;
    transactionStatus: string | null;
  }>;
};

export type PaypalMode = 'sandbox' | 'live';

export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/** Live only when PAYPAL_MODE is exactly `live`. Missing/anything else is sandbox. */
export function paypalMode(): PaypalMode {
  return process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
}

export function paypalApiBase(): string {
  return paypalMode() === 'live' ? LIVE_API : SANDBOX_API;
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
}): Promise<{ payoutBatchId: string; batchStatus: string; duplicate: boolean }> {
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
  const batchStatus = data.batch_header?.batch_status || 'PENDING';
  if (isDuplicateBatch(res.status, data)) {
    return {
      payoutBatchId: data.batch_header?.payout_batch_id || input.senderBatchId,
      batchStatus,
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

  return { payoutBatchId, batchStatus, duplicate: false };
}

export async function getPaypalPayout(payoutBatchId: string): Promise<PaypalPayoutSnapshot> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalApiBase()}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=20&page=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as PayPalPayoutResponse;
  if (!res.ok) {
    const detail = data.details?.[0]?.description || data.details?.[0]?.issue;
    throw new Error(detail || data.message || data.name || `PayPal payout lookup failed (${res.status})`);
  }

  return {
    payoutBatchId: data.batch_header?.payout_batch_id || payoutBatchId,
    batchStatus: data.batch_header?.batch_status || 'PENDING',
    items: (data.items || []).map((item) => ({
      payoutItemId: item.payout_item_id || null,
      transactionStatus: item.transaction_status || null,
    })),
  };
}
