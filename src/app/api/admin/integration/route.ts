import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';

/**
 * GET /api/admin/integration - Get integration settings
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    
    // Get user from database
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Get integration settings
    const integration = await prisma.integrationSettings.findUnique({
      where: { userId: user.id }
    });

    if (!integration) {
      return NextResponse.json({
        success: true,
        integration: null,
        message: 'No integration configured. Generate API keys to get started.',
      });
    }

    return NextResponse.json({
      success: true,
      integration,
    });

  } catch (error) {
    console.error('GET integration settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch integration settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/integration - Update integration settings
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    
    // Get user from database
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { webhookUrl, trackingScript, isActive, config } = body;

    // Update integration settings
    const integration = await prisma.integrationSettings.update({
      where: { userId: user.id },
      data: {
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(trackingScript !== undefined && { trackingScript }),
        ...(isActive !== undefined && { isActive }),
        ...(config !== undefined && { config }),
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Integration settings updated successfully',
      integration,
    });

  } catch (error) {
    console.error('PUT integration settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update integration settings' },
      { status: 500 }
    );
  }
}
