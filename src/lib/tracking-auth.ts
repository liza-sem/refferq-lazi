import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { validateApiKey } from './rate-limit';

export const TRACK_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
};

export function trackOptionsResponse() {
  return new NextResponse(null, { status: 200, headers: TRACK_CORS_HEADERS });
}

export function trackJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: TRACK_CORS_HEADERS });
}

export function extractTrackingKey(req: NextRequest): string | null {
  const header = req.headers.get('x-api-key');
  if (header?.trim()) return header.trim();

  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

/** Accept the widget public key (pk_), integration secret (sk_), or an admin API key (rfq_). */
export async function isValidTrackingKey(rawKey: string): Promise<boolean> {
  const integration = await prisma.integrationSettings.findFirst({
    where: {
      isActive: true,
      OR: [{ publicKey: rawKey }, { apiKey: rawKey }],
    },
  });
  if (integration) return true;

  const apiKey = await validateApiKey(rawKey);
  return !!apiKey;
}
