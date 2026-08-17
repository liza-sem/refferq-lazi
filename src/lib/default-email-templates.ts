import { prisma } from './prisma';
import { partnerAppUrl } from './app-url';
import { EMAIL_TEMPLATE_CATALOG, EMAIL_WORDMARK, defaultBodies } from './email-brand';

function applyEmailWordmark(html: string): string {
  return html.replace(
    /(<td align="center" style="padding-bottom:20px;[^>]*>)\s*(?:\{\{companyName\}\}|LAZI|Refferq|Partner program)\s*(<\/td>)/i,
    `$1\n            ${EMAIL_WORDMARK}\n          $2`
  );
}

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
    });
    if (existing) {
      const nextBody = applyEmailWordmark(existing.body);
      const wordmarkChanged = nextBody !== existing.body;
      if (type === 'SALE_EARNED') {
        const vars = Array.isArray(existing.variables) ? (existing.variables as string[]) : [];
        const nextVars = Array.from(new Set([...vars, 'leadId', 'reference']));
        const shouldRefreshBody =
          existing.body.includes('A sale you referred was confirmed') &&
          !existing.body.includes('{{leadId}}') &&
          !existing.body.includes('{{reference}}');
        if (shouldRefreshBody || nextVars.length !== vars.length || wordmarkChanged) {
          await prisma.emailTemplate.update({
            where: { id: existing.id },
            data: {
              ...(shouldRefreshBody ? { body } : wordmarkChanged ? { body: nextBody } : {}),
              variables: nextVars,
            },
          });
        }
      } else if (wordmarkChanged) {
        await prisma.emailTemplate.update({
          where: { id: existing.id },
          data: { body: nextBody },
        });
      }
      continue;
    }

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
  const rawName =
    settings?.companyName?.trim() ||
    settings?.productName?.trim() ||
    settings?.programName?.trim() ||
    EMAIL_WORDMARK;
  const companyName = /^(LAZI|Refferq|Partner program)$/i.test(rawName)
    ? EMAIL_WORDMARK
    : rawName;
  const appUrl = partnerAppUrl();
  return {
    companyName,
    dashboardUrl: `${appUrl}/affiliate`,
    loginUrl: `${appUrl}/login`,
  };
}
