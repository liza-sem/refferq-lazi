import { prisma } from '@/lib/prisma';
import { resolveHoldDays } from '@/lib/commission-hold';
import {
  normalizeDayOfMonth,
  normalizePayoutFrequency,
  normalizePayoutType,
  normalizeWeekday,
  type PayoutFrequency,
  type PayoutType,
} from '@/lib/payout-schedule';

export async function getProgramDefaults(): Promise<{
  payoutType: PayoutType;
  payoutFrequency: PayoutFrequency;
  payoutWeekday: number;
  payoutDayOfMonth: number;
  allowPartnerPayNow: boolean;
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
    payoutType: normalizePayoutType(
      (settings as { payoutType?: string } | null)?.payoutType
      || (fallbackProgram as { payoutType?: string } | null)?.payoutType,
    ),
    payoutFrequency: normalizePayoutFrequency(
      fallbackProgram?.payoutFrequency || settings?.payoutFrequency || 'MONTHLY',
    ),
    payoutWeekday: normalizeWeekday(
      fallbackProgram?.payoutWeekday ?? settings?.payoutWeekday,
    ),
    payoutDayOfMonth: normalizeDayOfMonth(
      fallbackProgram?.payoutDayOfMonth ?? settings?.payoutDayOfMonth,
    ),
    allowPartnerPayNow: Boolean(
      (settings as { allowPartnerPayNow?: boolean } | null)?.allowPartnerPayNow
      || (fallbackProgram as { allowPartnerPayNow?: boolean } | null)?.allowPartnerPayNow,
    ) && !isMassFromSettings(settings, fallbackProgram),
    cookieDuration: settings?.cookieDuration ?? fallbackProgram?.cookieDuration ?? 30,
    commissionHoldDays: resolveHoldDays(settings?.commissionHoldDays),
    minPayoutCents: Math.max(0, minFromSettings ?? fallbackProgram?.minPayoutCents ?? 0),
    currency: settings?.currency || fallbackProgram?.currency || 'USD',
  };
}

function isMassFromSettings(
  settings: { payoutType?: string } | null | undefined,
  program: { payoutType?: string } | null | undefined,
) {
  return normalizePayoutType(settings?.payoutType || program?.payoutType) === 'MASS';
}
