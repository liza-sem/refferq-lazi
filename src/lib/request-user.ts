import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

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

/**
 * Resolve the signed-in user id.
 * Middleware injects `x-user-id` on the request in some Next runtimes.
 * Standalone / Docker often drops that header, so fall back to the JWT cookie.
 */
export async function getRequestUserId(request: Request): Promise<string | null> {
  const fromHeader = request.headers.get('x-user-id');
  if (fromHeader) return fromHeader;

  const token = readAuthToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload.userId as string) || (payload.sub as string) || null;
  } catch {
    return null;
  }
}
