import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';

function readCronSecret(request: NextRequest): string | null {
  const header = request.headers.get('x-cron-secret');
  if (header) return header;

  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export function isCronSecretValid(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = readCronSecret(request);
  return Boolean(provided && provided === expected);
}

export async function authorizeCronOrAdmin(request: NextRequest): Promise<
  { ok: true; actorId: string } | { ok: false; response: NextResponse }
> {
  if (isCronSecretValid(request)) {
    return { ok: true, actorId: 'system-cron' };
  }

  const userId = await getRequestUserId(request);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'ADMIN' && user.status === 'ACTIVE') {
      return { ok: true, actorId: user.id };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}
