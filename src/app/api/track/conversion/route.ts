import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractTrackingKey, isValidTrackingKey, trackJson, trackOptionsResponse } from '@/lib/tracking-auth';

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
      currency,
      orderId,
      metadata,
      url,
      timestamp,
    } = body;

    if (!referralCode) {
      return trackJson({ success: false, error: 'Referral code is required' }, 400);
    }

    // Find affiliate by referral code
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
      },
    });

    if (!affiliate) {
      return trackJson({ success: false, error: 'Invalid referral code' }, 404);
    }

    if (affiliate.user.status !== 'ACTIVE') {
      return trackJson({ success: false, error: 'Affiliate is not active' }, 403);
    }

    // Check if referral with this email already exists
    let referral;
    if (customerEmail) {
      referral = await prisma.referral.findFirst({
        where: {
          leadEmail: customerEmail,
          affiliateId: affiliate.id,
        },
      });
    }

    // Create referral if doesn't exist
    if (!referral && customerEmail) {
      referral = await prisma.referral.create({
        data: {
          leadEmail: customerEmail,
          leadName: customerName || 'Unknown Customer',
          affiliateId: affiliate.id,
          status: 'APPROVED',
          metadata: metadata || {},
        },
      });
    } else if (referral && referral.status === 'PENDING') {
      // Update referral status to APPROVED
      referral = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'APPROVED',
          metadata: {
            ...(referral.metadata as object),
            ...metadata,
          },
        },
      });
    }

    // Create conversion record
    const amountCents = Math.round((amount || 0) * 100);

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

    // Note: Commission calculation will be done by the commission rules system
    // This just creates the conversion record

    console.log('✅ Conversion tracked successfully:', {
      conversionId: conversion.id,
      affiliateId: affiliate.id,
      referralId: referral?.id,
      amount: amountCents / 100,
    });

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
