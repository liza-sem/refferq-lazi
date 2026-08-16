import { prisma } from '@/lib/prisma';
import { logAuditAction } from '@/lib/audit';
import { emailService } from '@/lib/email';
import { isValidPaypalEmail, paypalEmailFromDetails } from '@/lib/onboarding';
import { isPaypalConfigured, paypalMode, sendPaypalPayout } from '@/lib/paypal';
import { matureCommissionsByIds } from '@/lib/mature-commissions';
import { getProgramDefaults } from '@/lib/program-defaults';
import {
  isCommissionDue,
  payoutFrequencyLabel,
  resolvePayoutFrequency,
  type PayoutFrequency,
} from '@/lib/payout-schedule';

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
  const programDefaults = await getProgramDefaults();

  const approved = await prisma.commission.findMany({
    where: {
      status: 'APPROVED',
      payoutId: null,
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: {
      affiliate: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
          partnerGroup: { select: { payoutFrequency: true } },
        },
      },
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
    frequency: PayoutFrequency;
    oldestPayableAt: Date;
    commissions: Array<(typeof approved)[number]>;
  };

  const grouped = new Map<string, Eligible>();
  let skipped = 0;
  const now = new Date();

  for (const commission of approved) {
    const paypalEmail = paypalEmailFromDetails(commission.affiliate.payoutDetails);
    if (!isValidPaypalEmail(paypalEmail)) {
      skipped += 1;
      continue;
    }

    const frequency = resolvePayoutFrequency(
      commission.affiliate.partnerGroup?.payoutFrequency,
      programDefaults.payoutFrequency,
    );
    const approvedAt = commission.approvedAt || commission.createdAt;
    if (!isCommissionDue(approvedAt, frequency, now)) continue;

    let entry = grouped.get(commission.affiliateId);
    if (!entry) {
      entry = {
        affiliateId: commission.affiliateId,
        userId: commission.affiliate.userId,
        name: commission.affiliate.user.name,
        userEmail: commission.affiliate.user.email,
        paypalEmail,
        amountCents: 0,
        frequency,
        oldestPayableAt: approvedAt,
        commissions: [],
      };
      grouped.set(commission.affiliateId, entry);
    }
    entry.commissions.push(commission);
    entry.amountCents += commission.amountCents;
    if (approvedAt < entry.oldestPayableAt) entry.oldestPayableAt = approvedAt;
  }

  const aboveMin = [...grouped.values()]
    .filter((entry) => entry.amountCents >= minPayoutCents)
    .sort((a, b) => a.oldestPayableAt.getTime() - b.oldestPayableAt.getTime());
  skipped += [...grouped.values()].filter((entry) => entry.amountCents < minPayoutCents).length;
  const batch = aboveMin.slice(0, dripSize);
  skipped += aboveMin.length - batch.length;

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

export type ManualPayoutResult = {
  success: boolean;
  error?: string;
  blockers: string[];
  matured: number;
  payoutId?: string;
  amountCents?: number;
  commissionCount?: number;
  paypalBatchId?: string;
  paypalMode: 'sandbox' | 'live';
};

export async function runManualPaypalPayout(input: {
  actorId: string;
  affiliateId: string;
  commissionIds?: string[];
  skipHold?: boolean;
}): Promise<ManualPayoutResult> {
  const paypalConfigured = isPaypalConfigured();
  const mode = paypalMode();
  const blockers: string[] = [];

  if (!paypalConfigured) {
    blockers.push('PayPal keys missing — add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
    },
  });

  if (!affiliate) {
    return {
      success: false,
      error: 'Partner not found',
      blockers: ['Partner not found'],
      matured: 0,
      paypalMode: mode,
    };
  }

  const paypalEmail = paypalEmailFromDetails(affiliate.payoutDetails);
  if (!isValidPaypalEmail(paypalEmail)) {
    blockers.push('No PayPal email on this partner. Add a sandbox personal email in their payout details.');
  }

  const whereIds = input.commissionIds && input.commissionIds.length > 0
    ? { id: { in: input.commissionIds } }
    : {};

  const unpaid = await prisma.commission.findMany({
    where: {
      affiliateId: input.affiliateId,
      payoutId: null,
      status: { in: ['PENDING', 'APPROVED'] },
      ...whereIds,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (unpaid.length === 0) {
    blockers.push('No unpaid commissions.');
  }

  const pending = unpaid.filter((c) => c.status === 'PENDING');
  const skipHold = input.skipHold !== false;

  if (pending.length > 0 && !skipHold) {
    blockers.push(
      `${pending.length} commission(s) are still in the refund hold. Check “skip hold” to pay them now for a test.`,
    );
  }

  const payableNow = skipHold ? unpaid : unpaid.filter((c) => c.status === 'APPROVED');
  const amountCents = payableNow.reduce((sum, c) => sum + c.amountCents, 0);
  if (payableNow.length > 0 && amountCents < 1) {
    blockers.push('Payout amount must be at least $0.01.');
  }

  if (blockers.length > 0) {
    return {
      success: false,
      error: blockers[0],
      blockers,
      matured: 0,
      paypalMode: mode,
    };
  }

  let matured = 0;
  if (skipHold && pending.length > 0) {
    const result = await matureCommissionsByIds(pending.map((c) => c.id), input.actorId);
    matured = result.matured;
  }

  const approved = await prisma.commission.findMany({
    where: {
      id: { in: payableNow.map((c) => c.id) },
      status: 'APPROVED',
      payoutId: null,
    },
  });

  if (approved.length === 0) {
    return {
      success: false,
      error: 'No approved commissions to pay.',
      blockers: ['No approved commissions to pay.'],
      matured,
      paypalMode: mode,
    };
  }

  const settings = await prisma.programSettings.findFirst();
  const currency = settings?.currency || 'USD';
  const commissionIds = approved.map((c) => c.id);
  const payAmount = approved.reduce((sum, c) => sum + c.amountCents, 0);

  const claimed = await prisma.$transaction(async (tx) => {
    const stillOpen = await tx.commission.findMany({
      where: { id: { in: commissionIds }, status: 'APPROVED', payoutId: null },
      select: { id: true, amountCents: true },
    });
    if (stillOpen.length === 0) return null;

    const claimedAmount = stillOpen.reduce((sum, c) => sum + c.amountCents, 0);
    const payout = await tx.payout.create({
      data: {
        affiliateId: affiliate.id,
        userId: affiliate.userId,
        amountCents: claimedAmount,
        commissionCount: stillOpen.length,
        status: 'PROCESSING',
        method: 'PAYPAL',
        recipientEmail: paypalEmail,
        notes: skipHold
          ? 'Manual admin payout via PayPal (skipped refund hold / schedule)'
          : 'Manual admin payout via PayPal',
        createdBy: input.actorId,
      },
    });

    await tx.commission.updateMany({
      where: { id: { in: stillOpen.map((c) => c.id) } },
      data: { payoutId: payout.id },
    });

    return { payout, amountCents: claimedAmount, commissionIds: stillOpen.map((c) => c.id) };
  });

  if (!claimed) {
    return {
      success: false,
      error: 'Those commissions were already claimed.',
      blockers: ['Those commissions were already claimed.'],
      matured,
      paypalMode: mode,
    };
  }

  try {
    const sent = await sendPaypalPayout({
      senderBatchId: claimed.payout.id,
      receiverEmail: paypalEmail,
      amountCents: claimed.amountCents,
      currency,
      note: `LAZI test payout ${claimed.payout.id}`,
    });

    await finalizePaidPayout({
      payoutId: claimed.payout.id,
      affiliateId: affiliate.id,
      commissionIds: claimed.commissionIds,
      amountCents: claimed.amountCents,
      paypalBatchId: sent.payoutBatchId,
      actorId: input.actorId,
    });

    try {
      if (affiliate.user.email) {
        await emailService.sendPayoutCompletedEmail(affiliate.user.email, {
          affiliateName: affiliate.user.name || 'Partner',
          amountCents: claimed.amountCents,
          commissionCount: claimed.commissionIds.length,
          payoutId: claimed.payout.id,
          method: 'PayPal',
          processedAt: new Date().toISOString(),
        });
      }
    } catch (emailError) {
      console.error('Failed to send manual payout email:', emailError);
    }

    return {
      success: true,
      blockers: [],
      matured,
      payoutId: claimed.payout.id,
      amountCents: claimed.amountCents,
      commissionCount: claimed.commissionIds.length,
      paypalBatchId: sent.payoutBatchId,
      paypalMode: mode,
    };
  } catch (error) {
    const message = (error as Error).message;
    await prisma.$transaction([
      prisma.commission.updateMany({
        where: { payoutId: claimed.payout.id, status: 'APPROVED' },
        data: { payoutId: null },
      }),
      prisma.payout.update({
        where: { id: claimed.payout.id },
        data: {
          status: 'FAILED',
          notes: `Manual payout failed: ${message}`.slice(0, 500),
        },
      }),
    ]);
    return {
      success: false,
      error: message,
      blockers: [message],
      matured,
      payoutId: claimed.payout.id,
      amountCents: payAmount,
      paypalMode: mode,
    };
  }
}

export async function getAutoPayoutStatus() {
  const settings = await prisma.programSettings.findFirst();
  const programDefaults = await getProgramDefaults();
  const minPayoutCents = minPayoutCentsFromSettings(settings);
  const dripSize = clampDripSize(settings?.autoPayoutDripSize);

  const approved = await prisma.commission.findMany({
    where: {
      status: 'APPROVED',
      payoutId: null,
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: {
      affiliate: {
        select: {
          payoutDetails: true,
          partnerGroup: { select: { payoutFrequency: true } },
        },
      },
    },
  });

  const eligibleAffiliateIds = new Set<string>();
  const grouped = new Map<string, { amountCents: number; frequency: PayoutFrequency }>();
  let totalPendingCents = 0;
  const now = new Date();
  for (const commission of approved) {
    const email = paypalEmailFromDetails(commission.affiliate.payoutDetails);
    if (!isValidPaypalEmail(email)) continue;
    eligibleAffiliateIds.add(commission.affiliateId);
    totalPendingCents += commission.amountCents;
    const frequency = resolvePayoutFrequency(
      commission.affiliate.partnerGroup?.payoutFrequency,
      programDefaults.payoutFrequency,
    );
    const approvedAt = commission.approvedAt || commission.createdAt;
    if (!isCommissionDue(approvedAt, frequency, now)) continue;
    const existing = grouped.get(commission.affiliateId);
    if (!existing) {
      grouped.set(commission.affiliateId, {
        amountCents: commission.amountCents,
        frequency,
      });
    } else {
      existing.amountCents += commission.amountCents;
    }
  }

  let payableThisRun = 0;
  for (const entry of grouped.values()) {
    if (entry.amountCents >= minPayoutCents) payableThisRun += 1;
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
      commissionHoldDays: settings?.commissionHoldDays ?? 0,
      refundHoldDays: programDefaults.commissionHoldDays,
      cookieDuration: programDefaults.cookieDuration,
      payoutFrequency: programDefaults.payoutFrequency,
      payoutFrequencyLabel: payoutFrequencyLabel(programDefaults.payoutFrequency),
      lastAutoPayoutAt: settings?.lastAutoPayoutAt?.toISOString() || null,
      paypalConfigured: isPaypalConfigured(),
      paypalMode: paypalMode(),
    },
    stats: {
      eligibleAffiliates: eligibleAffiliateIds.size,
      payableThisRun,
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
