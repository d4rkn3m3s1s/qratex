/**
 * A1 kimlik sayfaları — sunucu yardımcıları:
 *  - `/auth/complete` davet sonucu: "Davet bonusu eklendi" yalnız GERÇEKTEN işlenen ödülde
 *    (eskiden yanıt okunmadan her durumda gösteriliyordu).
 *  - `/auth/signin` → `/auth/login` kalıcı yönlendirme: callbackUrl yalnız güvenli YOL olarak,
 *    `error` yalnız bilinen kod olarak taşınır (açık yönlendirme / ham metin enjeksiyonu yok).
 *  - `POST /api/auth/signup-intent`: OAuth'ta işletme niyeti httpOnly kısa ömürlü çereze yazılır.
 */
import { NextRequest } from 'next/server';
import {
  applyReferralCode,
  interpretReferralResponse,
} from '@/app/(auth)/auth/_components/referral-outcome';

jest.mock('@/lib/auth', () => ({ SIGNUP_INTENT_COOKIE: 'qx_signup_intent' }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

const permanentRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { url });
});
jest.mock('next/navigation', () => ({ permanentRedirect: (u: string) => permanentRedirect(u) }));

describe('davet sonucu (sahte başarı ekranı)', () => {
  it('zaten kullanılmış / geçersiz kod (4xx) → failed; API mesajı gerekçe olur', () => {
    expect(interpretReferralResponse(false, { error: 'Bu davet kodu zaten kullanılmış', code: 'ALREADY_USED' })).toEqual({
      kind: 'failed',
      reason: 'Bu davet kodu zaten kullanılmış',
    });
    expect(interpretReferralResponse(false, null)).toEqual({ kind: 'failed' });
  });

  it('2xx ama success yok (ör. modül kapısı zarfı, bozuk gövde) → failed', () => {
    expect(interpretReferralResponse(true, {})).toEqual({ kind: 'failed' });
    expect(interpretReferralResponse(true, 'ok')).toEqual({ kind: 'failed' });
    expect(interpretReferralResponse(true, { success: 'true' })).toEqual({ kind: 'failed' });
  });

  it('kaydedildi ama ödül bekliyor (PENDING) → pending, "eklendi" denmez', () => {
    expect(interpretReferralResponse(true, { success: true, status: 'PENDING', pointsEarned: 0 })).toEqual({ kind: 'pending' });
    expect(interpretReferralResponse(true, { success: true, status: 'COMPLETED', pointsEarned: 0 })).toEqual({ kind: 'pending' });
  });

  it('yalnız COMPLETED + pozitif puan → credited', () => {
    expect(interpretReferralResponse(true, { success: true, status: 'COMPLETED', pointsEarned: 500 })).toEqual({
      kind: 'credited',
      points: 500,
    });
  });

  it('ağ hatası ve JSON olmayan yanıt → failed (sayfa çökmez, başarı yazmaz)', async () => {
    const throwing = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(applyReferralCode('ABC', throwing)).resolves.toEqual({ kind: 'failed' });

    const html = jest.fn(async () => ({
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch;
    await expect(applyReferralCode('ABC', html)).resolves.toEqual({ kind: 'failed' });
  });
});

describe('/auth/signin → /auth/login', () => {
  async function run(sp: Record<string, string>) {
    const { default: Page } = await import('@/app/(auth)/auth/signin/page');
    try {
      await Page({ searchParams: Promise.resolve(sp) });
    } catch {
      /* permanentRedirect fırlatır */
    }
    return permanentRedirect.mock.calls.at(-1)?.[0] as string;
  }

  beforeEach(() => permanentRedirect.mockClear());

  it('parametresiz çağrı doğrudan /auth/login', async () => {
    await expect(run({})).resolves.toBe('/auth/login');
  });

  it('güvenli callbackUrl yol olarak korunur', async () => {
    await expect(run({ callbackUrl: '/customer/games?x=1' })).resolves.toBe(
      `/auth/login?callbackUrl=${encodeURIComponent('/customer/games?x=1')}`
    );
  });

  it.each(['//evil.com', '/\\evil.com', '/%5Cevil.com', 'javascript:alert(1)', 'https://evil.com/x'])(
    'zararlı callbackUrl düşürülür: %s',
    async (cb) => {
      await expect(run({ callbackUrl: cb })).resolves.toBe('/auth/login');
    }
  );

  it('bilinmeyen error metni taşınmaz', async () => {
    await expect(run({ error: '<script>alert(1)</script>' })).resolves.toBe('/auth/login');
  });
});

describe('POST /api/auth/signup-intent', () => {
  function post(body: unknown) {
    return new NextRequest(new URL('https://app.qratex.com/api/auth/signup-intent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('DEALER niyeti httpOnly, kısa ömürlü çereze yazılır', async () => {
    const { POST } = await import('@/app/api/auth/signup-intent/route');
    const res = await POST(post({ role: 'DEALER' }));
    expect(res.status).toBe(200);
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain('qx_signup_intent=DEALER');
    expect(header.toLowerCase()).toContain('httponly');
    expect(header).toMatch(/Max-Age=900/i);
  });

  it('CUSTOMER seçimi niyeti siler', async () => {
    const { POST } = await import('@/app/api/auth/signup-intent/route');
    const res = await POST(post({ role: 'CUSTOMER' }));
    expect(res.headers.get('set-cookie') ?? '').toMatch(/qx_signup_intent=;.*Max-Age=0/i);
  });

  it('ADMIN/STAFF gibi roller reddedilir (yetki yükseltme yok)', async () => {
    const { POST } = await import('@/app/api/auth/signup-intent/route');
    for (const role of ['ADMIN', 'STAFF', 'dealer']) {
      const res = await POST(post({ role }));
      expect(res.status).toBe(400);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });
});
