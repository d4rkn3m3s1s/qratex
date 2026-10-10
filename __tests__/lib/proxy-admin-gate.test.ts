/**
 * proxy.ts uçtan uca — P0-01 kabul ölçütü: "Sahte cookie ile /admin ve /api/admin/* 403/yönlendirme".
 *
 * Denetimdeki saldırı: ADMIN rolü verilmiş ama cevabı bilmeyen hesap DevTools'ta
 * `document.cookie = "admin_gate=<id>.<64 hex>"` yazınca hem sayfa kapısını geçiyor hem de
 * `/api/admin/*` uçlarına doğrudan ulaşıyordu (proxy API'yi hiç denetlemiyordu).
 */
import { webcrypto } from 'crypto';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
process.env.NEXTAUTH_SECRET = 'test-secret-proxy';

type Tok = { role?: string; id?: string; sub?: string; jti?: string } | null;
const state: { token: Tok; redis: unknown } = { token: null, redis: null };

jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => state.redis) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' } }));
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn(async () => state.token) }));
jest.mock('next-auth/middleware', () => {
  // withAuth'un yalın taklidi: token'ı req.nextauth'a koy, yetkisizse girişe yönlendir.
  const { NextResponse } = jest.requireActual('next/server');
  return {
    withAuth:
      (
        fn: (req: unknown) => unknown,
        opts: { callbacks: { authorized: (a: { token: Tok }) => boolean } }
      ) =>
      async (req: { url: string; nextauth?: unknown }) => {
        if (!opts.callbacks.authorized({ token: state.token })) {
          return NextResponse.redirect(new URL('/auth/login', req.url));
        }
        req.nextauth = { token: state.token };
        return fn(req);
      },
  };
});

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { signElevation } from '@/lib/admin-elevation';

const ADMIN = { role: 'ADMIN', id: 'admin1', sub: 'admin1', jti: 'jti-1' };

function req(path: string, cookie?: string, method = 'GET') {
  const headers = new Headers();
  if (cookie) headers.set('cookie', `admin_gate=${cookie}`);
  return new NextRequest(new URL(path, 'https://qratex.test'), { method, headers });
}

beforeEach(() => {
  state.token = null;
  state.redis = null;
});

describe('proxy — /api/admin/* kapısı', () => {
  it('SALDIRI: ADMIN + denetimdeki sahte çerez (<id>.<64 hex>) → 403 ADMIN_GATE_REQUIRED', async () => {
    state.token = ADMIN;
    const res = await proxy(req('/api/admin/users', `admin1.${'a'.repeat(64)}`));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_GATE_REQUIRED');
  });

  it('SALDIRI: ADMIN + çerezsiz → 403 (settings GET dahil; cevap okunamaz)', async () => {
    state.token = ADMIN;
    const res = await proxy(req('/api/admin/settings/admin-gate'));
    expect(res.status).toBe(403);
  });

  it('SALDIRI: sırsız üretilmiş g2 biçimli çerez → 403', async () => {
    state.token = ADMIN;
    const forged = `g2.admin1.0.${Math.floor(Date.now() / 1000) + 3600}.nosession.${'A'.repeat(43)}`;
    expect((await proxy(req('/api/admin/users', forged))).status).toBe(403);
  });

  it('geçerli imzalı çerez → route\'a geçer', async () => {
    state.token = ADMIN;
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-1' });
    const res = await proxy(req('/api/admin/users', c));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('"tüm kapı oturumlarını sonlandır" sonrası (Redis cfgVer arttı) eski çerez → 403', async () => {
    state.token = ADMIN;
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-1' });
    state.redis = { cfgVer: 1 };
    expect((await proxy(req('/api/admin/users', c))).status).toBe(403);
  });

  it('kapı ucu ve ekip modülü muaf (çerezsiz geçer)', async () => {
    state.token = ADMIN;
    expect((await proxy(req('/api/admin/gate', undefined, 'POST'))).status).toBe(200);
    expect((await proxy(req('/api/admin/team/tasks'))).status).toBe(200);
  });

  it('ADMIN olmayan ve oturumsuz istekler route\'un kendi kontrolüne bırakılır', async () => {
    state.token = { role: 'DEALER', id: 'd1', jti: 'x' };
    expect((await proxy(req('/api/admin/team/tasks'))).status).toBe(200);
    state.token = null;
    expect((await proxy(req('/api/admin/users'))).status).toBe(200);
  });
});

describe('proxy — /admin sayfa kapısı', () => {
  it('SALDIRI: sahte çerezle /admin → /admin-gate yönlendirmesi + sahte çerez silinir', async () => {
    state.token = ADMIN;
    const res = await proxy(req('/admin/users', `admin1.${'f'.repeat(64)}`));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/admin-gate');
    expect(loc.searchParams.get('from')).toBe('/admin/users');
    expect(res.headers.get('set-cookie') || '').toMatch(/admin_gate=;/);
  });

  it('başka oturumun (farklı jti) geçerli çerezi sayfada işe yaramaz', async () => {
    state.token = { ...ADMIN, jti: 'jti-2' };
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-1' });
    const res = await proxy(req('/admin', c));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin-gate');
  });

  it('geçerli çerezle /admin açılır; /admin-gate çerez istemez', async () => {
    state.token = ADMIN;
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-1' });
    expect((await proxy(req('/admin', c))).headers.get('x-middleware-next')).toBe('1');
    expect((await proxy(req('/admin-gate'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('ADMIN olmayan rol /admin-gate\'e giremez (kendi paneline yönlenir)', async () => {
    state.token = { role: 'CUSTOMER', id: 'c1', jti: 'x' };
    const res = await proxy(req('/admin-gate'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/customer');
  });
});

describe('proxy — Permissions-Policy (P0-36)', () => {
  it('tarama sayfası ve panel sayfası camera=(self); API camera=()', async () => {
    state.token = { role: 'DEALER', id: 'd1', jti: 'x' };
    expect((await proxy(req('/dealer/scan'))).headers.get('permissions-policy')).toContain('camera=(self)');
    expect((await proxy(req('/dealer'))).headers.get('permissions-policy')).toContain('camera=(self)');
    expect((await proxy(req('/api/dealer/scan'))).headers.get('permissions-policy')).toContain('camera=()');
  });
});
