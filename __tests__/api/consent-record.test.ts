/**
 * P0-31 — Rıza kararı sunucuda KANIT olarak yazılır (`ConsentRecord`, KVKK m.5 ispat yükü).
 * Ham IP tutulmaz; oturum kaydı analitik olmadan kaydedilemez; kayıt yalnız eklenir.
 */
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'jest-agent' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDb();
  setSession(null);
  process.env.NEXTAUTH_SECRET = 'test-secret';
  db.consentRecord.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cr1', createdAt: new Date(), ...data }));
});

describe('POST /api/consent', () => {
  it('oturumsuz ziyaretçinin reddi anonId ile kanıtlanır; ham IP yazılmaz', async () => {
    const { POST } = await import('@/app/api/consent/route');
    const res = await POST(post({ version: 2, analytics: false, replay: true, marketing: false, surface: 'banner', anonId: 'abcd1234-efgh' }), {});
    expect(res.status).toBe(201);
    const data = db.consentRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: null, anonId: 'abcd1234-efgh', version: '2', analytics: false, marketing: false, source: 'banner' });
    // Bağımlı kategori: analitik yokken oturum kaydı "evet" kaydedilemez.
    expect(data.replay).toBe(false);
    expect(JSON.stringify(data)).not.toContain('203.0.113.7');
    // Tuzsuz sha256 değil (IPv4 uzayında geri çevrilebilirdi).
    const unsalted = createHash('sha256').update('consent:203.0.113.7').digest('hex').slice(0, 32);
    expect(data.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(data.ipHash).not.toBe(unsalted);
  });

  it('oturum açmış kullanıcının kararı hesabına bağlanır (cihazlar arası senkron)', async () => {
    setSession(as('user-9', 'CUSTOMER'));
    const { POST } = await import('@/app/api/consent/route');
    await POST(post({ version: 2, analytics: true, replay: true, marketing: false, surface: 'settings' }), {});
    expect(db.consentRecord.create.mock.calls[0][0].data).toMatchObject({ userId: 'user-9', analytics: true, replay: true, source: 'settings' });
  });

  it('kimliksiz ve anonId\'siz istek kayıt yazmaz', async () => {
    const { POST } = await import('@/app/api/consent/route');
    const res = await POST(post({ version: 2, analytics: true, replay: false, marketing: false }), {});
    expect(res.status).toBe(200);
    expect(db.consentRecord.create).not.toHaveBeenCalled();
  });

  it('kayıt yalnız eklenir: güncelleme/silme yolu yok', async () => {
    const mod = await import('@/app/api/consent/route');
    expect(Object.keys(mod).filter((k) => ['PUT', 'PATCH', 'DELETE'].includes(k))).toEqual([]);
  });
});
