export type AdminPurchase = {
  id: string;
  amountCents: number;
  currency: string;
  createdAt: Date | string;
  status: string;
  statusLabel: string;
  productId: string | null;
  priceId: string | null;
  stripeSessionId: string | null;
  paymentIntent: string | null;
};

function stringMeta(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function purchaseStatusLabel(status: string): string {
  if (status === 'APPROVED') return 'Paid';
  if (status === 'REJECTED') return 'Rejected';
  return 'Pending';
}

export function toAdminPurchase(conversion: {
  id: string;
  amountCents: number;
  currency?: string | null;
  createdAt: Date | string;
  status: string;
  eventMetadata?: unknown;
}): AdminPurchase {
  const meta = (conversion.eventMetadata || {}) as Record<string, unknown>;
  return {
    id: conversion.id,
    amountCents: conversion.amountCents,
    currency: (conversion.currency || 'USD').toUpperCase(),
    createdAt: conversion.createdAt,
    status: conversion.status,
    statusLabel: purchaseStatusLabel(conversion.status),
    productId: stringMeta(meta, 'kirby_product_id', 'productId', 'product_id'),
    priceId: stringMeta(meta, 'price_id', 'priceId', 'stripe_price_id'),
    stripeSessionId: stringMeta(meta, 'stripeSessionId', 'orderId'),
    paymentIntent: stringMeta(meta, 'paymentIntent', 'payment_intent'),
  };
}
