const DEFAULT_SITE = 'https://lazi.studio';

export function publicReferralLink(websiteUrl: string | null | undefined, code: string) {
  const base = (websiteUrl || DEFAULT_SITE).replace(/\/$/, '');
  return `${base}/?ref=${encodeURIComponent(code)}`;
}
