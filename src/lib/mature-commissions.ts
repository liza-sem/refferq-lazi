import { prisma } from '@/lib/prisma';
import { logAuditAction } from '@/lib/audit';

export async function matureDueCommissions(actorId = 'system-cron'): Promise<{
  matured: number;
  affiliatesUpdated: number;
  totalCents: number;
}> {
  const now = new Date();
  const maturedCommissions = await prisma.commission.findMany({
    where: {
      status: 'PENDING',
      maturesAt: { lte: now },
    },
    select: {
      id: true,
      affiliateId: true,
      amountCents: true,
    },
  });

  if (maturedCommissions.length === 0) {
    return { matured: 0, affiliatesUpdated: 0, totalCents: 0 };
  }

  const affiliateUpdates = new Map<string, number>();
  const maturedIds: string[] = [];

  for (const commission of maturedCommissions) {
    maturedIds.push(commission.id);
    affiliateUpdates.set(
      commission.affiliateId,
      (affiliateUpdates.get(commission.affiliateId) || 0) + commission.amountCents
    );
  }

  await prisma.commission.updateMany({
    where: { id: { in: maturedIds }, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedAt: now,
      approvedBy: actorId,
    },
  });

  for (const [affiliateId, totalCents] of affiliateUpdates.entries()) {
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: { balanceCents: { increment: totalCents } },
    });
  }

  const totalCents = Array.from(affiliateUpdates.values()).reduce((sum, value) => sum + value, 0);

  await logAuditAction({
    actorId,
    action: 'MATURE_COMMISSIONS',
    objectType: 'COMMISSION',
    objectId: 'batch',
    payload: {
      count: maturedIds.length,
      totalCents,
      affiliateCount: affiliateUpdates.size,
    },
  });

  return {
    matured: maturedIds.length,
    affiliatesUpdated: affiliateUpdates.size,
    totalCents,
  };
}

/** Force-mature selected PENDING commissions, skipping the refund hold. Used for admin test payouts. */
export async function matureCommissionsByIds(
  commissionIds: string[],
  actorId = 'system-admin',
): Promise<{ matured: number; totalCents: number }> {
  if (commissionIds.length === 0) {
    return { matured: 0, totalCents: 0 };
  }

  const now = new Date();
  const pending = await prisma.commission.findMany({
    where: {
      id: { in: commissionIds },
      status: 'PENDING',
    },
    select: {
      id: true,
      affiliateId: true,
      amountCents: true,
    },
  });

  if (pending.length === 0) {
    return { matured: 0, totalCents: 0 };
  }

  const affiliateUpdates = new Map<string, number>();
  for (const commission of pending) {
    affiliateUpdates.set(
      commission.affiliateId,
      (affiliateUpdates.get(commission.affiliateId) || 0) + commission.amountCents,
    );
  }

  await prisma.commission.updateMany({
    where: { id: { in: pending.map((c) => c.id) }, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedAt: now,
      approvedBy: actorId,
    },
  });

  for (const [affiliateId, totalCents] of affiliateUpdates.entries()) {
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: { balanceCents: { increment: totalCents } },
    });
  }

  const totalCents = Array.from(affiliateUpdates.values()).reduce((sum, value) => sum + value, 0);

  await logAuditAction({
    actorId,
    action: 'MATURE_COMMISSIONS_OVERRIDE',
    objectType: 'COMMISSION',
    objectId: 'batch',
    payload: {
      count: pending.length,
      totalCents,
      commissionIds: pending.map((c) => c.id),
    },
  });

  return { matured: pending.length, totalCents };
}
