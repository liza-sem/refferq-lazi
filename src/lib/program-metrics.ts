/** Shared count / money definitions used by admin and affiliate surfaces. */

/** Lead: an identified referred person, not a click-tracking placeholder. */
export const realLeadWhere = {
  NOT: { leadEmail: { endsWith: '@tracking.internal' } },
} as const;

/** Customer / conversion: a real lead whose sale is confirmed (Stripe or admin). */
export const approvedCustomerWhere = {
  status: 'APPROVED' as const,
  NOT: { leadEmail: { endsWith: '@tracking.internal' } },
};

/** Confirmed revenue: Stripe (or recorded) purchase amounts that were not rejected. */
export const confirmedPurchaseWhere = {
  eventType: 'PURCHASE' as const,
  status: { not: 'REJECTED' as const },
};

/** Commission owed: earned, not in a PayPal payout, and not SUCCESS yet. */
export const owedCommissionWhere = {
  status: { in: ['PENDING' as const, 'APPROVED' as const] },
  payoutId: null,
};

/** Partner earnings: all commissions except cancelled / clawed back. */
export const earnedCommissionWhere = {
  status: { notIn: ['CANCELLED' as const, 'CLAWBACK' as const] },
};
