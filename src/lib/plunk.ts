type SendArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  body?: string;
  from?: string;
};

function plunkConfig() {
  const apiUrl = (process.env.PLUNK_API_URL || 'https://next-api.useplunk.com').replace(/\/$/, '');
  const secretKey = process.env.PLUNK_SECRET_KEY || '';
  const fromEmail = process.env.PLUNK_FROM_EMAIL || 'hello@lazi.studio';
  const fromName = process.env.PLUNK_FROM_NAME || 'LAZI';

  if (!secretKey) {
    throw new Error('PLUNK_SECRET_KEY environment variable is not set');
  }

  return { apiUrl, secretKey, fromEmail, fromName };
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { apiUrl, secretKey, fromEmail, fromName } = plunkConfig();

    const response = await fetch(`${apiUrl}/v1/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: params.to,
        from: fromEmail,
        name: fromName,
        subject: params.subject,
        body: params.html,
        subscribed: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Plunk send failed:', response.status, text);
      return { success: false, message: 'Failed to send email' };
    }

    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, message: 'Failed to send email' };
  }
}

/** Drop-in for the old Resend client so existing call sites keep working. */
export const resend = {
  emails: {
    async send(args: SendArgs) {
      const to = Array.isArray(args.to) ? args.to[0] : args.to;
      const html = args.html || args.body || '';
      const result = await sendTransactionalEmail({
        to,
        subject: args.subject,
        html,
      });

      if (!result.success) {
        return { data: null, error: { message: result.message } };
      }

      return { data: { id: 'plunk' }, error: null };
    },
  },
};
