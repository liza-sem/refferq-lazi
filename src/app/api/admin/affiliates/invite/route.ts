import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { emailService } from '@/lib/email';
import { partnerAppUrl } from '@/lib/app-url';
import { signPartnerInviteToken } from '@/lib/invite-token';

async function verifyAdmin(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return null;
  return user;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'Partner';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) || 'Partner';
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const partnerGroupId = typeof body.partnerGroupId === 'string' ? body.partnerGroupId : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { affiliate: true },
  });

  if (existing && existing.status !== 'INVITED') {
    return NextResponse.json({ error: 'A partner with this email already exists' }, { status: 400 });
  }

  const { getOrCreateDefaultPartnerGroup } = await import('@/lib/default-partner-group');
  const defaultGroup = await getOrCreateDefaultPartnerGroup();
  let groupId = defaultGroup.id;
  if (partnerGroupId) {
    const requested = await prisma.partnerGroup.findUnique({ where: { id: partnerGroupId } });
    if (requested) groupId = requested.id;
  }

  const crypto = await import('crypto');
  const bcrypt = await import('bcryptjs');
  const password = await bcrypt.hash(`AF${crypto.randomBytes(16).toString('base64url')}`, 12);

  const user = existing || await prisma.user.create({
    data: {
      name: nameFromEmail(email),
      email,
      role: 'AFFILIATE',
      status: 'INVITED',
      password,
    },
  });

  if (!existing) {
    await prisma.affiliate.create({
      data: {
        userId: user.id,
        referralCode: `AF${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`,
        partnerGroupId: groupId,
        balanceCents: 0,
        payoutDetails: { paymentMethod: 'PayPal' },
      },
    });
  } else if (partnerGroupId && existing.affiliate) {
    await prisma.affiliate.update({
      where: { id: existing.affiliate.id },
      data: { partnerGroupId: groupId },
    });
  }

  const token = await signPartnerInviteToken(user.id, email);
  const inviteUrl = `${partnerAppUrl()}/invite?token=${encodeURIComponent(token)}`;
  const sent = await emailService.sendPartnerInviteEmail({
    name: user.name,
    email,
    inviteUrl,
  });

  if (!sent.success) {
    return NextResponse.json(
      { error: sent.message || 'Invite email failed to send. Check Plunk keys.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${email}`,
    email,
  });
}
