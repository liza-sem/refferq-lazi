import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { evaluateAllAffiliateTiers } from '@/lib/partner-tier-automation';
import { logAuditAction } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const summary = await evaluateAllAffiliateTiers();
    await logAuditAction({
      actorId: user.id,
      action: 'EVALUATE_PARTNER_TIERS',
      objectType: 'PARTNER_GROUP',
      objectId: 'ALL',
      payload: {
        evaluated: summary.evaluated,
        changed: summary.changed,
        skippedLocked: summary.skippedLocked,
      },
    });

    return NextResponse.json({
      success: true,
      ...summary,
      results: summary.results.filter((r) => r.changed),
    });
  } catch (error) {
    console.error('Evaluate partner tiers error:', error);
    return NextResponse.json({ error: 'Failed to evaluate partner tiers' }, { status: 500 });
  }
}
