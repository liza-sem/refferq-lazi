import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

type InvitePayload = {
  userId: string;
  email: string;
  purpose: 'partner-invite';
};

export async function signPartnerInviteToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email, purpose: 'partner-invite' } satisfies InvitePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function verifyPartnerInviteToken(token: string): Promise<InvitePayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== 'partner-invite') return null;
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
    return {
      userId: payload.userId,
      email: payload.email,
      purpose: 'partner-invite',
    };
  } catch {
    return null;
  }
}
