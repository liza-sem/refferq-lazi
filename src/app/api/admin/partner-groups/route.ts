import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { getOrCreateDefaultPartnerGroup } from '@/lib/default-partner-group';
import { parseCommissionPercent } from '@/lib/commission-rate';
import { formatTierRuleLabel } from '@/lib/partner-tier-automation';
import { parseTierPayoutFrequency } from '@/lib/payout-schedule';
import { logAuditAction } from '@/lib/audit';

async function verifyAdmin(request: NextRequest) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN') return null;
  return user;
}

function optionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function serializeGroup(pg: {
  id: string;
  name: string;
  description: string | null;
  commissionRate: number;
  signupUrl: string | null;
  isDefault: boolean;
  sortOrder: number;
  minRevenueCents: number | null;
  minConversions: number | null;
  minApprovedCommissionCents: number | null;
  demoteIfBelow: boolean;
  payoutFrequency: string | null;
  createdAt: Date;
  updatedAt: Date;
}, memberCount: number) {
  return {
    id: pg.id,
    name: pg.name,
    description: pg.description,
    commissionRate: pg.commissionRate,
    signupUrl: pg.signupUrl,
    isDefault: pg.isDefault,
    sortOrder: pg.sortOrder,
    minRevenueCents: pg.minRevenueCents,
    minConversions: pg.minConversions,
    minApprovedCommissionCents: pg.minApprovedCommissionCents,
    demoteIfBelow: pg.demoteIfBelow,
    payoutFrequency: pg.payoutFrequency,
    memberCount,
    autoRuleLabel: formatTierRuleLabel(pg),
    createdAt: pg.createdAt,
    updatedAt: pg.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const partnerGroups = await prisma.partnerGroup.findMany({
      orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }],
    });

    const counts = await prisma.affiliate.groupBy({
      by: ['partnerGroupId'],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((row) => [row.partnerGroupId, row._count._all]));

    return NextResponse.json({
      success: true,
      partnerGroups: partnerGroups.map((pg) => serializeGroup(pg, countMap.get(pg.id) || 0)),
    });
  } catch (error) {
    console.error('Partner groups API error:', error);
    return NextResponse.json({ error: 'Failed to fetch partner groups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      commissionRate,
      signupUrl,
      isDefault,
      sortOrder,
      minRevenueCents,
      minConversions,
      minApprovedCommissionCents,
      demoteIfBelow,
      payoutFrequency,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Tier name is required' }, { status: 400 });
    }

    const rate = parseCommissionPercent(commissionRate);
    if (rate == null) {
      return NextResponse.json(
        { error: 'Commission rate must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    if (isDefault) {
      await prisma.partnerGroup.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const partnerGroup = await prisma.partnerGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        commissionRate: rate,
        signupUrl: signupUrl || null,
        isDefault: Boolean(isDefault),
        sortOrder: optionalInt(sortOrder) ?? 0,
        minRevenueCents: optionalInt(minRevenueCents) ?? null,
        minConversions: optionalInt(minConversions) ?? null,
        minApprovedCommissionCents: optionalInt(minApprovedCommissionCents) ?? null,
        demoteIfBelow: Boolean(demoteIfBelow),
        payoutFrequency: parseTierPayoutFrequency(payoutFrequency) ?? null,
      },
    });

    await logAuditAction({
      actorId: user.id,
      action: 'CREATE_PARTNER_GROUP',
      objectType: 'PARTNER_GROUP',
      objectId: partnerGroup.id,
      payload: { name: partnerGroup.name, commissionRate: rate },
    });

    return NextResponse.json({
      success: true,
      message: 'Tier created successfully',
      partnerGroup: serializeGroup(partnerGroup, 0),
    });
  } catch (error) {
    console.error('Create partner group error:', error);
    return NextResponse.json({ error: 'Failed to create partner group' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Partner group ID is required' }, { status: 400 });
    }

    const existing = await prisma.partnerGroup.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Partner group not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.signupUrl !== undefined) data.signupUrl = body.signupUrl || null;
    if (body.commissionRate !== undefined) {
      const rate = parseCommissionPercent(body.commissionRate);
      if (rate == null) {
        return NextResponse.json(
          { error: 'Commission rate must be a percentage between 0 and 100' },
          { status: 400 }
        );
      }
      data.commissionRate = rate;
    }
    if (body.sortOrder !== undefined) data.sortOrder = optionalInt(body.sortOrder) ?? 0;
    if (body.minRevenueCents !== undefined) data.minRevenueCents = optionalInt(body.minRevenueCents);
    if (body.minConversions !== undefined) data.minConversions = optionalInt(body.minConversions);
    if (body.minApprovedCommissionCents !== undefined) {
      data.minApprovedCommissionCents = optionalInt(body.minApprovedCommissionCents);
    }
    if (body.demoteIfBelow !== undefined) data.demoteIfBelow = Boolean(body.demoteIfBelow);
    if (body.payoutFrequency !== undefined) {
      data.payoutFrequency = parseTierPayoutFrequency(body.payoutFrequency) ?? null;
    }

    if (body.isDefault === true) {
      await prisma.partnerGroup.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      data.isDefault = true;
    } else if (body.isDefault === false) {
      if (existing.isDefault) {
        return NextResponse.json(
          { error: 'Set another tier as default before unsetting this one' },
          { status: 400 }
        );
      }
      data.isDefault = false;
    }

    const partnerGroup = await prisma.partnerGroup.update({
      where: { id },
      data,
    });

    const memberCount = await prisma.affiliate.count({ where: { partnerGroupId: id } });

    await logAuditAction({
      actorId: user.id,
      action: 'UPDATE_PARTNER_GROUP',
      objectType: 'PARTNER_GROUP',
      objectId: id,
      payload: data,
    });

    return NextResponse.json({
      success: true,
      message: 'Tier updated successfully',
      partnerGroup: serializeGroup(partnerGroup, memberCount),
    });
  } catch (error) {
    console.error('Update partner group error:', error);
    return NextResponse.json({ error: 'Failed to update partner group' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyAdmin(request);
    if (!user) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Partner group ID is required' }, { status: 400 });
    }

    const group = await prisma.partnerGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Partner group not found' }, { status: 404 });
    }

    if (group.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default tier. Set another tier as default first.' },
        { status: 400 }
      );
    }

    const remaining = await prisma.partnerGroup.count();
    if (remaining <= 1) {
      return NextResponse.json({ error: 'Cannot delete the only remaining tier' }, { status: 400 });
    }

    const defaultGroup = await getOrCreateDefaultPartnerGroup();
    if (defaultGroup.id === id) {
      return NextResponse.json({ error: 'Cannot delete the default tier' }, { status: 400 });
    }

    const memberCount = await prisma.affiliate.count({ where: { partnerGroupId: id } });

    if (memberCount > 0) {
      await prisma.affiliate.updateMany({
        where: { partnerGroupId: id },
        data: {
          partnerGroupId: defaultGroup.id,
          tierAssignedAt: new Date(),
          tierAssignedReason: `reassigned from deleted ${group.name} to ${defaultGroup.name}`,
        },
      });
    }

    await prisma.partnerGroup.delete({ where: { id } });

    await logAuditAction({
      actorId: user.id,
      action: 'DELETE_PARTNER_GROUP',
      objectType: 'PARTNER_GROUP',
      objectId: id,
      payload: {
        name: group.name,
        reassignedCount: memberCount,
        reassignedTo: defaultGroup.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: memberCount > 0
        ? `Tier deleted. ${memberCount} partner(s) moved to ${defaultGroup.name}.`
        : 'Tier deleted successfully',
      reassignedCount: memberCount,
      reassignedTo: defaultGroup.name,
    });
  } catch (error) {
    console.error('Delete partner group error:', error);
    return NextResponse.json({ error: 'Failed to delete partner group' }, { status: 500 });
  }
}
