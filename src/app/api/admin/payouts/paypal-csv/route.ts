import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
import { listEligiblePayoutPartners } from '@/lib/auto-payouts';
import { paypalCsvFilename, paypalPayoutsCsv } from '@/lib/paypal-csv';

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

  const params = new URL(request.url).searchParams;
  const ids = (params.get('affiliateIds') || '').split(',').map((id) => id.trim()).filter(Boolean);
  const skipThreshold = params.get('skipThreshold') === '1';

  const listed = await listEligiblePayoutPartners({
    affiliateIds: ids.length > 0 ? ids : undefined,
    skipThreshold,
    includeBelowThreshold: skipThreshold,
    requirePaypalEmail: true,
  });

  const csv = paypalPayoutsCsv(listed.partners.map((partner) => ({
    email: partner.paypalEmail,
    amountCents: partner.amountCents,
    currency: listed.currency,
    customerId: partner.referralCode || partner.affiliateId,
  })));

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${paypalCsvFilename()}"`,
    },
  });
}
