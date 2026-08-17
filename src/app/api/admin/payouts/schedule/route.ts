import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import {
  cancelScheduledPayoutJob,
  createScheduledPayoutJob,
  listScheduledPayoutJobs,
} from '@/lib/auto-payouts';

async function verifyAdmin(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const jobs = await listScheduledPayoutJobs();
  return NextResponse.json({ success: true, jobs });
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const runAtRaw = typeof body.runAt === 'string' ? body.runAt : '';
  const runAt = new Date(runAtRaw);
  if (!runAtRaw || Number.isNaN(runAt.getTime())) {
    return NextResponse.json({ error: 'Pick a date and time' }, { status: 400 });
  }

  const affiliateIds = Array.isArray(body.affiliateIds)
    ? body.affiliateIds.filter((id: unknown) => typeof id === 'string')
    : [];

  try {
    const job = await createScheduledPayoutJob({
      actorId: user.id,
      runAt,
      affiliateIds,
      skipThreshold: Boolean(body.skipThreshold),
    });
    return NextResponse.json({
      success: true,
      job,
      message: affiliateIds.length > 0
        ? `Scheduled payout for ${affiliateIds.length} partner(s)`
        : 'Scheduled payout for all eligible partners',
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const result = await cancelScheduledPayoutJob(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
