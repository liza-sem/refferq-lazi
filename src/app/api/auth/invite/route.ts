import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPartnerInviteToken } from '@/lib/invite-token';

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = token ? await verifyPartnerInviteToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'This invite link is invalid or expired' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, status: true, role: true },
  });

  if (!user || user.role !== 'AFFILIATE') {
    return NextResponse.json({ error: 'This invite link is invalid or expired' }, { status: 400 });
  }

  if (user.status === 'ACTIVE') {
    return NextResponse.json({ success: true, alreadyActive: true, email: user.email, name: user.name });
  }

  if (user.status !== 'INVITED') {
    return NextResponse.json({ error: 'This invite is no longer valid' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    alreadyActive: false,
    email: user.email,
    name: user.name,
  });
}
