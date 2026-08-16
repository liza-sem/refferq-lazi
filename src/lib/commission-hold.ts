import { prisma } from '@/lib/prisma';

export const DEFAULT_COMMISSION_HOLD_DAYS = 30;

export function resolveHoldDays(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_COMMISSION_HOLD_DAYS;
  return Math.max(0, Math.floor(value));
}

export function commissionMaturesAt(holdDays: number, from = new Date()): Date {
  const maturesAt = new Date(from);
  const days = resolveHoldDays(holdDays);
  if (days > 0) maturesAt.setDate(maturesAt.getDate() + days);
  return maturesAt;
}

/** APPROVED, unpaid, and past the chargeback hold. */
export function maturedUnpaidWhere(now = new Date()) {
  return {
    status: 'APPROVED' as const,
    payoutId: null,
    OR: [{ maturesAt: null }, { maturesAt: { lte: now } }],
  };
}

export function isCommissionMatured(
  commission: { status: string; maturesAt?: Date | null },
  now = new Date(),
): boolean {
  if (commission.status !== 'APPROVED') return false;
  if (!commission.maturesAt) return true;
  return commission.maturesAt.getTime() <= now.getTime();
}

/** Create a sale commission. Hold 0 → APPROVED and payable now; otherwise PENDING until maturesAt. */
export async function createSaleCommission(input: {
  conversionId: string;
  affiliateId: string;
  userId: string;
  amountCents: number;
  rate: number;
  holdDays: number;
}) {
  if (input.amountCents <= 0) return null;

  const holdDays = resolveHoldDays(input.holdDays);
  const now = new Date();
  const approveNow = holdDays === 0;

  const commission = await prisma.commission.create({
    data: {
      conversionId: input.conversionId,
      affiliateId: input.affiliateId,
      userId: input.userId,
      amountCents: input.amountCents,
      rate: input.rate,
      status: approveNow ? 'APPROVED' : 'PENDING',
      maturesAt: commissionMaturesAt(holdDays, now),
      approvedAt: approveNow ? now : undefined,
      approvedBy: approveNow ? 'system' : undefined,
    },
  });

  if (approveNow) {
    await prisma.affiliate.update({
      where: { id: input.affiliateId },
      data: { balanceCents: { increment: input.amountCents } },
    });
  }

  return commission;
}

/** Mark unpaid PENDING commissions due now and mature them (balance + APPROVED). Safe to re-run. */
export async function releaseHeldCommissions(actorId = 'system-zero-hold'): Promise<number> {
  const now = new Date();
  await prisma.commission.updateMany({
    where: { status: 'PENDING', payoutId: null },
    data: { maturesAt: now },
  });
  const { matureDueCommissions } = await import('@/lib/mature-commissions');
  const result = await matureDueCommissions(actorId);
  return result.matured;
}

/**
 * Put unpaid APPROVED commissions back on hold when the sale is still inside
 * the chargeback window. Does not touch PAID or rows already in a payout.
 * Sales older than the hold stay APPROVED.
 */
export async function reholdImmatureApprovals(
  holdDays: number,
  now = new Date(),
): Promise<{ restored: number; totalCents: number }> {
  const days = resolveHoldDays(holdDays);
  if (days <= 0) return { restored: 0, totalCents: 0 };

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const candidates = await prisma.commission.findMany({
    where: {
      status: 'APPROVED',
      payoutId: null,
      OR: [
        { createdAt: { gt: cutoff } },
        { conversion: { createdAt: { gt: cutoff } } },
      ],
    },
    select: {
      id: true,
      affiliateId: true,
      amountCents: true,
      createdAt: true,
      conversion: { select: { createdAt: true } },
    },
  });

  const toRestore = candidates.filter((row) => {
    const saleAt = row.conversion?.createdAt || row.createdAt;
    return saleAt.getTime() > cutoff.getTime();
  });

  if (toRestore.length === 0) return { restored: 0, totalCents: 0 };

  const affiliateDeltas = new Map<string, number>();
  for (const row of toRestore) {
    affiliateDeltas.set(row.affiliateId, (affiliateDeltas.get(row.affiliateId) || 0) + row.amountCents);
  }

  await prisma.$transaction(async (tx) => {
    for (const row of toRestore) {
      const saleAt = row.conversion?.createdAt || row.createdAt;
      await tx.commission.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          maturesAt: commissionMaturesAt(days, saleAt),
          approvedAt: null,
          approvedBy: null,
        },
      });
    }
    for (const [affiliateId, cents] of affiliateDeltas.entries()) {
      await tx.affiliate.update({
        where: { id: affiliateId },
        data: { balanceCents: { decrement: cents } },
      });
    }
  });

  return {
    restored: toRestore.length,
    totalCents: Array.from(affiliateDeltas.values()).reduce((sum, value) => sum + value, 0),
  };
}
