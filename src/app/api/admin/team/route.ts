import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { emailService } from '@/lib/email';
import { partnerAppUrl } from '@/lib/app-url';
import { signTeamInviteToken } from '@/lib/invite-token';
import type { TeamRole } from '@prisma/client';

const TEAM_ROLES: TeamRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function verifyAdmin(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') return null;
    return user;
  } catch (_e) {
    return null;
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'Teammate';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) || 'Teammate';
}

function emailError(raw: string): string | null {
  if (!raw) return 'Email is required';
  if (!raw.includes('@') || raw.startsWith('@') || raw.endsWith('@')) {
    return 'Enter a valid email address';
  }
  if (!EMAIL_RE.test(raw)) {
    return 'Enter a complete email (include .com or another domain ending)';
  }
  return null;
}

async function sendTeamInvite(userId: string, email: string, name: string, role: TeamRole) {
  const token = await signTeamInviteToken(userId, email);
  const inviteUrl = `${partnerAppUrl()}/invite?token=${encodeURIComponent(token)}`;
  return emailService.sendTeamInviteEmail({ name, email, inviteUrl, role });
}

// GET: List team members
export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const members = await prisma.teamMember.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, members });
  } catch (error) {
    console.error('Admin team GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

// POST: Invite team member
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = (typeof body.name === 'string' ? body.name.trim() : '') || nameFromEmail(email);
    const requestedRole = typeof body.role === 'string' ? body.role.toUpperCase() : 'MANAGER';
    const role: TeamRole = TEAM_ROLES.includes(requestedRole as TeamRole)
      ? (requestedRole as TeamRole)
      : 'MANAGER';

    const invalid = emailError(email);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    if (email === admin.email.toLowerCase()) {
      return NextResponse.json({ error: 'This email is already a member' }, { status: 400 });
    }

    const [existingUser, existingMember] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.teamMember.findUnique({ where: { email } }),
    ]);

    if (existingUser?.role === 'AFFILIATE') {
      return NextResponse.json(
        { error: 'This email already has a partner account' },
        { status: 400 },
      );
    }

    const alreadyActiveMember = existingMember?.status === 'ACTIVE';
    const alreadyActiveAdmin = existingUser?.role === 'ADMIN' && existingUser.status === 'ACTIVE';
    if (alreadyActiveMember || alreadyActiveAdmin) {
      return NextResponse.json({ error: 'This email is already a member' }, { status: 400 });
    }

    const crypto = await import('crypto');
    const bcrypt = await import('bcryptjs');
    const password = await bcrypt.hash(`TM${crypto.randomBytes(16).toString('base64url')}`, 12);

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: name || existingUser.name,
            role: 'ADMIN',
            status: 'INVITED',
          },
        })
      : await prisma.user.create({
          data: {
            name,
            email,
            role: 'ADMIN',
            status: 'INVITED',
            password,
          },
        });

    const member = existingMember
      ? await prisma.teamMember.update({
          where: { id: existingMember.id },
          data: {
            name,
            role,
            userId: user.id,
            status: 'PENDING',
            invitedBy: admin.id,
            invitedAt: new Date(),
            acceptedAt: null,
          },
        })
      : await prisma.teamMember.create({
          data: {
            email,
            name,
            role,
            permissions: [],
            invitedBy: admin.id,
            userId: user.id,
            status: 'PENDING',
          },
        });

    const sent = await sendTeamInvite(user.id, email, name, role);
    if (!sent.success) {
      return NextResponse.json(
        { error: sent.message || 'Invite email failed to send. Check Plunk keys.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      member,
      resent: Boolean(existingMember || existingUser),
      message: existingMember || existingUser
        ? `Invite resent to ${email}`
        : `Invite sent to ${email}`,
    });
  } catch (error) {
    console.error('Admin team POST error:', error);
    return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 });
  }
}

// PUT: Update team member
export async function PUT(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });
    }

    const allowedFields = ['name', 'email', 'role', 'permissions', 'status'];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body && body[key] !== undefined) updates[key] = body[key];
    }

    const member = await prisma.teamMember.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ success: true, member });
  } catch (error) {
    console.error('Admin team PUT error:', error);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

// DELETE: Remove team member
export async function DELETE(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });
    }

    await prisma.teamMember.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin team DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 });
  }
}
