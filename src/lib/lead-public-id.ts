import crypto from 'crypto';
import { prisma } from './prisma';

/** Human-shareable lead reference, e.g. LD-A3K9. No I/O/0/1. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLeadPublicId(): string {
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `LD-${code}`;
}

export function normalizeLeadPublicId(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export async function allocateLeadPublicId(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const publicId = generateLeadPublicId();
    const taken = await prisma.referral.findUnique({ where: { publicId } });
    if (!taken) return publicId;
  }
  return `LD-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
}

export async function ensureReferralPublicId(referralId: string): Promise<string> {
  const existing = await prisma.referral.findUnique({
    where: { id: referralId },
    select: { publicId: true },
  });
  if (existing?.publicId) return existing.publicId;

  const publicId = await allocateLeadPublicId();
  const updated = await prisma.referral.update({
    where: { id: referralId },
    data: { publicId },
    select: { publicId: true },
  });
  return updated.publicId || publicId;
}

export async function backfillReferralPublicIds(): Promise<number> {
  const missing = await prisma.referral.findMany({
    where: { publicId: null },
    select: { id: true },
  });
  for (const row of missing) {
    await ensureReferralPublicId(row.id);
  }
  return missing.length;
}
