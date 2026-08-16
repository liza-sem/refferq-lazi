import { prisma } from './prisma';
import { commissionMultiplier } from './commission-rate';
import { allocateLeadPublicId } from './lead-public-id';
import { createSaleCommission, resolveHoldDays } from './commission-hold';

export type RecordPurchaseInput = {
  referralCode: string;
  customerEmail?: string | null;
  customerName?: string | null;
  amountCents: number;
  currency?: string;
  orderId?: string | null;
  attributionKey?: string | null;
  metadata?: Record<string, unknown>;
};

export async function findExistingPurchase(orderId?: string | null) {
  if (!orderId) return null;
  return prisma.conversion.findFirst({
    where: {
      OR: [
        { eventMetadata: { path: ['stripeSessionId'], equals: orderId } },
        { eventMetadata: { path: ['orderId'], equals: orderId } },
      ],
    },
  });
}

export async function recordPurchase(input: RecordPurchaseInput) {
  const existing = await findExistingPurchase(input.orderId);
  if (existing) {
    return { duplicate: true as const, conversion: existing };
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { referralCode: input.referralCode },
    include: {
      user: {
        select: { id: true, name: true, email: true, status: true },
      },
      partnerGroup: true,
    },
  });

  if (!affiliate) {
    return { duplicate: false as const, error: 'Invalid referral code' as const };
  }

  if (affiliate.user.status !== 'ACTIVE') {
    return { duplicate: false as const, error: 'Affiliate is not active' as const };
  }

  const email = typeof input.customerEmail === 'string' ? input.customerEmail.trim().toLowerCase() : '';
  const name = input.customerName?.trim() || 'Unknown Customer';
  const amountCents = Math.max(0, Math.round(input.amountCents || 0));

  let referral = email
    ? await prisma.referral.findFirst({
        where: { leadEmail: email, affiliateId: affiliate.id },
      })
    : null;

  const nextMetadata = {
    ...((referral?.metadata as object) || {}),
    ...(input.metadata || {}),
    estimated_value: amountCents / 100,
    orderId: input.orderId || null,
    attribution_key: input.attributionKey || null,
  };

  if (referral) {
    referral = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        leadEmail: email || referral.leadEmail,
        leadName: name !== 'Unknown Customer' ? name : referral.leadName,
        status: 'APPROVED',
        metadata: nextMetadata,
        publicId: referral.publicId || await allocateLeadPublicId(),
      },
    });
  } else {
    referral = await prisma.referral.create({
      data: {
        leadEmail: email || `sale-${input.orderId || Date.now()}@unknown.internal`,
        leadName: name,
        affiliateId: affiliate.id,
        status: 'APPROVED',
        metadata: nextMetadata,
        publicId: await allocateLeadPublicId(),
      },
    });
  }

  const conversion = await prisma.conversion.create({
    data: {
      affiliateId: affiliate.id,
      referralId: referral?.id || null,
      eventType: 'PURCHASE',
      amountCents,
      currency: (input.currency || 'USD').toUpperCase(),
      status: 'APPROVED',
      eventMetadata: {
        orderId: input.orderId || null,
        stripeSessionId: input.orderId || null,
        ...input.metadata,
      },
    },
  });

  const rate = commissionMultiplier(affiliate.partnerGroup?.commissionRate);
  const commissionAmount = Math.round(amountCents * rate);

  const settings = await prisma.programSettings.findFirst();
  await createSaleCommission({
    conversionId: conversion.id,
    affiliateId: affiliate.id,
    userId: affiliate.userId,
    amountCents: commissionAmount,
    rate,
    holdDays: resolveHoldDays(settings?.commissionHoldDays),
  });

  try {
    const { emailService } = await import('./email');
    await emailService.sendSaleEarnedEmail({
      affiliateEmail: affiliate.user.email,
      affiliateName: affiliate.user.name || 'Partner',
      amountCents,
      commissionCents: commissionAmount,
      commissionRate: rate,
      referralCode: affiliate.referralCode,
      leadId: referral?.publicId || '',
    });
  } catch (error) {
    console.error('Sale earned email failed:', error);
  }

  try {
    const { evaluateAffiliateTier } = await import('./partner-tier-automation');
    await evaluateAffiliateTier(affiliate.id);
  } catch (error) {
    console.error('Partner tier evaluation failed after purchase:', error);
  }

  return {
    duplicate: false as const,
    conversion,
    referral,
    affiliate,
  };
}
