import { NextRequest, NextResponse } from 'next/server';
import { UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';


// Update affiliate status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const userId = await getRequestUserId(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, notes, partnerGroupId, partnerGroupLocked } = body;

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: params.id },
      include: { user: true, partnerGroup: true }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    if (partnerGroupId !== undefined || partnerGroupLocked !== undefined) {
      const data: {
        partnerGroupId?: string;
        partnerGroupLocked?: boolean;
        tierAssignedAt?: Date;
        tierAssignedReason?: string;
      } = {};

      if (partnerGroupId !== undefined) {
        if (typeof partnerGroupId !== 'string' || !partnerGroupId) {
          return NextResponse.json({ error: 'partnerGroupId is required' }, { status: 400 });
        }
        const group = await prisma.partnerGroup.findUnique({ where: { id: partnerGroupId } });
        if (!group) {
          return NextResponse.json({ error: 'Partner group not found' }, { status: 404 });
        }
        data.partnerGroupId = group.id;
        data.tierAssignedAt = new Date();
        data.tierAssignedReason = `admin_manual:${group.name}`;
      }

      if (partnerGroupLocked !== undefined) {
        data.partnerGroupLocked = Boolean(partnerGroupLocked);
      }

      const updated = await prisma.affiliate.update({
        where: { id: params.id },
        data,
        include: { partnerGroup: true },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'UPDATE_AFFILIATE_TIER',
          objectType: 'AFFILIATE',
          objectId: params.id,
          payload: {
            oldGroupId: affiliate.partnerGroupId,
            newGroupId: updated.partnerGroupId,
            oldLocked: affiliate.partnerGroupLocked,
            newLocked: updated.partnerGroupLocked,
            affiliateEmail: affiliate.user.email,
          },
        },
      });

      if (data.partnerGroupId && updated.partnerGroup) {
        try {
          const { maybeSendTierUpgradeEmail } = await import('@/lib/partner-tier-automation');
          await maybeSendTierUpgradeEmail({
            email: affiliate.user.email,
            name: affiliate.user.name || 'Partner',
            referralCode: affiliate.referralCode,
            fromSortOrder: affiliate.partnerGroup?.sortOrder,
            fromName: affiliate.partnerGroup?.name,
            toGroup: updated.partnerGroup,
          });
        } catch (error) {
          console.error('Tier upgraded email failed:', error);
        }
      }

      if (!status) {
        return NextResponse.json({
          success: true,
          message: 'Partner tier updated',
          affiliate: {
            id: updated.id,
            partnerGroupId: updated.partnerGroupId,
            partnerGroup: updated.partnerGroup?.name,
            partnerGroupLocked: updated.partnerGroupLocked,
          },
        });
      }
    }

    if (!status) {
      return NextResponse.json(
        { error: 'Status or partner group update is required' },
        { status: 400 }
      );
    }

    const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id: affiliate.userId },
      data: {
        status: status as UserStatus
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'UPDATE_AFFILIATE_STATUS',
        objectType: 'AFFILIATE',
        objectId: params.id,
        payload: {
          oldStatus: affiliate.user.status,
          newStatus: status,
          notes: notes || null,
          affiliateEmail: affiliate.user.email
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Affiliate status updated to ${status}`,
      affiliate: {
        id: affiliate.id,
        userId: updatedUser.id,
        status: updatedUser.status
      }
    });

  } catch (error) {
    console.error('Update affiliate status error:', error);
    return NextResponse.json(
      { error: 'Failed to update affiliate status' },
      { status: 500 }
    );
  }
}

// Delete affiliate
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const userId = await getRequestUserId(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get affiliate to find userId
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: params.id },
      include: { user: true }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    // Delete user (will cascade delete affiliate due to Prisma schema)
    await prisma.user.delete({
      where: { id: affiliate.userId }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'DELETE_AFFILIATE',
        objectType: 'AFFILIATE',
        objectId: params.id,
        payload: {
          affiliateName: affiliate.user.name,
          affiliateEmail: affiliate.user.email,
          referralCode: affiliate.referralCode
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Affiliate deleted successfully'
    });

  } catch (error) {
    console.error('Delete affiliate error:', error);
    return NextResponse.json(
      { error: 'Failed to delete affiliate' },
      { status: 500 }
    );
  }
}
