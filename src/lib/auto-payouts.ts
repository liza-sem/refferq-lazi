import { prisma } from '@/lib/prisma';
import { logAuditAction } from '@/lib/audit';
import { emailService } from '@/lib/email';
import { isValidPaypalEmail, paypalEmailFromDetails } from '@/lib/onboarding';
import { getPaypalPayout, isPaypalConfigured, paypalMode, sendPaypalPayout } from '@/lib/paypal';
import { classifyPaypalStatus } from '@/lib/payout-status';
import { matureCommissionsByIds } from '@/lib/mature-commissions';
import { isCommissionMatured, maturedUnpaidWhere, resolveHoldDays } from '@/lib/commission-hold';
import { getProgramDefaults } from '@/lib/program-defaults';
import {
  isCommissionDue,
  payoutFrequencyLabel,
  payoutTermExplanation,
  resolvePayoutSchedule,
  type PayoutFrequency,
  type PayoutPayday,
} from '@/lib/payout-schedule';

const DEFAULT_DRIP_SIZE = 2;
const MAX_DRIP_SIZE = 10;

export type PayoutRunResult = {
  matured: number;
  processed: number;
  skipped: number;
  failed: number;
  refreshed: number;
  confirmed: number;
  released: number;
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

async function recordPaypalInitiated(input: {
  payoutId: string;
  paypalBatchId: string;
  paypalStatus?: string | null;
  paypalItemId?: string | null;
}) {
  await prisma.payout.update({
    where: { id: input.payoutId },
    data: {
      status: 'PROCESSING',
      paypalBatchId: input.paypalBatchId,
      paypalStatus: input.paypalStatus || 'PENDING',
      ...(input.paypalItemId ? { paypalItemId: input.paypalItemId } : {}),
    },
  });
}

async function sendPayoutCompletedEmail(payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: {
      affiliate: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!payout?.affiliate.user.email) return;
  try {
    await emailService.sendPayoutCompletedEmail(payout.affiliate.user.email, {
      affiliateName: payout.affiliate.user.name || 'Partner',
      amountCents: payout.amountCents,
      commissionCount: payout.commissionCount,
      payoutId: payout.id,
      method: 'PayPal',
      processedAt: (payout.processedAt || new Date()).toISOString(),
    });
  } catch (emailError) {
    console.error('Failed to send payout completed email:', emailError);
  }
}

async function finalizePaidPayout(input: {
  payoutId: string;
  affiliateId: string;
  commissionIds: string[];
  amountCents: number;
  paypalBatchId: string;
  paypalItemId?: string | null;
  paypalStatus?: string | null;
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
        paypalItemId: input.paypalItemId || undefined,
        paypalStatus: input.paypalStatus || 'SUCCESS',
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
      paypalStatus: input.paypalStatus || 'SUCCESS',
    },
  });

  await sendPayoutCompletedEmail(input.payoutId);
}

async function failPayoutAndRelease(input: {
  payoutId: string;
  affiliateId: string;
  amountCents: number;
  paypalBatchId?: string | null;
  paypalItemId?: string | null;
  paypalStatus?: string | null;
  actorId: string;
  wasPaid: boolean;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.commission.updateMany({
      where: { payoutId: input.payoutId },
      data: {
        status: 'APPROVED',
        payoutId: null,
        paidAt: null,
      },
    });
    await tx.payout.update({
      where: { id: input.payoutId },
      data: {
        status: 'FAILED',
        paypalBatchId: input.paypalBatchId || undefined,
        paypalItemId: input.paypalItemId || undefined,
        paypalStatus: input.paypalStatus || 'FAILED',
        notes: `PayPal ${input.paypalStatus || 'FAILED'} — commission returned to unpaid`.slice(0, 500),
      },
    });
    if (input.wasPaid) {
      await tx.affiliate.update({
        where: { id: input.affiliateId },
        data: { balanceCents: { increment: input.amountCents } },
      });
    }
  });

  await logAuditAction({
    actorId: input.actorId,
    action: 'AUTO_PAYOUT_FAILED',
    objectType: 'PAYOUT',
    objectId: input.payoutId,
    payload: {
      affiliateId: input.affiliateId,
      amountCents: input.amountCents,
      paypalBatchId: input.paypalBatchId,
      paypalStatus: input.paypalStatus,
    },
  });
}

type RefreshPayout = {
  id: string;
  affiliateId: string;
  amountCents: number;
  status: string;
  paypalBatchId: string | null;
  commissions: Array<{ id: string; status: string }>;
  affiliate: { user: { name: string } };
};

async function applyPaypalSnapshot(
  payout: RefreshPayout,
  snapshot: {
    payoutBatchId: string;
    batchStatus: string;
    items: Array<{ payoutItemId: string | null; transactionStatus: string | null }>;
  },
  actorId: string,
): Promise<'paid' | 'in_flight' | 'failed'> {
  const item = snapshot.items[0];
  const outcome = classifyPaypalStatus(snapshot.batchStatus, item?.transactionStatus);
  const paypalStatus = item?.transactionStatus || snapshot.batchStatus;
  const commissionIds = payout.commissions.map((c) => c.id);

  if (outcome === 'paid') {
    if (payout.status !== 'COMPLETED') {
      await finalizePaidPayout({
        payoutId: payout.id,
        affiliateId: payout.affiliateId,
        commissionIds,
        amountCents: payout.amountCents,
        paypalBatchId: snapshot.payoutBatchId,
        paypalItemId: item?.payoutItemId,
        paypalStatus,
        actorId,
      });
    }
    return 'paid';
  }

  if (outcome === 'failed') {
    await failPayoutAndRelease({
      payoutId: payout.id,
      affiliateId: payout.affiliateId,
      amountCents: payout.amountCents,
      paypalBatchId: snapshot.payoutBatchId,
      paypalItemId: item?.payoutItemId,
      paypalStatus,
      actorId,
      wasPaid: payout.status === 'COMPLETED' || payout.commissions.some((c) => c.status === 'PAID'),
    });
    return 'failed';
  }

  await prisma.payout.update({
    where: { id: payout.id },
    data: {
      status: 'PROCESSING',
      paypalBatchId: snapshot.payoutBatchId,
      paypalItemId: item?.payoutItemId || undefined,
      paypalStatus,
    },
  });
  return 'in_flight';
}

async function refreshOpenPaypalPayouts(actorId: string) {
  const open = await prisma.payout.findMany({
    where: {
      method: 'PAYPAL',
      status: 'PROCESSING',
      paypalBatchId: { not: null },
    },
    include: {
      commissions: { select: { id: true, status: true } },
      affiliate: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });

  const results: PayoutRunResult['results'] = [];
  let confirmed = 0;
  let released = 0;

  for (const payout of open) {
    if (!payout.paypalBatchId) continue;
    try {
      const snapshot = await getPaypalPayout(payout.paypalBatchId);
      const outcome = await applyPaypalSnapshot(payout, snapshot, actorId);
      if (outcome === 'paid') confirmed += 1;
      if (outcome === 'failed') released += 1;
      results.push({
        affiliateId: payout.affiliateId,
        name: payout.affiliate.user.name,
        amountCents: payout.amountCents,
        payoutId: payout.id,
        status: outcome === 'paid' ? 'CONFIRMED' : outcome === 'failed' ? 'RELEASED' : 'IN_FLIGHT',
      });
    } catch (error) {
      results.push({
        affiliateId: payout.affiliateId,
        name: payout.affiliate.user.name,
        payoutId: payout.id,
        status: 'REFRESH_FAILED',
        error: (error as Error).message,
      });
    }
  }

  return { refreshed: open.length, confirmed, released, results };
}

/** PROCESSING rows with no batch id never reached PayPal — retry send, but do not mark paid yet. */
async function recoverUnsentPayouts(actorId: string) {
  const stuck = await prisma.payout.findMany({
    where: { status: 'PROCESSING', method: 'PAYPAL', paypalBatchId: null },
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

      await recordPaypalInitiated({
        payoutId: payout.id,
        paypalBatchId: sent.payoutBatchId,
        paypalStatus: sent.batchStatus,
      });

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
      refreshed: 0,
      confirmed: 0,
      released: 0,
      totalAmountCents: 0,
      paypalConfigured: isPaypalConfigured(),
      autoPayoutEnabled,
      dripSize,
      lastAutoPayoutAt: last.toISOString(),
      results: [],
      ...extra,
    };
  };

  if (!isPaypalConfigured()) {
    return empty();
  }

  const refresh = await refreshOpenPaypalPayouts(input.actorId);
  const recovered = await recoverUnsentPayouts(input.actorId);

  if (!autoPayoutEnabled) {
    const last = await markLastRun(settings?.id);
    return {
      matured: 0,
      processed: recovered.filter((r) => r.status.startsWith('RECOVERED')).length,
      skipped: 0,
      failed: recovered.filter((r) => r.status === 'FAILED').length,
      refreshed: refresh.refreshed,
      confirmed: refresh.confirmed,
      released: refresh.released,
      totalAmountCents: recovered
        .filter((r) => r.status.startsWith('RECOVERED'))
        .reduce((sum, r) => sum + (r.amountCents || 0), 0),
      paypalConfigured: true,
      autoPayoutEnabled,
      dripSize,
      lastAutoPayoutAt: last.toISOString(),
      results: [...refresh.results, ...recovered],
    };
  }
  const programDefaults = await getProgramDefaults();
  const now = new Date();
  const lastRun = settings?.lastAutoPayoutAt || null;

  const approved = await prisma.commission.findMany({
    where: {
      ...maturedUnpaidWhere(now),
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: {
      affiliate: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
          partnerGroup: { select: { payoutFrequency: true, payoutWeekday: true, payoutDayOfMonth: true } },
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
    payday: PayoutPayday;
    oldestPayableAt: Date;
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

    const { frequency, payday } = resolvePayoutSchedule(
      commission.affiliate.partnerGroup,
      programDefaults,
    );
    const approvedAt = commission.approvedAt || commission.createdAt;
    if (!isCommissionDue(approvedAt, frequency, payday, now, lastRun)) continue;

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
        payday,
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

  const results: PayoutRunResult['results'] = [...refresh.results, ...recovered];
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

      await recordPaypalInitiated({
        payoutId: claimed.payout.id,
        paypalBatchId: sent.payoutBatchId,
        paypalStatus: sent.batchStatus,
      });

      processed += 1;
      totalAmountCents += claimed.amountCents;
      results.push({
        affiliateId: entry.affiliateId,
        name: entry.name,
        amountCents: claimed.amountCents,
        payoutId: claimed.payout.id,
        status: 'SENT',
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
    refreshed: refresh.refreshed,
    confirmed: refresh.confirmed,
    released: refresh.released,
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
  paypalStatus?: string;
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

  const skipHold = input.skipHold !== false;
  const pending = unpaid.filter((c) => c.status === 'PENDING');
  const now = new Date();
  const payableNow = skipHold
    ? unpaid
    : unpaid.filter((c) => isCommissionMatured(c, now));
  const amountCents = payableNow.reduce((sum, c) => sum + c.amountCents, 0);

  if (unpaid.length > 0 && payableNow.length === 0 && !skipHold) {
    blockers.push('No matured commissions to pay. Immature sales stay on hold.');
  }
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
      note: `LAZI payout ${claimed.payout.id}`,
    });

    await recordPaypalInitiated({
      payoutId: claimed.payout.id,
      paypalBatchId: sent.payoutBatchId,
      paypalStatus: sent.batchStatus,
    });

    return {
      success: true,
      blockers: [],
      matured,
      payoutId: claimed.payout.id,
      amountCents: claimed.amountCents,
      commissionCount: claimed.commissionIds.length,
      paypalBatchId: sent.payoutBatchId,
      paypalStatus: sent.batchStatus,
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

  const now = new Date();
  const lastRun = settings?.lastAutoPayoutAt || null;
  const approved = await prisma.commission.findMany({
    where: {
      ...maturedUnpaidWhere(now),
      affiliate: { user: { status: 'ACTIVE' } },
    },
    include: {
      affiliate: {
        select: {
          payoutDetails: true,
          partnerGroup: { select: { payoutFrequency: true, payoutWeekday: true, payoutDayOfMonth: true } },
        },
      },
    },
  });

  const eligibleAffiliateIds = new Set<string>();
  const grouped = new Map<string, { amountCents: number; frequency: PayoutFrequency }>();
  let totalPendingCents = 0;
  for (const commission of approved) {
    const email = paypalEmailFromDetails(commission.affiliate.payoutDetails);
    if (!isValidPaypalEmail(email)) continue;
    eligibleAffiliateIds.add(commission.affiliateId);
    totalPendingCents += commission.amountCents;
    const { frequency, payday } = resolvePayoutSchedule(
      commission.affiliate.partnerGroup,
      programDefaults,
    );
    const approvedAt = commission.approvedAt || commission.createdAt;
    if (!isCommissionDue(approvedAt, frequency, payday, now, lastRun)) continue;
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
      commissionHoldDays: resolveHoldDays(settings?.commissionHoldDays),
      refundHoldDays: programDefaults.commissionHoldDays,
      cookieDuration: programDefaults.cookieDuration,
      payoutFrequency: programDefaults.payoutFrequency,
      payoutFrequencyLabel: payoutFrequencyLabel(programDefaults.payoutFrequency),
      payoutWeekday: programDefaults.payoutWeekday,
      payoutDayOfMonth: programDefaults.payoutDayOfMonth,
      paydayLabel: payoutTermExplanation(programDefaults.payoutFrequency, {
        weekday: programDefaults.payoutWeekday,
        dayOfMonth: programDefaults.payoutDayOfMonth,
      }),
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
      paypalStatus: payout.paypalStatus,
      createdAt: payout.createdAt,
      processedAt: payout.processedAt,
    })),
  };
}
