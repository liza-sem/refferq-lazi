const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function paypalEmailFromDetails(payoutDetails: unknown): string {
  if (!payoutDetails || typeof payoutDetails !== 'object') return '';
  const email = (payoutDetails as { paymentEmail?: unknown }).paymentEmail;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isPaypalOnboardingComplete(payoutDetails: unknown): boolean {
  const email = paypalEmailFromDetails(payoutDetails);
  if (!EMAIL_RE.test(email)) return false;

  if (!payoutDetails || typeof payoutDetails !== 'object') return false;
  const method = (payoutDetails as { paymentMethod?: unknown }).paymentMethod;
  return !method || method === 'PayPal';
}

export function isValidPaypalEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
}
