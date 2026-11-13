import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

function readAuthToken(request: Request): string | undefined {
  const withCookies = request as NextRequest;
  if (typeof withCookies.cookies?.get === 'function') {
    const fromStore = withCookies.cookies.get('auth-token')?.value;
    if (fromStore) return fromStore;
  }

  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)auth-token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/** Only a verified session cookie establishes identity; request headers never do. */
export async function getRequestSession(request: Request): Promise<{
  userId: string;
  role: 'ADMIN' | 'AFFILIATE';
} | null> {
  try {
    const secret = process.env.JWT_SECRET;
    const token = readAuthToken(request);
    if (!secret || !token) return null;

    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      requiredClaims: ['exp'],
    });
    const userId = payload.userId ?? payload.sub;
    // Invite tokens use the same signing key but are not login sessions.
    if (payload.purpose !== undefined || typeof userId !== 'string' || !userId.trim()) return null;
    if (payload.role !== 'ADMIN' && payload.role !== 'AFFILIATE') return null;
    return { userId, role: payload.role };
  } catch {
    // Includes expired/invalid tokens and malformed cookie encoding.
    return null;
  }
}

export async function getRequestUserId(request: Request): Promise<string | null> {
  return (await getRequestSession(request))?.userId ?? null;
}
