import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractTrackingKey, isValidTrackingKey, trackJson, trackOptionsResponse } from '@/lib/tracking-auth';
import { isClickPlaceholderEmail, toAmountCents } from '@/lib/money';

/**
 * POST /api/track/conversion - Track conversions/sales
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = extractTrackingKey(req);

    if (!apiKey) {
      return trackJson({ success: false, error: 'API key is required' }, 401);
    }

    if (!(await isValidTrackingKey(apiKey))) {
      return trackJson({ success: false, error: 'Invalid or inactive API key' }, 401);
    }

    const body = await req.json();
    const {
      referralCode,
      customerEmail,
      customerName,
      amount,
      amountCents: amountCentsRaw,
      currency,
      orderId,
      metadata,
      url,
      timestamp,
      attributionKey,
    } = body;

    if (!referralCode) {
      return trackJson({ success: false, error: 'Referral code is required' }, 400);
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        partnerGroup: true,
      },
    });

    if (!affiliate) {
      return trackJson({ success: false, error: 'Invalid referral code' }, 404);
    }

    if (affiliate.user.status !== 'ACTIVE') {
      return trackJson({ success: false, error: 'Affiliate is not active' }, 403);
    }

    const email = typeof customerEmail === 'string' ? customerEmail.trim().toLowerCase() : '';
    const name = typeof customerName === 'string' && customerName.trim() ? customerName.trim() : 'Unknown Customer';
    const amountCents = toAmountCents(amount, amountCentsRaw);
    const attrKey = attributionKey || metadata?.attribution_key || metadata?.attributionKey;

    let referral = email
      ? await prisma.referral.findFirst({
          where: { leadEmail: email, affiliateId: affiliate.id },
        })
      : null;

    if (!referral) {
      referral = await prisma.referral.findFirst({
        where: {
          affiliateId: affiliate.id,
          status: 'PENDING',
          OR: [
            { leadEmail: { endsWith: '@tracking.internal' } },
            ...(attrKey ? [{ metadata: { path: ['attribution_key'], equals: attrKey } }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const nextMetadata = {
      ...((referral?.metadata as object) || {}),
      ...(metadata || {}),
      estimated_value: amountCents / 100,
      orderId: orderId || null,
    };

    if (referral) {
      referral = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          leadEmail: email || referral.leadEmail,
          leadName: name !== 'Unknown Customer' || isClickPlaceholderEmail(referral.leadEmail) ? name : referral.leadName,
          status: 'APPROVED',
          metadata: nextMetadata,
        },
      });
    } else if (email) {
      referral = await prisma.referral.create({
        data: {
          leadEmail: email,
          leadName: name,
          affiliateId: affiliate.id,
          status: 'APPROVED',
          metadata: nextMetadata,
        },
      });
    }

    const conversion = await prisma.conversion.create({
      data: {
        affiliateId: affiliate.id,
        referralId: referral?.id || null,
        eventType: 'PURCHASE',
        amountCents,
        currency: currency || 'USD',
        status: 'PENDING',
        eventMetadata: {
          orderId: orderId || null,
          url: url || null,
          timestamp: timestamp || new Date().toISOString(),
          ...metadata,
        },
      },
    });

    const ratePercent = affiliate.partnerGroup?.commissionRate ?? 20;
    const rate = ratePercent > 1 ? ratePercent / 100 : ratePercent;
    const commissionAmount = Math.round(amountCents * rate);

    const settings = await prisma.programSettings.findFirst();
    const holdDays = settings?.commissionHoldDays ?? 30;
    const maturesAt = new Date();
    maturesAt.setDate(maturesAt.getDate() + holdDays);

    if (commissionAmount > 0) {
      await prisma.commission.create({
        data: {
          conversionId: conversion.id,
          affiliateId: affiliate.id,
          userId: affiliate.userId,
          amountCents: commissionAmount,
          rate,
          status: 'PENDING',
          maturesAt,
        },
      });
    }

    return trackJson({
      success: true,
      message: 'Conversion tracked successfully',
      conversion: {
        id: conversion.id,
        amount: amountCents / 100,
        currency: conversion.currency,
      },
      affiliate: {
        name: affiliate.user.name,
        code: affiliate.referralCode,
      },
    });
  } catch (error) {
    console.error('POST /api/track/conversion error:', error);
    return trackJson({ success: false, error: 'Failed to track conversion' }, 500);
  }
}

export async function OPTIONS() {
  return trackOptionsResponse();
}
