import 'next/dist/server/node-environment';
import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { getRequestUserId } from './request-user';
import { authorizeCronOrAdmin } from './cron-auth';
import { proxy, config } from '../proxy';
import { GET as me } from '../app/api/auth/me/route';
import { GET as emailGet, POST as emailPost } from '../app/api/test/email/route';
import { GET as payoutsGet, POST as payoutsPost } from '../app/api/cron/payouts/route';
import { GET as tiersGet, POST as tiersPost } from '../app/api/cron/tiers/route';
import { emailService } from './email';
import * as webhooks from '../app/api/admin/webhooks/route';

const signingSecret = 'local-test-only-signing-secret-at-least-32-chars';
const globalDb = globalThis as unknown as { prisma: unknown };
const originalDb = globalDb.prisma;
const originalSend = emailService.sendWelcomeEmail;
let user: { id: string; role: string; status: string } | null;
let lookups = 0;
let sends = 0;
let jobReads = 0;

before(() => {
  // Same injection seam as pinit-integration.test.ts; no database or mail service.
  globalDb.prisma = {
    commission: { findMany: async () => { jobReads++; return []; } },
    affiliate: { findMany: async () => { jobReads++; return []; } },
    programSettings: { findFirst: async () => { jobReads++; return null; } },
    user: { findUnique: async ({ where }: { where: { id: string } }) => {
      lookups++;
      assert.equal(where.id, 'signed-user');
      return user;
    } },
  };
  emailService.sendWelcomeEmail = async () => { sends++; return { success: true, message: 'Fake email sent' }; };
});
const envNames = ['JWT_SECRET', 'NODE_ENV', 'CRON_SECRET', 'ENABLE_TEST_EMAIL_ROUTE', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
let previousEnv: (string | undefined)[];
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
beforeEach(() => {
  previousEnv = envNames.map((name) => process.env[name]);
  setEnv('JWT_SECRET', signingSecret);
  setEnv('NODE_ENV', 'test');
  setEnv('CRON_SECRET', 'local-cron-test-secret');
  setEnv('ENABLE_TEST_EMAIL_ROUTE', undefined);
  setEnv('PAYPAL_CLIENT_ID', undefined);
  setEnv('PAYPAL_CLIENT_SECRET', undefined);
  user = { id: 'signed-user', role: 'ADMIN', status: 'ACTIVE' };
  lookups = 0;
  sends = 0;
  jobReads = 0;
});
afterEach(() => { envNames.forEach((name, i) => setEnv(name, previousEnv[i])); });
after(() => {
  globalDb.prisma = originalDb;
  emailService.sendWelcomeEmail = originalSend;
});

function request(path = '/api/auth/me', token?: string, extra: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      'x-user-id': 'forged-admin',
      'x-user-role': 'ADMIN',
      'x-user-email': 'forged@example.test',
      ...(token ? { cookie: `auth-token=${token}` } : {}),
      ...extra,
    },
  });
}
async function token(claims: Record<string, unknown> = {}, secret = signingSecret, expiration = '1h') {
  return new SignJWT({ userId: 'signed-user', role: 'ADMIN', ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expiration)
    .sign(new TextEncoder().encode(secret));
}
const cronRoutes = [payoutsGet, payoutsPost, tiersGet, tiersPost];

test('forged identity headers without a cookie deny me, both email methods and both cron methods', async () => {
  assert.equal(await getRequestUserId(request()), null);
  for (const handle of [me, emailGet, emailPost, ...cronRoutes]) {
    assert.equal((await handle(request())).status, 401);
  }
  assert.equal(lookups, 0);
  assert.equal(sends, 0);
  assert.equal(jobReads, 0);
});

test('valid JWT identity overrides forged headers for NextRequest and plain Request', async () => {
  const signed = await token();
  assert.equal(await getRequestUserId(request('/api/auth/me', signed)), 'signed-user');
  assert.equal(await getRequestUserId(new Request('http://localhost', {
    headers: { cookie: `auth-token=${encodeURIComponent(signed)}`, 'x-user-id': 'forged' },
  })), 'signed-user');
  const response = await me(request('/api/auth/me', signed));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, 'signed-user');
});

test('invalid, expired, missing-secret and malformed cookies fail closed', async () => {
  for (const value of ['invalid', await token({}, 'different-secret'), await token({}, signingSecret, '-1s')]) {
    assert.equal(await getRequestUserId(request('/api/auth/me', value)), null);
    assert.equal((await me(request('/api/auth/me', value))).status, 401);
  }
  assert.equal(await getRequestUserId(new Request('http://localhost', {
    headers: { cookie: 'auth-token=%ZZ' },
  })), null);
  const signed = await token();
  setEnv('JWT_SECRET', undefined);
  assert.equal(await getRequestUserId(request('/api/auth/me', signed)), null);
  assert.equal(lookups, 0);
});

test('invite tokens and malformed session claims cannot become login sessions', async () => {
  for (const claims of [{ purpose: 'team-invite' }, { userId: 123 }, { userId: '' }, { role: 'other' }]) {
    assert.equal(await getRequestUserId(request('/api/auth/me', await token(claims))), null);
  }
  const withoutExpiry = await new SignJWT({ userId: 'signed-user', role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(signingSecret));
  assert.equal(await getRequestUserId(request('/api/auth/me', withoutExpiry)), null);
});

test('valid JWT allows an ACTIVE admin on cron and both test-email methods', async () => {
  const signed = await token();
  assert.deepEqual(await authorizeCronOrAdmin(request('/api/cron/tiers', signed)), {
    ok: true, actorId: 'signed-user',
  });
  assert.equal((await emailGet(request('/api/test/email', signed))).status, 200);
  assert.equal((await emailPost(request('/api/test/email', signed))).status, 200);
  assert.equal(sends, 1);
});

test('inactive, non-admin and deleted users cannot run cron or test email', async () => {
  const signed = await token();
  for (const deniedUser of [
    { id: 'signed-user', role: 'ADMIN', status: 'INACTIVE' },
    { id: 'signed-user', role: 'ADMIN', status: 'PENDING' },
    { id: 'signed-user', role: 'AFFILIATE', status: 'ACTIVE' }, null,
  ]) {
    user = deniedUser;
    const auth = await authorizeCronOrAdmin(request('/api/cron/tiers', signed));
    assert.equal(auth.ok, false);
    if (!auth.ok) assert.equal(auth.response.status, 401);
    for (const handle of [emailGet, emailPost]) {
      assert.equal((await handle(request('/api/test/email', signed))).status, 403);
    }
  }
  assert.equal(sends, 0);
});

test('valid cron secret works via x-cron-secret or Bearer without session or database', async () => {
  const credentials: Record<string, string>[] = [
    { 'x-cron-secret': 'local-cron-test-secret' },
    { authorization: 'Bearer local-cron-test-secret' },
  ];
  for (const headers of credentials) {
    assert.deepEqual(await authorizeCronOrAdmin(request('/api/cron/tiers', undefined, headers)), {
      ok: true, actorId: 'system-cron',
    });
  }
  assert.equal(lookups, 0);
});

test('unset or empty cron secret never authorizes an unauthenticated caller', async () => {
  for (const value of [undefined, '']) {
    setEnv('CRON_SECRET', value);
    for (const handle of cronRoutes) {
      const response = await handle(request('/api/cron/tiers', undefined, {
        'x-cron-secret': 'local-cron-test-secret', authorization: 'Bearer undefined',
      }));
      assert.equal(response.status, 401);
    }
  }
  assert.equal(lookups, 0);
});

test('incorrect cron secret denies but does not override a verified ACTIVE admin', async () => {
  assert.equal((await authorizeCronOrAdmin(request('/api/cron/tiers', undefined, {
    'x-cron-secret': 'wrong',
  }))).ok, false);
  setEnv('CRON_SECRET', undefined);
  assert.deepEqual(await authorizeCronOrAdmin(request('/api/cron/tiers', await token())), {
    ok: true, actorId: 'signed-user',
  });
});

test('test email is disabled in production for GET and POST even with a valid admin cookie', async () => {
  setEnv('NODE_ENV', 'production');
  const signed = await token();
  for (const flag of [undefined, 'false', '1', 'TRUE']) {
    setEnv('ENABLE_TEST_EMAIL_ROUTE', flag);
    for (const handle of [emailGet, emailPost]) {
      assert.equal((await handle(request('/api/test/email', signed))).status, 404);
      assert.equal((await handle(request('/api/test/email'))).status, 404);
    }
  }
  assert.equal(lookups, 0);
  assert.equal(sends, 0);
});

test('production test-email opt-in still requires an ACTIVE admin', async () => {
  setEnv('NODE_ENV', 'production');
  setEnv('ENABLE_TEST_EMAIL_ROUTE', 'true');
  for (const handle of [emailGet, emailPost]) {
    assert.equal((await handle(request('/api/test/email'))).status, 401);
    assert.equal((await handle(request('/api/test/email', await token()))).status, 200);
    user = { id: 'signed-user', role: 'ADMIN', status: 'INACTIVE' };
    assert.equal((await handle(request('/api/test/email', await token()))).status, 403);
    user.status = 'ACTIVE';
  }
  assert.equal(sends, 1);
});

test('proxy strips all client x-user headers on every path, including static assets', async () => {
  const signed = await token();
  for (const path of [
    '/', '/api/auth/me', '/api/test/email', '/api/cron/payouts', '/api/cron/tiers',
    '/api/admin/dashboard', '/api/affiliate/profile', '/_next/static/test.js', '/_next/image', '/favicon.ico',
  ]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }), true);
    const result = await proxy(request(path, signed));
    assert.equal(result.status, 200);
    const forwarded = result.headers.get('x-middleware-override-headers')?.split(',') ?? [];
    assert.equal(forwarded.some((name) => name.trim().startsWith('x-user-')), false);
    assert.equal(result.headers.has('x-middleware-request-x-user-id'), false);
    assert.match(result.headers.get('x-middleware-request-cookie') ?? '', /auth-token=/);
  }
});

test('proxy still denies protected routes without a valid cookie and enforces signed role', async () => {
  assert.equal((await proxy(request('/api/admin/dashboard'))).status, 401);
  assert.equal((await proxy(request('/api/affiliate/profile'))).status, 401);
  assert.equal((await proxy(request('/api/admin/dashboard', await token({ role: 'AFFILIATE' })))).status, 403);
  assert.equal((await proxy(request('/api/admin/dashboard', 'invalid'))).status, 401);
});

test('admin webhook methods also return their missing-session denial before doing work', async () => {
  for (const handle of [webhooks.GET, webhooks.POST, webhooks.PUT, webhooks.DELETE]) {
    assert.equal((await handle(request('/api/admin/webhooks'))).status, 401);
  }
  assert.equal(lookups, 0);
});

test('both cron methods execute with a valid secret or verified ACTIVE admin session', async () => {
  const signed = await token();
  for (const handle of cronRoutes) {
    for (const req of [
      request('/api/cron/tiers', signed),
      request('/api/cron/tiers', undefined, { 'x-cron-secret': 'local-cron-test-secret' }),
      request('/api/cron/tiers', undefined, { authorization: 'Bearer local-cron-test-secret' }),
    ]) {
      const response = await handle(req);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);
    }
  }
  assert.ok(jobReads > 0);
});
