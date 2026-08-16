const ACCENT = '#0033ff';
const PAGE = '#fafafa';
const CARD = '#ffffff';
const BORDER = '#e5e5e5';
const TEXT = '#111111';
const MUTED = '#737373';
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export const EMAIL_WORDMARK = 'LAZI STUDIO PARTNERS';

export type LaziEmailDetail = { label: string; value: string };

export type LaziEmailLayoutInput = {
  preheader?: string;
  kicker?: string;
  heading: string;
  intro?: string;
  paragraphs?: string[];
  details?: LaziEmailDetail[];
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
  wordmark?: string;
};

export function wrapLaziEmail(input: LaziEmailLayoutInput): string {
  const wordmark = input.wordmark || EMAIL_WORDMARK;
  const paragraphs = [
    ...(input.intro ? [input.intro] : []),
    ...(input.paragraphs || []),
  ];
  const detailsRows = (input.details || [])
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${MUTED};width:140px;vertical-align:top;">${row.label}</td>
          <td style="padding:8px 0;font-family:${SANS};font-size:15px;color:${TEXT};font-weight:500;">${row.value}</td>
        </tr>`
    )
    .join('');

  const paragraphHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${TEXT};">${p}</p>`
    )
    .join('');

  const kicker = input.kicker
    ? `<div style="font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};margin:0 0 12px 0;">${input.kicker}</div>`
    : '';

  const detailsBlock = detailsRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">${detailsRows}</table>`
    : '';

  const footer = input.footer
    || 'You can turn these emails off in partner settings.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${input.heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${input.preheader || input.heading}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE};">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="width:560px;max-width:560px;">
        <tr>
          <td align="center" style="padding-bottom:20px;font-family:${SANS};font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:${ACCENT};font-weight:600;">
            ${wordmark}
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="width:560px;max-width:560px;background-color:${CARD};border:1px solid ${BORDER};border-radius:8px;">
        <tr>
          <td style="padding:40px 40px 16px 40px;">
            ${kicker}
            <h1 style="margin:0 0 20px 0;font-family:${SANS};font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${TEXT};">${input.heading}</h1>
            ${paragraphHtml}
            ${detailsBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 40px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${ACCENT};border-radius:6px;">
                  <a href="${input.ctaUrl}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;">${input.ctaLabel}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="width:560px;max-width:560px;">
        <tr>
          <td align="center" style="padding:24px 16px 0 16px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export const SHARED_EMAIL_VARIABLES = [
  { name: 'name', desc: 'Partner name' },
  { name: 'email', desc: 'Partner email' },
  { name: 'companyName', desc: 'Company name (LAZI)' },
  { name: 'dashboardUrl', desc: 'Partner dashboard link' },
  { name: 'referralCode', desc: 'Partner referral code' },
];

export type EmailCatalogEntry = {
  value: string;
  label: string;
  event: string;
  aliases: string[];
  variables: { name: string; desc: string }[];
  defaultSubject: string;
};

export const EMAIL_TEMPLATE_CATALOG: EmailCatalogEntry[] = [
  {
    value: 'WELCOME',
    label: 'Welcome',
    event: 'When a partner is invited or signs up',
    aliases: ['WELCOME_EMAIL', 'PARTNER_INVITATION'],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'code', desc: 'Referral code' },
      { name: 'publicReferralLink', desc: 'Public referral URL (lazi.studio/?ref=CODE)' },
      { name: 'referralLink', desc: 'Same as publicReferralLink' },
    ],
    defaultSubject: 'Welcome to the {{companyName}} partner program',
  },
  {
    value: 'OTP',
    label: 'Login code',
    event: 'When a partner or admin requests a login code',
    aliases: [],
    variables: [
      { name: 'name', desc: 'Recipient name' },
      { name: 'email', desc: 'Recipient email' },
      { name: 'code', desc: 'One-time login code' },
      { name: 'companyName', desc: 'Company name (LAZI)' },
    ],
    defaultSubject: 'Your login code',
  },
  {
    value: 'APPROVAL',
    label: 'Partner approved',
    event: 'When a partner application is approved',
    aliases: ['PARTNER_APPROVAL'],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'reason', desc: 'Optional note' },
    ],
    defaultSubject: 'Your {{companyName}} partner account is approved',
  },
  {
    value: 'REJECTION',
    label: 'Partner rejected',
    event: 'When a partner application is declined',
    aliases: ['PARTNER_DECLINED'],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'reason', desc: 'Decline reason' },
    ],
    defaultSubject: 'Update on your {{companyName}} partner application',
  },
  {
    value: 'SALE_EARNED',
    label: 'Sale earned',
    event: 'When Stripe confirms a referred sale',
    aliases: ['REFERRAL_CONVERTED'],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'amount', desc: 'Sale amount' },
      { name: 'commission', desc: 'Commission earned' },
      { name: 'commissionRate', desc: 'Commission rate, e.g. 20%' },
      { name: 'leadId', desc: 'Public lead reference, e.g. LD-A3K9' },
      { name: 'reference', desc: 'Same as leadId' },
    ],
    defaultSubject: 'You earned a sale',
  },
  {
    value: 'PAYOUT',
    label: 'Payout sent',
    event: 'When a payout is marked paid / sent',
    aliases: ['PARTNER_PAID', 'PAYOUT_GENERATED'],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'amount', desc: 'Payout amount' },
    ],
    defaultSubject: 'Your payout is on the way',
  },
  {
    value: 'TIER_UPGRADED',
    label: 'Tier upgraded',
    event: 'When a partner is promoted to a higher tier',
    aliases: [],
    variables: [
      ...SHARED_EMAIL_VARIABLES,
      { name: 'tierName', desc: 'New tier name' },
      { name: 'previousTier', desc: 'Previous tier name' },
      { name: 'commissionRate', desc: 'New commission rate' },
    ],
    defaultSubject: "You've been upgraded to {{tierName}}",
  },
  {
    value: 'NOTIFICATION',
    label: 'Other notification',
    event: 'Unused catch-all. Prefer a specific type above.',
    aliases: ['NEW_REFERRAL', 'FIRST_REFERRAL', 'COMMISSION_APPROVED'],
    variables: SHARED_EMAIL_VARIABLES,
    defaultSubject: '{{companyName}} notification',
  },
];

export function catalogForType(type: string): EmailCatalogEntry | undefined {
  const exact = EMAIL_TEMPLATE_CATALOG.find((item) => item.value === type);
  if (exact) return exact;
  return EMAIL_TEMPLATE_CATALOG.find((item) => item.aliases.includes(type));
}

export function lookupTypesFor(primary: string): string[] {
  const exact = EMAIL_TEMPLATE_CATALOG.find((item) => item.value === primary);
  if (exact) return [exact.value, ...exact.aliases];
  return [primary];
}

export function defaultBodies(): Record<string, string> {
  const dash = '{{dashboardUrl}}';
  return {
    WELCOME: wrapLaziEmail({
      preheader: 'Your partner account is ready.',
      kicker: 'Partners',
      heading: 'Welcome to the program',
      intro: 'Hi {{name}},',
      paragraphs: [
        'Your {{companyName}} partner account is ready. Share your referral link to start earning.',
      ],
      details: [
        { label: 'Referral code', value: '{{referralCode}}' },
        { label: 'Your link', value: '{{publicReferralLink}}' },
      ],
      ctaLabel: 'Open partner dashboard',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
    OTP: wrapLaziEmail({
      preheader: 'Your login code.',
      kicker: 'Sign in',
      heading: 'Your login code',
      intro: 'Hi {{name}},',
      paragraphs: [
        'Use this code to sign in. It expires in 10 minutes.',
      ],
      details: [{ label: 'Code', value: '{{code}}' }],
      ctaLabel: 'Sign in',
      ctaUrl: dash,
      footer: 'If you did not request this code, you can ignore this email.',
      wordmark: EMAIL_WORDMARK,
    }),
    APPROVAL: wrapLaziEmail({
      preheader: 'Your partner account is approved.',
      kicker: 'Partners',
      heading: "You're in",
      intro: 'Hi {{name}},',
      paragraphs: [
        'Your {{companyName}} partner application was approved. You can start sharing your referral link.',
      ],
      ctaLabel: 'Open partner dashboard',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
    REJECTION: wrapLaziEmail({
      preheader: 'An update on your application.',
      kicker: 'Partners',
      heading: 'Application update',
      intro: 'Hi {{name}},',
      paragraphs: [
        'We are not able to approve your {{companyName}} partner application at this time.',
        '{{reason}}',
      ],
      ctaLabel: 'Contact us',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
    SALE_EARNED: wrapLaziEmail({
      preheader: 'A referred sale just came through.',
      kicker: 'Sale',
      heading: 'You earned a sale',
      intro: 'Hi {{name}},',
      paragraphs: [
        'A sale you referred was confirmed.',
      ],
      details: [
        { label: 'Reference', value: '{{leadId}}' },
        { label: 'Sale', value: '{{amount}}' },
        { label: 'Your commission', value: '{{commission}}' },
      ],
      ctaLabel: 'View dashboard',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
    PAYOUT: wrapLaziEmail({
      preheader: 'We sent your commission payout.',
      kicker: 'Payout',
      heading: 'Your payout is on the way',
      intro: 'Hi {{name}},',
      paragraphs: [
        'We sent your commission payout.',
      ],
      details: [
        { label: 'Amount', value: '{{amount}}' },
      ],
      ctaLabel: 'View dashboard',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
    TIER_UPGRADED: wrapLaziEmail({
      preheader: 'You moved up a partner tier.',
      kicker: 'Tier',
      heading: "You've been upgraded",
      intro: 'Hi {{name}},',
      paragraphs: [
        'You have been moved to a higher partner tier. New sales use your updated commission rate.',
      ],
      details: [
        { label: 'New tier', value: '{{tierName}}' },
        { label: 'Commission', value: '{{commissionRate}}' },
      ],
      ctaLabel: 'View dashboard',
      ctaUrl: dash,
      wordmark: EMAIL_WORDMARK,
    }),
  };
}
