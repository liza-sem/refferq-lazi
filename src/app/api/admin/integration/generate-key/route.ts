import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as crypto from 'crypto';
import { getRequestUserId } from '@/lib/request-user';

/**
 * POST /api/admin/integration/generate-key - Generate API keys for tracking
 */
export async function POST(request: NextRequest) {
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

    // Generate secure API keys
    const publicKey = 'pk_' + crypto.randomBytes(32).toString('hex');
    const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    // Check if integration settings exist
    const existing = await prisma.integrationSettings.findUnique({
      where: { userId: user.id }
    });

    let integration;

    if (existing) {
      // Update existing
      integration = await prisma.integrationSettings.update({
        where: { userId: user.id },
        data: {
          publicKey,
          apiKey,
          provider: 'refferq',
          isActive: true,
        }
      });
    } else {
      // Create new
      integration = await prisma.integrationSettings.create({
        data: {
          userId: user.id,
          publicKey,
          apiKey,
          provider: 'refferq',
          isActive: true,
          config: {},
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'API keys generated successfully',
      keys: {
        publicKey: integration.publicKey,
        apiKey: integration.apiKey,
      },
      integration,
    });

  } catch (error) {
    console.error('Generate API key error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate API keys' },
      { status: 500 }
    );
  }
}
