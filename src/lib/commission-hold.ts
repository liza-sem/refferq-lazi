import { prisma } from '@/lib/prisma';

export function resolveHoldDays(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function commissionMaturesAt(holdDays: number, now = new Date()): Date {
  const maturesAt = new Date(now);
  const days = resolveHoldDays(holdDays);
  if (days > 0) maturesAt.setDate(maturesAt.getDate() + days);
  return maturesAt;
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
