import { prisma } from '@/lib/prisma';
import { resolveHoldDays } from '@/lib/commission-hold';
import {
  normalizeDayOfMonth,
  normalizePayoutFrequency,
  normalizeWeekday,
  type PayoutFrequency,
} from '@/lib/payout-schedule';

export async function getProgramDefaults(): Promise<{
  payoutFrequency: PayoutFrequency;
  payoutWeekday: number;
  payoutDayOfMonth: number;
  cookieDuration: number;
  commissionHoldDays: number;
  minPayoutCents: number;
  currency: string;
}> {
  const [settings, program] = await Promise.all([
    prisma.programSettings.findFirst(),
    prisma.program.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const fallbackProgram = program || await prisma.program.findFirst({ orderBy: { createdAt: 'asc' } });
  const minFromSettings = settings
    ? (typeof settings.minimumPayoutThreshold === 'number'
      ? settings.minimumPayoutThreshold
      : settings.minPayoutCents)
    : undefined;

  return {
    payoutFrequency: normalizePayoutFrequency(
      fallbackProgram?.payoutFrequency || settings?.payoutFrequency || 'MONTHLY',
    ),
    payoutWeekday: normalizeWeekday(
      fallbackProgram?.payoutWeekday ?? settings?.payoutWeekday,
    ),
    payoutDayOfMonth: normalizeDayOfMonth(
      fallbackProgram?.payoutDayOfMonth ?? settings?.payoutDayOfMonth,
    ),
    cookieDuration: settings?.cookieDuration ?? fallbackProgram?.cookieDuration ?? 30,
    commissionHoldDays: resolveHoldDays(settings?.commissionHoldDays),
    minPayoutCents: Math.max(0, minFromSettings ?? fallbackProgram?.minPayoutCents ?? 0),
    currency: settings?.currency || fallbackProgram?.currency || 'USD',
  };
}
