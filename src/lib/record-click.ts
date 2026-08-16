import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const DEDUPE_MS = 30 * 60 * 1000;

export type RecordClickInput = {
  affiliateId: string;
  ipAddress: string;
  userAgent?: string | null;
  referer?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export async function recordClick(input: RecordClickInput) {
  const ip = (input.ipAddress || '127.0.0.1').split(',')[0].trim();
  const since = new Date(Date.now() - DEDUPE_MS);

  const existing = await prisma.referralClick.findFirst({
    where: {
      affiliateId: input.affiliateId,
      ipAddress: ip,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return { click: existing, duplicate: true as const };
  }

  const click = await prisma.referralClick.create({
    data: {
      affiliateId: input.affiliateId,
      ipAddress: ip,
      userAgent: input.userAgent || null,
      referer: input.referer || null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  return { click, duplicate: false as const };
}

export function clientIp(request: { headers: Headers }) {
  return (
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
