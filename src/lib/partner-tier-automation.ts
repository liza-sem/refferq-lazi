import { prisma } from './prisma';
import { getOrCreateDefaultPartnerGroup } from './default-partner-group';

export type TierRule = {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  demoteIfBelow: boolean;
  minRevenueCents: number | null;
  minConversions: number | null;
  minApprovedCommissionCents: number | null;
};

export type AffiliateTierStats = {
  revenueCents: number;
  conversions: number;
  approvedCommissionCents: number;
};

export type TierEvaluationResult = {
  affiliateId: string;
  skipped: boolean;
  changed: boolean;
  reason: string;
  fromGroupId: string | null;
  fromGroupName: string | null;
  toGroupId: string | null;
  toGroupName: string | null;
};

function positive(value: number | null | undefined): value is number {
  return value != null && value > 0;
}

export function tierHasRules(tier: Pick<TierRule, 'minRevenueCents' | 'minConversions' | 'minApprovedCommissionCents'>): boolean {
  return (
    positive(tier.minRevenueCents) ||
    positive(tier.minConversions) ||
    positive(tier.minApprovedCommissionCents)
  );
}

export function formatMoneyCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTierRuleLabel(tier: {
  minRevenueCents?: number | null;
  minConversions?: number | null;
  minApprovedCommissionCents?: number | null;
}): string | null {
  const parts: string[] = [];
  if (positive(tier.minRevenueCents)) {
    parts.push(`revenue ≥ ${formatMoneyCents(tier.minRevenueCents)}`);
  }
  if (positive(tier.minConversions)) {
    parts.push(`${tier.minConversions}+ confirmed sales`);
  }
  if (positive(tier.minApprovedCommissionCents)) {
    parts.push(`approved commission ≥ ${formatMoneyCents(tier.minApprovedCommissionCents)}`);
  }
  if (parts.length === 0) return null;
  return `Auto-move here when ${parts.join(' and ')}`;
}

export function tierMatches(tier: TierRule, stats: AffiliateTierStats): boolean {
  if (!tierHasRules(tier)) return false;
  if (positive(tier.minRevenueCents) && stats.revenueCents < tier.minRevenueCents) return false;
  if (positive(tier.minConversions) && stats.conversions < tier.minConversions) return false;
  if (positive(tier.minApprovedCommissionCents) && stats.approvedCommissionCents < tier.minApprovedCommissionCents) {
    return false;
  }
  return true;
}

export function pickHighestMatchingTier(tiers: TierRule[], stats: AffiliateTierStats): TierRule | null {
  const matches = tiers
    .filter((tier) => tierMatches(tier, stats))
    .sort((a, b) => {
      if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder;
      return (b.minRevenueCents || 0) - (a.minRevenueCents || 0);
    });
  return matches[0] ?? null;
}

export async function getAffiliateTierStats(affiliateId: string): Promise<AffiliateTierStats> {
  const [sales, commissions] = await Promise.all([
    prisma.conversion.aggregate({
      where: {
        affiliateId,
        status: 'APPROVED',
        eventType: 'PURCHASE',
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.commission.aggregate({
      where: {
        affiliateId,
        status: { in: ['APPROVED', 'PAID'] },
      },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    revenueCents: sales._sum.amountCents || 0,
    conversions: sales._count._all || 0,
    approvedCommissionCents: commissions._sum.amountCents || 0,
  };
}

function describeMatch(tier: TierRule, stats: AffiliateTierStats): string {
  const parts = [`matched ${tier.name}`];
  if (positive(tier.minRevenueCents)) {
    parts.push(`revenue ${formatMoneyCents(stats.revenueCents)}`);
  }
  if (positive(tier.minConversions)) {
    parts.push(`${stats.conversions} sales`);
  }
  if (positive(tier.minApprovedCommissionCents)) {
    parts.push(`commission ${formatMoneyCents(stats.approvedCommissionCents)}`);
  }
  return `auto: ${parts.join(', ')}`;
}

export async function evaluateAffiliateTier(affiliateId: string): Promise<TierEvaluationResult> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { partnerGroup: true },
  });

  if (!affiliate) {
    return {
      affiliateId,
      skipped: true,
      changed: false,
      reason: 'not_found',
      fromGroupId: null,
      fromGroupName: null,
      toGroupId: null,
      toGroupName: null,
    };
  }

  const fromGroupId = affiliate.partnerGroupId;
  const fromGroupName = affiliate.partnerGroup?.name ?? null;

  if (affiliate.partnerGroupLocked) {
    return {
      affiliateId,
      skipped: true,
      changed: false,
      reason: 'locked',
      fromGroupId,
      fromGroupName,
      toGroupId: fromGroupId,
      toGroupName: fromGroupName,
    };
  }

  const tiers = await prisma.partnerGroup.findMany({
    orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }],
  });
  const stats = await getAffiliateTierStats(affiliateId);
  const matching = pickHighestMatchingTier(tiers, stats);
  const current = affiliate.partnerGroup;
  const defaultGroup = await getOrCreateDefaultPartnerGroup();

  let next: { id: string; name: string } = current ?? defaultGroup;
  let reason = 'unchanged';

  if (matching) {
    if (!current || matching.sortOrder > current.sortOrder) {
      next = matching;
      reason = describeMatch(matching, stats);
    } else if (matching.id !== current.id && matching.sortOrder < current.sortOrder && current.demoteIfBelow) {
      next = matching;
      reason = `auto: demoted to ${matching.name} (${describeMatch(matching, stats)})`;
    } else {
      reason = 'promote_only_keep_current';
    }
  } else if (current?.demoteIfBelow) {
    next = defaultGroup;
    reason = `auto: below ${current.name} threshold, moved to ${defaultGroup.name}`;
  } else if (!current) {
    next = defaultGroup;
    reason = 'auto: assigned default group';
  }

  if (next.id === fromGroupId) {
    return {
      affiliateId,
      skipped: false,
      changed: false,
      reason,
      fromGroupId,
      fromGroupName,
      toGroupId: fromGroupId,
      toGroupName: fromGroupName,
    };
  }

  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      partnerGroupId: next.id,
      tierAssignedAt: new Date(),
      tierAssignedReason: reason.slice(0, 240),
    },
  });

  return {
    affiliateId,
    skipped: false,
    changed: true,
    reason,
    fromGroupId,
    fromGroupName,
    toGroupId: next.id,
    toGroupName: next.name,
  };
}

export async function evaluateAllAffiliateTiers(): Promise<{
  evaluated: number;
  skippedLocked: number;
  changed: number;
  results: TierEvaluationResult[];
}> {
  const affiliates = await prisma.affiliate.findMany({
    select: { id: true },
  });

  const results: TierEvaluationResult[] = [];
  for (const affiliate of affiliates) {
    results.push(await evaluateAffiliateTier(affiliate.id));
  }

  return {
    evaluated: results.length,
    skippedLocked: results.filter((r) => r.reason === 'locked').length,
    changed: results.filter((r) => r.changed).length,
    results: results.filter((r) => r.changed || r.reason === 'locked'),
  };
}
