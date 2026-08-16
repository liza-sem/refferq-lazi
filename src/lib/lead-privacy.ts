import { isClickPlaceholderEmail } from './money';

export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@') || isClickPlaceholderEmail(email)) {
    return '';
  }
  const [local, domain] = email.split('@');
  const first = (local.charAt(0) || 'c').toLowerCase();
  const tld = domain.split('.').pop() || 'com';
  return `${first}***@***.${tld}`;
}

export function customerLabel(createdAt: Date | string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Customer';
  return `Customer · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function countryFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const country = (metadata as Record<string, unknown>).country;
  return typeof country === 'string' && country.trim() ? country.trim().toUpperCase() : null;
}

export type AffiliateLeadView = {
  id: string;
  publicId: string;
  status: string;
  createdAt: Date | string;
  amountCents: number;
  country: string | null;
  label: string;
  maskedEmail: string;
};

export function toAffiliateLead(input: {
  id: string;
  publicId?: string | null;
  status: string;
  createdAt: Date | string;
  leadEmail?: string | null;
  metadata?: unknown;
  conversions?: { amountCents: number; status: string }[];
}): AffiliateLeadView {
  const meta = (input.metadata || {}) as Record<string, unknown>;
  const conversionCents = (input.conversions || [])
    .filter((c) => c.status !== 'REJECTED')
    .reduce((sum, c) => sum + (c.amountCents || 0), 0);
  const estimatedCents = Math.round((Number(meta.estimated_value) || 0) * 100);

  return {
    id: input.id,
    publicId: input.publicId || input.id.slice(-8).toUpperCase(),
    status: input.status,
    createdAt: input.createdAt,
    amountCents: conversionCents || estimatedCents,
    country: countryFromMetadata(input.metadata),
    label: customerLabel(input.createdAt),
    maskedEmail: maskEmail(input.leadEmail),
  };
}
