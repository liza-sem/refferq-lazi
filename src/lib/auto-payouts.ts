import { prisma } from '@/lib/prisma';
import { logAuditAction } from '@/lib/audit';
import { emailService } from '@/lib/email';
import { isValidPaypalEmail, paypalEmailFromDetails } from '@/lib/onboarding';
import { isPaypalConfigured, sendPaypalPayout } from '@/lib/paypal';

const DEFAULT_DRIP_SIZE = 2;
const MAX_DRIP_SIZE = 10;

export type PayoutRunResult = {
  matured: number;
  processed: number;
  skipped: number;
  failed: number;
  totalAmountCents: number;
  paypalConfigured: boolean;
  autoPayoutEnabled: boolean;
  dripSize: number;
  lastAutoPayoutAt: string | null;
  results: Array<{
    affiliateId: string;
    name: string;
    amountCents?: number;
    payoutId?: string;
    status: string;
    error?: string;
  }>;
};

function clampDripSize(value: number | null | undefined): number {
  if (!value || Number.isNaN(value)) return DEFAULT_DRIP_SIZE;
  return Math.min(MAX_DRIP_SIZE, Math.max(1, Math.floor(value)));
}

function minPayoutCentsFromSettings(settings: {
  minimumPayoutThreshold: number;
  minPayoutCents: number;
} | null): number {
  if (!settings) return 0;
  if (typeof settings.minimumPayoutThreshold === 'number') {
    return Math.max(0, settings.minimumPayoutThreshold);
  }
  return Math.max(0, settings.minPayoutCents || 0);
}

async function markLastRun(settingsId?: string) {
  if (!settingsId) return new Date();
  const now = new Date();
  await prisma.programSettings.update({
    where: { id: settingsId },
    data: { lastAutoPayoutAt: now },
  });
  return now;
}

async function finalizePaidPayout(input: {
  payoutId: string;
  affiliateId: string;
  commissionIds: string[];
  amountCents: number;
  paypalBatchId: string;
  actorId: string;
}) {
  const now = new Date();
  await prisma.$transaction([
    prisma.payout.update({
      where: { id: input.payoutId },
      data: {
        status: 'COMPLETED',
        processedAt: now,
        paypalBatchId: input.paypalBatchId,
      },
    }),
    prisma.commission.updateMany({
      where: { id: { in: input.commissionIds } },
      data: {
        status: 'PAID',
        paidAt: now,
        payoutId: input.payoutId,
      },
    }),
    prisma.affiliate.update({
      where: { id: input.affiliateId },
      data: {
        balanceCents: { decrement: input.amountCents },
      },
    }),
  ]);

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { balanceCents: true },
  });
  if (affiliate && affiliate.balanceCents < 0) {
    await prisma.affiliate.update({
      where: { id: input.affiliateId },
      data: { balanceCents: 0 },
    });
  }

  await logAuditAction({
    actorId: input.actorId,
    action: 'AUTO_PAYOUT_COMPLETED',
    objectType: 'PAYOUT',
    objectId: input.payoutId,
    payload: {
      affiliateId: input.affiliateId,
      amountCents: input.amountCents,
      paypalBatchId: input.paypalBatchId,
    },
  });
}

async function recoverProcessingPayouts(actorId: string) {
  const stuck = await prisma.payout.findMany({
    where: { status: 'PROCESSING', method: 'PAYPAL' },
    include: {
      commissions: { select: { id: true } },
      affiliate: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  const recovered: PayoutRunResult['results'] = [];

  for (const payout of stuck) {
    const email = payout.recipientEmail;
    if (!email || !isValidPaypalEmail(email)) continue;

    try {
      const settings = await prisma.programSettings.findFirst();
      const sent = await sendPaypalPayout({
        senderBatchId: payout.id,
        receiverEmail: email,
        amountCents: payout.amountCents,
        currency: settings?.currency || 'USD',
        note: `LAZI commission payout ${payout.id}`,
      });

      await finalizePaidPayout({
        payoutId: payout.id,
        affiliateId: payout.affiliateId,
        commissionIds: payout.commissions.map((c) => c.id),
        amountCents: payout.amountCents,
        paypalBatchId: sent.payoutBatchId,
        actorId,
      });

      try {
        if (payout.affiliate.user.email) {
          await emailService.sendPayoutCompletedEmail(payout.affiliate.user.email, {
            affiliateName: payout.affiliate.user.name || 'Partner',
            amountCents: payout.amountCents,
            commissionCount: payout.commissionCount,
            payoutId: payout.id,
            method: 'PayPal',
            processedAt: new Date().toISOString(),
          });
        }
      } catch (emailError) {
        console.error('Failed to send recovered payout email:', emailError);
      }

      recovered.push({
        affiliateId: payout.affiliateId,
        name: payout.affiliate.user.name,
        amountCents: payout.amountCents,
        payoutId: payout.id,
        status: sent.duplicate ? 'RECOVERED_DUPLICATE' : 'RECOVERED',
      });
    } catch (error) {
      recovered.push({
        affiliateId: payout.affiliateId,
        name: payout.affiliate.user.name,
        payoutId: payout.id,
        status: 'FAILED',
        error: (error as Error).message,
      });
    }
  }

  return recovered;
}

export async function runAutoPayouts(input: {
  actorId: string;
  dripSize?: number;
}): Promise<PayoutRunResult> {
  const settings = await prisma.programSettings.findFirst();
  const dripSize = clampDripSize(input.dripSize ?? settings?.autoPayoutDripSize);
  const autoPayoutEnabled = settings?.autoPayoutEnabled !== false;
  const minPayoutCents = minPayoutCentsFromSettings(settings);
  const currency = settings?.currency || 'USD';

  const empty = async (extra: Partial<PayoutRunResult> = {}): Promise<PayoutRunResult> => {
    const last = await markLastRun(settings?.id);
    return {
      matured: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      totalAmountCents: 0,
      paypalConfigured: isPaypalConfigured(),
      autoPayoutEnabled,
      dripSize,
      lastAutoPayoutAt: last.toISOString(),
      results: [],
      ...extra,
    };
  };

  if (!autoPayoutEnabled) {
    return empty();
  }

  if (!isPaypalConfigured()) {
    return empty();
  }

  const recovered = await recoverProcessingPayouts(input.actorId);

  const approved = await prisma.commission.findMany({
    where: {
      status: 'APPROVED',
      payoutId: null,
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: {
      affiliate: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  type Eligible = {
    affiliateId: string;
    userId: string;
    name: string;
    userEmail: string;
    paypalEmail: string;
    amountCents: number;
    commissions: Array<(typeof approved)[number]>;
  };

  const grouped = new Map<string, Eligible>();
  let skipped = 0;

  for (const commission of approved) {
    const paypalEmail = paypalEmailFromDetails(commission.affiliate.payoutDetails);
    if (!isValidPaypalEmail(paypalEmail)) {
      skipped += 1;
      continue;
    }

    let entry = grouped.get(commission.affiliateId);
    if (!entry) {
      entry = {
        affiliateId: commission.affiliateId,
        userId: commission.affiliate.userId,
        name: commission.affiliate.user.name,
        userEmail: commission.affiliate.user.email,
        paypalEmail,
        amountCents: 0,
        commissions: [],
      };
      grouped.set(commission.affiliateId, entry);
    }
    entry.commissions.push(commission);
    entry.amountCents += commission.amountCents;
  }

  const eligible = [...grouped.values()].filter((entry) => entry.amountCents >= minPayoutCents);
  skipped += [...grouped.values()].filter((entry) => entry.amountCents < minPayoutCents).length;
  const batch = eligible.slice(0, dripSize);

  const results: PayoutRunResult['results'] = [...recovered];
  let processed = recovered.filter((r) => r.status.startsWith('RECOVERED')).length;
  let failed = recovered.filter((r) => r.status === 'FAILED').length;
  let totalAmountCents = recovered
    .filter((r) => r.status.startsWith('RECOVERED'))
    .reduce((sum, r) => sum + (r.amountCents || 0), 0);

  for (const entry of batch) {
    const commissionIds = entry.commissions.map((c) => c.id);
    let claimedPayoutId: string | null = null;

    try {
      const claimed = await prisma.$transaction(async (tx) => {
        const stillOpen = await tx.commission.findMany({
          where: { id: { in: commissionIds }, status: 'APPROVED', payoutId: null },
          select: { id: true, amountCents: true },
        });
        if (stillOpen.length === 0) return null;

        const amountCents = stillOpen.reduce((sum, c) => sum + c.amountCents, 0);
        const payout = await tx.payout.create({
          data: {
            affiliateId: entry.affiliateId,
            userId: entry.userId,
            amountCents,
            commissionCount: stillOpen.length,
            status: 'PROCESSING',
            method: 'PAYPAL',
            recipientEmail: entry.paypalEmail,
            notes: 'Auto-payout via PayPal Payouts',
            createdBy: input.actorId,
          },
        });

        await tx.commission.updateMany({
          where: { id: { in: stillOpen.map((c) => c.id) } },
          data: { payoutId: payout.id },
        });

        return { payout, amountCents, commissionIds: stillOpen.map((c) => c.id) };
      });

      if (!claimed) {
        skipped += 1;
        continue;
      }
      claimedPayoutId = claimed.payout.id;

      const sent = await sendPaypalPayout({
        senderBatchId: claimed.payout.id,
        receiverEmail: entry.paypalEmail,
        amountCents: claimed.amountCents,
        currency,
        note: `LAZI commission payout ${claimed.payout.id}`,
      });

      await finalizePaidPayout({
        payoutId: claimed.payout.id,
        affiliateId: entry.affiliateId,
        commissionIds: claimed.commissionIds,
        amountCents: claimed.amountCents,
        paypalBatchId: sent.payoutBatchId,
        actorId: input.actorId,
      });

      try {
        if (entry.userEmail) {
          await emailService.sendPayoutCompletedEmail(entry.userEmail, {
            affiliateName: entry.name || 'Partner',
            amountCents: claimed.amountCents,
            commissionCount: claimed.commissionIds.length,
            payoutId: claimed.payout.id,
            method: 'PayPal',
            processedAt: new Date().toISOString(),
          });
        }
      } catch (emailError) {
        console.error('Failed to send payout completed email:', emailError);
      }

      processed += 1;
      totalAmountCents += claimed.amountCents;
      results.push({
        affiliateId: entry.affiliateId,
        name: entry.name,
        amountCents: claimed.amountCents,
        payoutId: claimed.payout.id,
        status: 'PAID',
      });
    } catch (error) {
      failed += 1;
      const message = (error as Error).message;
      results.push({
        affiliateId: entry.affiliateId,
        name: entry.name,
        amountCents: entry.amountCents,
        status: 'FAILED',
        error: message,
      });

      if (claimedPayoutId) {
        await prisma.$transaction([
          prisma.commission.updateMany({
            where: { payoutId: claimedPayoutId, status: 'APPROVED' },
            data: { payoutId: null },
          }),
          prisma.payout.update({
            where: { id: claimedPayoutId },
            data: {
              status: 'FAILED',
              notes: `Auto-payout failed: ${message}`.slice(0, 500),
            },
          }),
        ]);
      }
    }
  }

  const last = await markLastRun(settings?.id);

  return {
    matured: 0,
    processed,
    skipped,
    failed,
    totalAmountCents,
    paypalConfigured: true,
    autoPayoutEnabled,
    dripSize,
    lastAutoPayoutAt: last.toISOString(),
    results,
  };
}

export async function getAutoPayoutStatus() {
  const settings = await prisma.programSettings.findFirst();
  const minPayoutCents = minPayoutCentsFromSettings(settings);
  const dripSize = clampDripSize(settings?.autoPayoutDripSize);

  const approved = await prisma.commission.findMany({
    where: {
      status: 'APPROVED',
      payoutId: null,
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: { affiliate: { select: { payoutDetails: true } } },
  });

  const eligibleAffiliateIds = new Set<string>();
  let totalPendingCents = 0;
  for (const commission of approved) {
    const email = paypalEmailFromDetails(commission.affiliate.payoutDetails);
    if (!isValidPaypalEmail(email)) continue;
    eligibleAffiliateIds.add(commission.affiliateId);
    totalPendingCents += commission.amountCents;
  }

  const recentPayouts = await prisma.payout.findMany({
    where: { method: 'PAYPAL', notes: { contains: 'Auto-payout' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  return {
    config: {
      autoPayoutEnabled: settings?.autoPayoutEnabled !== false,
      autoPayoutDripSize: dripSize,
      minPayoutCents,
      commissionHoldDays: settings?.commissionHoldDays ?? 30,
      payoutFrequency: settings?.payoutFrequency || 'MONTHLY',
      lastAutoPayoutAt: settings?.lastAutoPayoutAt?.toISOString() || null,
      paypalConfigured: isPaypalConfigured(),
      paypalMode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
    },
    stats: {
      eligibleAffiliates: eligibleAffiliateIds.size,
      totalPendingCents,
    },
    recentPayouts: recentPayouts.map((payout) => ({
      id: payout.id,
      affiliateName: payout.user.name,
      affiliateEmail: payout.user.email,
      amountCents: payout.amountCents,
      status: payout.status,
      createdAt: payout.createdAt,
      processedAt: payout.processedAt,
    })),
  };
}
