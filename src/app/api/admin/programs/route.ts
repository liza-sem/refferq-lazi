import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { normalizeDayOfMonth, normalizeWeekday } from '@/lib/payout-schedule';

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

// GET: List all programs
export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const programs = await prisma.program.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, programs });
  } catch (error) {
    console.error('Admin programs GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 });
  }
}

// POST: Create program
export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, slug, description, commissionRate, commissionType, cookieDuration, currency, autoApprove, minPayoutCents, payoutFrequency, payoutWeekday, payoutDayOfMonth, termsUrl, logoUrl, brandColor } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const existing = await prisma.program.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
    }

    const existingCount = await prisma.program.count();

    const program = await prisma.program.create({
      data: {
        name,
        slug: slug.toLowerCase(),
        description: description || null,
        commissionRate: commissionRate || 20,
        commissionType: commissionType || 'PERCENTAGE',
        cookieDuration: cookieDuration || 30,
        currency: currency || 'USD',
        autoApprove: autoApprove || false,
        minPayoutCents: minPayoutCents || 100000,
        payoutFrequency: payoutFrequency || 'MONTHLY',
        payoutWeekday: normalizeWeekday(payoutWeekday, 1),
        payoutDayOfMonth: normalizeDayOfMonth(payoutDayOfMonth, 1),
        termsUrl: termsUrl || null,
        logoUrl: logoUrl || null,
        brandColor: brandColor || '#10b981',
        isDefault: existingCount === 0,
      },
    });

    if (program.isDefault) {
      const settings = await prisma.programSettings.findFirst();
      if (settings) {
        await prisma.programSettings.update({
          where: { id: settings.id },
          data: {
            payoutFrequency: program.payoutFrequency,
            payoutWeekday: program.payoutWeekday,
            payoutDayOfMonth: program.payoutDayOfMonth,
            cookieDuration: program.cookieDuration,
          },
        });
      }
    }

    return NextResponse.json({ success: true, program });
  } catch (error) {
    console.error('Admin programs POST error:', error);
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 });
  }
}

// PUT: Update program
export async function PUT(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Program ID required' }, { status: 400 });
    }

    const allowedFields = [
      'name',
      'slug',
      'description',
      'commissionRate',
      'commissionType',
      'cookieDuration',
      'currency',
      'isActive',
      'isDefault',
      'autoApprove',
      'minPayoutCents',
      'payoutFrequency',
      'payoutWeekday',
      'payoutDayOfMonth',
      'termsUrl',
      'logoUrl',
      'brandColor',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body && body[key] !== undefined) updates[key] = body[key];
    }

    if (updates.payoutWeekday !== undefined) {
      updates.payoutWeekday = normalizeWeekday(updates.payoutWeekday, 1);
    }
    if (updates.payoutDayOfMonth !== undefined) {
      updates.payoutDayOfMonth = normalizeDayOfMonth(updates.payoutDayOfMonth, 1);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    if (updates.slug && typeof updates.slug === 'string') {
      updates.slug = updates.slug.toLowerCase();
    }

    const program = await prisma.$transaction(async (tx) => {
      if (updates.isDefault === true) {
        await tx.program.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.program.update({
        where: { id },
        data: updates,
      });
    });

    if (program.isDefault && (program.payoutFrequency || program.cookieDuration || program.payoutWeekday != null)) {
      const settings = await prisma.programSettings.findFirst();
      if (settings) {
        await prisma.programSettings.update({
          where: { id: settings.id },
          data: {
            payoutFrequency: program.payoutFrequency,
            payoutWeekday: program.payoutWeekday,
            payoutDayOfMonth: program.payoutDayOfMonth,
            cookieDuration: program.cookieDuration,
          },
        });
      }
    }

    return NextResponse.json({ success: true, program });
  } catch (error) {
    console.error('Admin programs PUT error:', error);
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 });
  }
}

// DELETE: Delete program
export async function DELETE(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Program ID required' }, { status: 400 });
    }

    await prisma.program.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin programs DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete program' }, { status: 500 });
  }
}
