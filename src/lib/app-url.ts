const LIVE_HOST = 'https://partners.lazi.studio';

/** Partner portal origin. Never referrals.lazi.studio. */
export function partnerAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || LIVE_HOST).replace(/\/$/, '');
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'referrals.lazi.studio') return LIVE_HOST;
  } catch {
    return LIVE_HOST;
  }
  return raw || LIVE_HOST;
}
