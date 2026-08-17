import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export type InvitePurpose = 'partner-invite' | 'team-invite';

export type InvitePayload = {
  userId: string;
  email: string;
  purpose: InvitePurpose;
};

async function signInviteToken(userId: string, email: string, purpose: InvitePurpose): Promise<string> {
  return new SignJWT({ userId, email, purpose } satisfies InvitePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

async function verifyInviteToken(token: string, purpose: InvitePurpose): Promise<InvitePayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== purpose) return null;
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
    return {
      userId: payload.userId,
      email: payload.email,
      purpose,
    };
  } catch {
    return null;
  }
}

export async function signPartnerInviteToken(userId: string, email: string): Promise<string> {
  return signInviteToken(userId, email, 'partner-invite');
}

export async function verifyPartnerInviteToken(token: string): Promise<InvitePayload | null> {
  return verifyInviteToken(token, 'partner-invite');
}

export async function signTeamInviteToken(userId: string, email: string): Promise<string> {
  return signInviteToken(userId, email, 'team-invite');
}

export async function verifyTeamInviteToken(token: string): Promise<InvitePayload | null> {
  return verifyInviteToken(token, 'team-invite');
}

export async function verifyAnyInviteToken(token: string): Promise<InvitePayload | null> {
  return (await verifyPartnerInviteToken(token)) || (await verifyTeamInviteToken(token));
}
