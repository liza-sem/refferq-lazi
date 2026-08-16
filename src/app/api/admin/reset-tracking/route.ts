import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';

export async function POST(request: NextRequest) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.commission.updateMany({ data: { payoutId: null } });
      const commissions = await tx.commission.deleteMany();
      const conversions = await tx.conversion.deleteMany();
      const transactions = await tx.transaction.deleteMany();
      const clicks = await tx.referralClick.deleteMany();
      const referrals = await tx.referral.deleteMany();
      const payouts = await tx.payout.deleteMany();
      const affiliates = await tx.affiliate.updateMany({ data: { balanceCents: 0 } });
      return {
        commissions: commissions.count,
        conversions: conversions.count,
        transactions: transactions.count,
        clicks: clicks.count,
        referrals: referrals.count,
        payouts: payouts.count,
        affiliatesReset: affiliates.count,
      };
    });

    return NextResponse.json({
      success: true,
      message: 'Referral sales data reset',
      deleted,
    });
  } catch (error) {
    console.error('Reset tracking error:', error);
    return NextResponse.json({ error: 'Failed to reset referral data' }, { status: 500 });
  }
}
