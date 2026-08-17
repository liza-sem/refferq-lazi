import { paypalEmailFromDetails } from '@/lib/onboarding';

export type PaypalCsvRow = {
  email: string;
  amountCents: number;
  currency: string;
  customerId: string;
  note?: string;
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value) || /^[=+\-@\t]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** PayPal Payouts web-upload CSV: Email/Phone, Amount, Currency, Customer ID, Note. */
export function paypalPayoutsCsv(rows: PaypalCsvRow[], note = 'LAZI partner payout'): string {
  const header = 'Email/Phone,Amount,Currency,Customer ID,Note';
  const body = rows.map((row) => [
    csvCell(row.email),
    (row.amountCents / 100).toFixed(2),
    csvCell((row.currency || 'USD').toUpperCase()),
    csvCell(row.customerId.slice(0, 30)),
    csvCell(row.note || note),
  ].join(','));
  return [header, ...body].join('\n');
}

export function paypalCsvFilename(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `paypal-payouts-${y}-${m}-${d}.csv`;
}

export function paypalEmailForCsv(payoutDetails: unknown, fallbackEmail: string): string {
  return paypalEmailFromDetails(payoutDetails) || fallbackEmail.trim().toLowerCase();
}
