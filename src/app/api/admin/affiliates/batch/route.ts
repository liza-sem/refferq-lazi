import { NextRequest, NextResponse } from 'next/server';
import { UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';


// Batch update affiliates
export async function POST(request: NextRequest) {
  try {
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
    const { affiliateIds, action, status } = body;

    if (!affiliateIds || !Array.isArray(affiliateIds) || affiliateIds.length === 0) {
      return NextResponse.json(
        { error: 'affiliateIds array is required' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (changeStatus, changeGroup, delete)' },
        { status: 400 }
      );
    }

    let updatedCount = 0;

    switch (action) {
      case 'changeStatus':
        if (!status) {
          return NextResponse.json(
            { error: 'status is required for changeStatus action' },
            { status: 400 }
          );
        }

        // Validate status
        const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
        if (!validStatuses.includes(status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
            { status: 400 }
          );
        }

        // Get all affiliates to find their userIds
        const affiliates = await prisma.affiliate.findMany({
          where: { id: { in: affiliateIds } }
        });

        const userIds = affiliates.map(aff => aff.userId);

        // Update user statuses
        const result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { status: status as UserStatus }
        });

        updatedCount = result.count;

        // Create audit log
        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: 'BATCH_UPDATE_AFFILIATE_STATUS',
            objectType: 'AFFILIATE',
            objectId: 'BATCH',
            payload: {
              affiliateIds,
              newStatus: status,
              count: updatedCount
            }
          }
        });

        return NextResponse.json({
          success: true,
          message: `Updated ${updatedCount} affiliate(s) status to ${status}`,
          count: updatedCount
        });

      case 'changeGroup': {
        const partnerGroupId = body.partnerGroupId || body.group;
        if (!partnerGroupId || typeof partnerGroupId !== 'string') {
          return NextResponse.json(
            { error: 'partnerGroupId is required for changeGroup action' },
            { status: 400 }
          );
        }

        const group = await prisma.partnerGroup.findUnique({ where: { id: partnerGroupId } });
        if (!group) {
          return NextResponse.json({ error: 'Partner group not found' }, { status: 404 });
        }

        const affiliates = await prisma.affiliate.findMany({
          where: { id: { in: affiliateIds } },
          include: {
            user: { select: { email: true, name: true } },
            partnerGroup: { select: { sortOrder: true, name: true } },
          },
        });

        const lock = body.partnerGroupLocked !== false;

        const result = await prisma.affiliate.updateMany({
          where: { id: { in: affiliateIds } },
          data: {
            partnerGroupId: group.id,
            partnerGroupLocked: lock,
            tierAssignedAt: new Date(),
            tierAssignedReason: `admin_manual:${group.name}`,
          },
        });

        updatedCount = result.count;

        try {
          const { maybeSendTierUpgradeEmail } = await import('@/lib/partner-tier-automation');
          for (const affiliate of affiliates) {
            await maybeSendTierUpgradeEmail({
              email: affiliate.user.email,
              name: affiliate.user.name || 'Partner',
              referralCode: affiliate.referralCode,
              fromSortOrder: affiliate.partnerGroup?.sortOrder,
              fromName: affiliate.partnerGroup?.name,
              toGroup: group,
            });
          }
        } catch (error) {
          console.error('Batch tier upgraded emails failed:', error);
        }

        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: 'BATCH_UPDATE_AFFILIATE_GROUP',
            objectType: 'AFFILIATE',
            objectId: 'BATCH',
            payload: {
              affiliateIds,
              newGroupId: group.id,
              newGroupName: group.name,
              locked: lock,
              count: updatedCount,
            },
          },
        });

        return NextResponse.json({
          success: true,
          message: `Moved ${updatedCount} partner(s) to ${group.name}`,
          count: updatedCount,
        });
      }

      case 'delete':
        // Get all affiliates to find their userIds
        const affiliatesToDelete = await prisma.affiliate.findMany({
          where: { id: { in: affiliateIds } },
          include: { user: true }
        });

        const userIdsToDelete = affiliatesToDelete.map(aff => aff.userId);

        // Delete users (will cascade delete affiliates)
        const deleteResult = await prisma.user.deleteMany({
          where: { id: { in: userIdsToDelete } }
        });

        updatedCount = deleteResult.count;

        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: 'BATCH_DELETE_AFFILIATES',
            objectType: 'AFFILIATE',
            objectId: 'BATCH',
            payload: {
              affiliateIds,
              count: updatedCount,
              deletedEmails: affiliatesToDelete.map(a => a.user.email)
            }
          }
        });

        return NextResponse.json({
          success: true,
          message: `Deleted ${updatedCount} affiliate(s)`,
          count: updatedCount
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be: changeStatus, changeGroup, or delete' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Batch update affiliates error:', error);
    return NextResponse.json(
      { error: 'Failed to process batch update' },
      { status: 500 }
    );
  }
}
