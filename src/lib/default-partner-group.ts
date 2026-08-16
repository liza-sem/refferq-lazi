import { prisma } from './prisma';

export async function getOrCreateDefaultPartnerGroup() {
  const existing = await prisma.partnerGroup.findFirst({
    where: { isDefault: true },
  });
  if (existing) return existing;

  return prisma.partnerGroup.create({
    data: {
      name: 'Standard',
      description: 'Default partner group',
      commissionRate: 20,
      isDefault: true,
      sortOrder: 0,
    },
  });
}

export async function assignDefaultPartnerGroup(affiliateId: string) {
  const group = await getOrCreateDefaultPartnerGroup();
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: { partnerGroupId: group.id },
  });
}

export async function backfillMissingPartnerGroups() {
  const group = await getOrCreateDefaultPartnerGroup();
  return prisma.affiliate.updateMany({
    where: { partnerGroupId: null },
    data: { partnerGroupId: group.id },
  });
}
