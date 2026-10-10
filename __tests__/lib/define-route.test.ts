/**
 * defineRoute: varsayılan reddet + zarf v2 + zod + rate limit + modül + kiracı + idempotency +
 * merkezi hata yönetimi.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockConnectivity = jest.fn((_e: unknown) => false);
const mockStaffFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    dealerStaff: { findFirst: (...a: unknown[]) => mockStaffFindFirst(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
  isPrismaConnectivityError: (e: unknown) => mockConnectivity(e),
}));

jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn().mockResolvedValue(null),
  redisSetJson: jest.fn().mockResolvedValue(undefined),
}));

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/capture-api-error', () => ({
  captureApiError: (...args: unknown[]) => mockCapture(...args),
}));

const mockModuleGate = jest.fn();
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: (...args: unknown[]) => mockModuleGate(...args),
}));

const mockCheckIdem = jest.fn();
const mockStoreIdem = jest.fn();
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: (...args: unknown[]) => mockCheckIdem(...args),
  storeIdempotency: (...args: unknown[]) => mockStoreIdem(...args),
}));

import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

const session = (id: string, role: string) => ({ user: { id, role }, expires: '2099-01-01' });

function req(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; rawBody?: string } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.rawBody !== undefined) body = init.rawBody;
  else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
  }
  return new NextRequest(`http://localhost${url}`, { method: init.method ?? 'GET', headers, body });
}

const noCtx = { params: Promise.resolve({}) };

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockRequireAuth.mockReset();
  mockRateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 9 });
  mockCapture.mockReset();
  mockModuleGate.mockReset().mockResolvedValue(null);
  mockCheckIdem.mockReset().mockResolvedValue({ cached: false, key: '' });
  mockStoreIdem.mockReset().mockResolvedValue(undefined);
  mockConnectivity.mockReset().mockReturnValue(false);
  mockStaffFindFirst.mockReset();
  mockUserFindUnique.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe('tanım anı', () => {
  it('boş rol listesi ve public kiracı route reddedilir', () => {
    expect(() => defineRoute({ roles: [] }, () => null)).toThrow(/roles/);
    expect(() => defineRoute({ roles: 'public', tenant: 'dealer' }, () => null)).toThrow(/public/);
  });

  it('routeMeta katalog için okunabilir', () => {
    const h = defineRoute({ name: 'x', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'ai', schema: z.object({}) }, () => null);
    expect(h.routeMeta).toMatchObject({ name: 'x', tenant: 'dealer', rateLimit: 'ai', hasBodySchema: true, idempotent: false });
  });
});

describe('kimlik ve zarf', () => {
  it('başarı zarfı: ok/success/data/requestId + no-store + x-request-id', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('u1', 'CUSTOMER') });
    const GET = defineRoute({ roles: ['CUSTOMER'] }, ({ user }) => ({ me: user.id }));
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, success: true, data: { me: 'u1' } });
    expect(typeof json.requestId).toBe('string');
    expect(res.headers.get('x-request-id')).toBe(json.requestId);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('gelen geçerli x-request-id korunur', async () => {
    const GET = defineRoute({ roles: 'public' }, () => 'merhaba');
    const res = await GET(req('/api/x', { headers: { 'x-request-id': 'abc-12345678' } }), noCtx);
    expect(res.headers.get('x-request-id')).toBe('abc-12345678');
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('401/403 eski İngilizce mesajlar Türkçe zarfa çevrilir; özel mesaj korunur', async () => {
    const GET = defineRoute({ roles: ['ADMIN'] }, () => 1);
    mockRequireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    let res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(401);
    let json = await res.json();
    expect(json).toMatchObject({ ok: false, success: false, code: 'UNAUTHENTICATED' });
    expect(json.error).toMatch(/giriş/);
    expect(json.message).toBe(json.error);

    mockRequireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    res = await GET(req('/api/x'), noCtx);
    json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe('FORBIDDEN');
    expect(json.error).toBe('Bu işlem için yetkiniz yok.');

    mockRequireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Gizli kapı doğrulaması gerekli.', code: 'ADMIN_GATE_REQUIRED' }, { status: 403 }),
    });
    res = await GET(req('/api/x'), noCtx);
    json = await res.json();
    expect(json).toMatchObject({ code: 'ADMIN_GATE_REQUIRED', error: 'Gizli kapı doğrulaması gerekli.' });
  });

  it('ok() durum kodu ve legacySpread', async () => {
    const POST = defineRoute({ roles: 'public' }, () => ok({ id: 'n1' }, { status: 201, legacySpread: true }));
    const res = await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, success: true, id: 'n1', data: { id: 'n1' } });
  });

  it('handler Response dönerse olduğu gibi geçer (x-request-id eklenir)', async () => {
    const GET = defineRoute({ roles: 'public' }, () => new Response('csv', { status: 200 }));
    const res = await GET(req('/api/x'), noCtx);
    expect(await res.text()).toBe('csv');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('girdi doğrulama', () => {
  const schema = z.object({ name: z.string().min(2), count: z.number().int().max(5) });

  it('geçerli gövde tipli olarak handler’a gelir', async () => {
    const POST = defineRoute({ roles: 'public', schema }, ({ body }) => ({ echoed: body.name, n: body.count }));
    const res = await POST(req('/api/x', { method: 'POST', body: { name: 'Ali', count: 3, extra: 1 } }), noCtx);
    expect(await res.json()).toMatchObject({ data: { echoed: 'Ali', n: 3 } });
  });

  it('şema hatası → 400 VALIDATION + alan detayları', async () => {
    const POST = defineRoute({ roles: 'public', schema }, () => 1);
    const res = await POST(req('/api/x', { method: 'POST', body: { name: 'A', count: 9 } }), noCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION');
    expect(json.details.map((d: { path: string }) => d.path).sort()).toEqual(['count', 'name']);
  });

  it('JSON olmayan Content-Type → 415; bozuk JSON → 400; büyük gövde → 413', async () => {
    const POST = defineRoute({ roles: 'public', schema, maxBodyBytes: 50 }, () => 1);
    let res = await POST(req('/api/x', { method: 'POST', rawBody: 'name=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), noCtx);
    expect(res.status).toBe(415);
    res = await POST(req('/api/x', { method: 'POST', rawBody: '{bad', headers: { 'content-type': 'application/json' } }), noCtx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BAD_REQUEST');
    res = await POST(req('/api/x', { method: 'POST', body: { name: 'x'.repeat(100), count: 1 } }), noCtx);
    expect(res.status).toBe(413);
  });

  it('query şeması: zorlamalı sayı ve çok değerli anahtar', async () => {
    const GET = defineRoute(
      { roles: 'public', query: z.object({ page: z.coerce.number().int().min(1).default(1), tag: z.array(z.string()).optional() }) },
      ({ query }) => ({ page: query.page, tag: query.tag })
    );
    let res = await GET(req('/api/x?page=3&tag=a&tag=b'), noCtx);
    expect(await res.json()).toMatchObject({ data: { page: 3, tag: ['a', 'b'] } });
    res = await GET(req('/api/x?page=0'), noCtx);
    expect(res.status).toBe(400);
  });

  it('params şeması uymazsa 404', async () => {
    const GET = defineRoute({ roles: 'public', params: z.object({ id: z.string().regex(/^c[a-z0-9]{5,}$/) }) }, ({ params }) => params.id);
    let res = await GET(req('/api/x/cabcdef'), { params: Promise.resolve({ id: 'cabcdef' }) });
    expect(await res.json()).toMatchObject({ data: 'cabcdef' });
    res = await GET(req('/api/x/bad'), { params: Promise.resolve({ id: '../etc' }) });
    expect(res.status).toBe(404);
  });
});

describe('rate limit ve modül kapısı', () => {
  it('adlandırılmış politika kullanıcı başına kova ile çalışır; aşımda 429 + Retry-After', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('u1', 'DEALER') });
    const POST = defineRoute({ name: 'ai.reply', roles: ['DEALER'], rateLimit: 'ai' }, () => 1);
    await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(mockRateLimit).toHaveBeenCalledWith('route:ai.reply:u:u1', 10, 60_000);

    mockRateLimit.mockResolvedValueOnce({ ok: false, retryAfterMs: 4200 });
    const res = await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('public politikada IP anahtarı; sayaç çökerse istek geçer (fail-open)', async () => {
    const POST = defineRoute({ name: 'pub', roles: 'public', rateLimit: { max: 2, windowMs: 1000, by: 'ip' } }, () => 1);
    await POST(req('/api/x', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } }), noCtx);
    expect(mockRateLimit).toHaveBeenCalledWith('route:pub:ip:1.2.3.4', 2, 1000);
    mockRateLimit.mockRejectedValueOnce(new Error('redis down'));
    const res = await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(res.status).toBe(200);
  });

  it('kapalı modül → 403 MODULE_DISABLED', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('u1', 'CUSTOMER') });
    mockModuleGate.mockResolvedValueOnce(NextResponse.json({ error: 'kapalı' }, { status: 403 }));
    const GET = defineRoute({ roles: ['CUSTOMER'], module: 'surprise_boxes' }, () => 1);
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockModuleGate).toHaveBeenCalledWith('surprise_boxes', expect.objectContaining({ userId: 'u1' }));
  });
});

describe('kiracı kapsamı', () => {
  const handler = jest.fn(({ tenant }: { tenant: { dealerId: string } }) => ({ dealerId: tenant.dealerId }));

  it('DEALER kendi kapsamı', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('d1', 'DEALER') });
    const GET = defineRoute({ roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer' }, handler);
    const res = await GET(req('/api/x'), noCtx);
    expect(await res.json()).toMatchObject({ data: { dealerId: 'd1' } });
  });

  it('pasif STAFF → 403', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('s1', 'STAFF') });
    mockStaffFindFirst.mockResolvedValue(null);
    const GET = defineRoute({ roles: ['DEALER', 'STAFF'], tenant: 'dealer' }, handler);
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(403);
  });

  it('ADMIN dealerId’siz 400 TENANT_REQUIRED; okuma serbest, yazma varsayılan salt-okunur', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('a1', 'ADMIN') });
    mockUserFindUnique.mockResolvedValue({ role: 'DEALER' });
    const GET = defineRoute({ roles: ['DEALER', 'ADMIN'], tenant: 'dealer' }, handler);
    let res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TENANT_REQUIRED');
    res = await GET(req('/api/x?dealerId=d9'), noCtx);
    expect(await res.json()).toMatchObject({ data: { dealerId: 'd9' } });

    const POST = defineRoute({ roles: ['DEALER', 'ADMIN'], tenant: 'dealer' }, handler);
    res = await POST(req('/api/x', { method: 'POST', headers: { 'x-act-as-dealer': 'd9' } }), noCtx);
    expect(res.status).toBe(403);
    const POST2 = defineRoute({ roles: ['DEALER', 'ADMIN'], tenant: { kind: 'dealer', allowAdminWrite: true } }, handler);
    res = await POST2(req('/api/x', { method: 'POST', headers: { 'x-act-as-dealer': 'd9' } }), noCtx);
    expect(res.status).toBe(200);
  });
});

describe('idempotency', () => {
  it('önbellekte varsa handler çalışmaz; yoksa başarılı yanıt saklanır', async () => {
    mockRequireAuth.mockResolvedValue({ session: session('u1', 'CUSTOMER') });
    const handler = jest.fn(() => ok({ done: true }, { status: 201 }));
    const POST = defineRoute({ name: 'shop.buy', roles: ['CUSTOMER'], idempotent: true }, handler);

    mockCheckIdem.mockResolvedValueOnce({ cached: true, response: NextResponse.json({ ok: true, replay: 1 }, { status: 201 }) });
    let res = await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('idempotent-replay')).toBe('true');

    mockCheckIdem.mockResolvedValueOnce({ cached: false, key: 'k'.repeat(20) });
    res = await POST(req('/api/x', { method: 'POST' }), noCtx);
    expect(res.status).toBe(201);
    expect(mockStoreIdem).toHaveBeenCalledWith('k'.repeat(20), 'shop.buy:u1', 201, expect.objectContaining({ ok: true, data: { done: true } }));
  });
});

describe('merkezi hata yönetimi', () => {
  it('ApiError kodu ve mesajıyla döner', async () => {
    const GET = defineRoute({ roles: 'public' }, () => {
      throw new ApiError('INSUFFICIENT_POINTS', 'Puanınız yetmiyor.', { details: { need: 50 } });
    });
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'INSUFFICIENT_POINTS', error: 'Puanınız yetmiyor.', details: { need: 50 } });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('DB bağlantı hatası → 503 retryable + Retry-After', async () => {
    mockConnectivity.mockReturnValue(true);
    const GET = defineRoute({ roles: 'public' }, () => {
      throw new Error('P1001');
    });
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('8');
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  });

  it('Prisma P2025 → 404, P2002 → 409', async () => {
    const prismaErr = (code: string) => Object.assign(new Error('x'), { code, name: 'PrismaClientKnownRequestError' });
    let GET = defineRoute({ roles: 'public' }, () => {
      throw prismaErr('P2025');
    });
    expect((await GET(req('/api/x'), noCtx)).status).toBe(404);
    GET = defineRoute({ roles: 'public' }, () => {
      throw prismaErr('P2002');
    });
    expect((await GET(req('/api/x'), noCtx)).status).toBe(409);
  });

  it('beklenmeyen hata → 500 INTERNAL, Sentry’ye requestId ile, iç ayrıntı sızmaz', async () => {
    const GET = defineRoute({ name: 'boom', roles: 'public' }, () => {
      throw new Error('SELECT * FROM "User" gizli ayrıntı');
    });
    const res = await GET(req('/api/x'), noCtx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('INTERNAL');
    expect(JSON.stringify(json)).not.toContain('SELECT');
    expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: 'boom', requestId: json.requestId }));
  });
});
