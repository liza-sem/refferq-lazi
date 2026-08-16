import { prisma } from './prisma';
import { EMAIL_TEMPLATE_CATALOG, defaultBodies } from './email-brand';

const SEED_TYPES = ['WELCOME', 'OTP', 'APPROVAL', 'SALE_EARNED', 'PAYOUT', 'TIER_UPGRADED'] as const;

export async function ensureDefaultEmailTemplates(): Promise<{ created: string[] }> {
  const bodies = defaultBodies();
  const created: string[] = [];

  for (const type of SEED_TYPES) {
    const entry = EMAIL_TEMPLATE_CATALOG.find((item) => item.value === type);
    const body = bodies[type];
    if (!entry || !body) continue;

    const existing = await prisma.emailTemplate.findFirst({
      where: {
        OR: [{ type: type as any }, ...entry.aliases.map((alias) => ({ type: alias as any }))],
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.emailTemplate.create({
      data: {
        type: type as any,
        name: entry.label,
        subject: entry.defaultSubject,
        body,
        variables: entry.variables.map((v) => v.name),
        isActive: true,
      },
    });
    created.push(type);
  }

  return { created };
}

export async function getProgramBrand() {
  const settings = await prisma.programSettings.findFirst({
    select: { companyName: true, productName: true, programName: true },
  });
  const companyName =
    settings?.companyName?.trim() ||
    settings?.productName?.trim() ||
    settings?.programName?.trim() ||
    'LAZI';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://referrals.lazi.studio').replace(/\/$/, '');
  return {
    companyName,
    dashboardUrl: `${appUrl}/affiliate`,
    loginUrl: `${appUrl}/login`,
  };
}
