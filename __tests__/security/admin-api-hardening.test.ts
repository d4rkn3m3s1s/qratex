/**
 * guvenlik-admin-api — uygulama sonrası kabul testleri (B5 CSRF köken, B11 CSP tek kaynak,
 * B13 sır karşılaştırma + CRON_SECRET doğrulaması).
 */
import { webcrypto } from 'crypto';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
process.env.NEXTAUTH_SECRET = 'test-secret-proxy';

type Tok = { role?: string; id?: string; sub?: string; jti?: string } | null;
const state: { token: Tok } = { token: null };

jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' } }));
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn(async () => state.token) }));
jest.mock('next-auth/middleware', () => {
  const { NextResponse } = jest.requireActual('next/server');
  return {
    withAuth:
      (fn: (req: unknown) => unknown, opts: { callbacks: { authorized: (a: { token: Tok }) => boolean } }) =>
      async (req: { url: string; nextauth?: unknown }) => {
        if (!opts.callbacks.authorized({ token: state.token })) return NextResponse.redirect(new URL('/auth/login', req.url));
        req.nextauth = { token: state.token };
        return fn(req);
      },
  };
});
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));

import { NextRequest } from 'next/server';
import { proxy, config as proxyConfig } from '@/proxy';
import { checkRequestOrigin } from '@/lib/security/origin-guard';
import { requireCronSecretOrAdmin } from '@/lib/internal-cron-or-admin';
import { validateEnv } from '@/lib/env-validation';
import { normalizeCspReports } from '@/lib/security/csp-report';

const headersConfig = require('../../config/security-headers.js') as {
  CONTENT_SECURITY_POLICY: string;
  CONTENT_SECURITY_POLICY_REPORT_ONLY: string;
  CSP_REPORT_PATH: string;
  SECURITY_HEADERS: Array<{ key: string; value: string }>;
};

const SELF = 'https://qratex.test';

function apiReq(path: string, method: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, SELF), { method, headers: new Headers(headers) });
}

beforeEach(() => {
  state.token = null;
  mockRequireAuth.mockReset();
});

describe('B5 — CSRF köken denetimi (saf karar)', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  const base = { method: 'POST', pathname: '/api/admin/users', selfOrigin: SELF };

  it('aynı köken → izin', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ origin: SELF }) }).ok).toBe(true);
  });
  it('yabancı köken → red', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ origin: 'https://evil.example' }) })).toEqual({ ok: false, reason: 'foreign_origin' });
  });
  it('alt alan (aynı site, ör. kullanıcı içeriği CDN) → red', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ origin: 'https://cdn.qratex.test' }) }).ok).toBe(false);
  });
  it('sandbox iframe (Origin: null) → red', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ origin: 'null' }) })).toEqual({ ok: false, reason: 'null_origin' });
  });
  it('Origin yok + Sec-Fetch-Site: same-site/cross-site → red; same-origin → izin', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ 'sec-fetch-site': 'same-site' }) }).ok).toBe(false);
    expect(checkRequestOrigin({ ...base, headers: h({ 'sec-fetch-site': 'cross-site' }) }).ok).toBe(false);
    expect(checkRequestOrigin({ ...base, headers: h({ 'sec-fetch-site': 'same-origin' }) }).ok).toBe(true);
  });
  it('tarayıcı dışı istemci (Origin ve Sec-Fetch-Site yok) → izin (çerezle yetki almaz)', () => {
    expect(checkRequestOrigin({ ...base, headers: h({}) }).ok).toBe(true);
  });
  it('GET serbest; makineden makineye uçlar muaf', () => {
    expect(checkRequestOrigin({ ...base, method: 'GET', headers: h({ origin: 'https://evil.example' }) }).ok).toBe(true);
    for (const p of ['/api/cron/daily', '/api/internal/inngest/x', '/api/webhooks/stripe', '/api/inngest', '/api/partner/v1/x', '/api/security/csp-report']) {
      expect(checkRequestOrigin({ ...base, pathname: p, headers: h({ origin: 'https://evil.example' }) }).ok).toBe(true);
    }
  });
  it('açık CORS izin listesindeki köken → izin', () => {
    expect(checkRequestOrigin({ ...base, headers: h({ origin: 'https://partner.example' }) }, ['https://partner.example']).ok).toBe(true);
  });
});

describe('B5 — proxy uçtan uca', () => {
  it('yabancı kökenden admin POST → 403 CSRF_ORIGIN_MISMATCH (route koduna ulaşmaz)', async () => {
    state.token = { role: 'ADMIN', id: 'a1', sub: 'a1', jti: 'j1' };
    const res = await proxy(apiReq('/api/admin/users', 'POST', { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CSRF_ORIGIN_MISMATCH');
  });
  it('müşteri ucu da korunur (yalnız admin değil)', async () => {
    const res = await proxy(apiReq('/api/customer/favorites', 'DELETE', { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });
  it('aynı kökenden müşteri POST → proxy geçirir', async () => {
    const res = await proxy(apiReq('/api/customer/favorites', 'POST', { origin: SELF }));
    expect(res.status).toBe(200);
  });
  it('proxy ikinci bir CSP yazmaz (tek kaynak config/security-headers.js)', async () => {
    const res = await proxy(apiReq('/api/customer/favorites', 'GET'));
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('/staff eşleştiricide (rol kuralı artık ölü değil)', () => {
    expect(proxyConfig.matcher).toEqual(expect.arrayContaining(['/staff', '/staff/:path*']));
  });
});

describe('B11 — CSP tek kaynak', () => {
  const csp = headersConfig.CONTENT_SECURITY_POLICY;
  it('kullanılmayan herkese açık barındırma alanları yok, PostHog + bölgesel Sentry var', () => {
    expect(csp).not.toMatch(/supabase|netlify/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.posthog\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.sentry\.io/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it('Report-Only gözlem politikası eval\'siz (yalnız wasm) ve rapor ucuna gönderir', () => {
    const ro = headersConfig.CONTENT_SECURITY_POLICY_REPORT_ONLY;
    expect(ro).not.toContain("'unsafe-eval'");
    expect(ro).toContain("'wasm-unsafe-eval'");
    expect(ro).toContain(`report-uri ${headersConfig.CSP_REPORT_PATH}`);
    expect(headersConfig.SECURITY_HEADERS.map((x) => x.key)).toContain('Content-Security-Policy-Report-Only');
  });
  it('rapor normalizasyonu yalnız köken tutar (yol/sorgu atılır), iki biçimi de okur', () => {
    const legacy = normalizeCspReports({
      'csp-report': {
        'document-uri': 'https://qratex.test/customer/feedback/abc123def456?token=gizli',
        'effective-directive': 'script-src',
        'blocked-uri': 'eval',
        'source-file': 'https://qratex.test/_next/static/chunks/x.js?v=1',
      },
    });
    expect(legacy).toEqual([{ directive: 'script-src', blocked: 'eval', source: 'https://qratex.test', page: '/customer/feedback/:id' }]);
    const modern = normalizeCspReports([{ type: 'csp-violation', body: { effectiveDirective: 'connect-src', blockedURL: 'https://x.example/a?b=c', documentURL: 'https://qratex.test/' } }]);
    expect(modern[0]).toMatchObject({ directive: 'connect-src', blocked: 'https://x.example' });
  });
});

describe('B13 — sır karşılaştırma ve CRON_SECRET', () => {
  const OLD = process.env.CRON_SECRET;
  afterAll(() => {
    process.env.CRON_SECRET = OLD;
  });

  it('cron-veya-admin: doğru Bearer → admin kontrolü atlanır; yanlış/boş → requireAuth(ADMIN)', async () => {
    process.env.CRON_SECRET = 's'.repeat(40);
    const ok = await requireCronSecretOrAdmin(apiReq('/api/security/suspicious', 'POST', { authorization: `Bearer ${'s'.repeat(40)}` }));
    expect(ok).toBeNull();
    expect(mockRequireAuth).not.toHaveBeenCalled();

    mockRequireAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const denied = await requireCronSecretOrAdmin(apiReq('/api/security/suspicious', 'POST', { authorization: 'Bearer yanlis' }));
    expect(denied?.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalledWith(['ADMIN']);
  });

  it('CRON_SECRET tanımsızken boş Bearer cron sayılmaz', async () => {
    delete process.env.CRON_SECRET;
    mockRequireAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const denied = await requireCronSecretOrAdmin(apiReq('/api/security/suspicious', 'POST', { authorization: 'Bearer ' }));
    expect(denied?.status).toBe(401);
  });

  it('env doğrulaması: üretimde eksik ya da kısa CRON_SECRET uyarı üretir', () => {
    const base = { DATABASE_URL: 'postgres://x', NEXTAUTH_SECRET: 'x'.repeat(40) };
    expect(validateEnv(base, true).issues.map((i) => i.key)).toContain('CRON_SECRET');
    expect(validateEnv({ ...base, CRON_SECRET: 'kisa' }, true).issues.map((i) => i.key)).toContain('CRON_SECRET');
    expect(validateEnv({ ...base, CRON_SECRET: 'u'.repeat(40) }, true).issues.map((i) => i.key)).not.toContain('CRON_SECRET');
  });
});
