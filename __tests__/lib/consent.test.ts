/**
 * Rıza modülü (P0-31): sürümlü, kategori bazlı, varsayılan "hayır"; sunucu okuyucusu,
 * eski localStorage kaydının taşınması, analitik URL redaksiyonu, istemci deposu.
 */
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  LEGACY_CONSENT_STORAGE_KEY,
  REDACTED,
  acceptAllConsent,
  buildConsentCookie,
  createConsent,
  effectiveConsent,
  hasConsent,
  isConsentCurrent,
  isReplayAllowedPath,
  migrateLegacyConsent,
  parseConsent,
  readConsentCookieValue,
  redactAnalyticsEvent,
  redactUrl,
  rejectOptionalConsent,
  serializeConsent,
} from '@/lib/consent';
import { readConsentFromCookieHeader, readConsentFromRequest } from '@/lib/consent/server';

const NOW = new Date('2026-10-08T10:00:00Z');

describe('rıza çekirdeği', () => {
  it('varsayılan: karar yoksa yalnız zorunlu', () => {
    const eff = effectiveConsent(null, NOW);
    expect(eff.decided).toBe(false);
    expect(eff.categories).toEqual({ necessary: true, analytics: false, replay: false, marketing: false });
    expect(hasConsent(null, 'necessary')).toBe(true);
    expect(hasConsent(null, 'analytics')).toBe(false);
  });

  it('oturum kaydı analitik onayı olmadan verilemez', () => {
    const c = createConsent({ replay: true }, { now: NOW });
    expect(c.categories.replay).toBe(false);
    expect(hasConsent(c, 'replay', NOW)).toBe(false);
    const c2 = createConsent({ analytics: true, replay: true }, { now: NOW });
    expect(hasConsent(c2, 'replay', NOW)).toBe(true);
    expect(hasConsent(c2, 'marketing', NOW)).toBe(false);
  });

  it('serileştirme gidiş-dönüş (çerez-güvenli)', () => {
    const c = createConsent({ analytics: true, marketing: true }, { now: NOW, source: 'preferences' });
    const raw = serializeConsent(c);
    expect(raw).toMatch(/^[0-9a-z.]+$/);
    expect(raw).toBe(`${CONSENT_VERSION}.a1.r0.m1.${Math.floor(NOW.getTime() / 1000)}.p`);
    expect(parseConsent(raw)).toEqual(c);
    expect(parseConsent(encodeURIComponent(raw))).toEqual(c);
  });

  it('bozuk çerez → karar yok', () => {
    for (const bad of ['', 'x', '2.a1.r1.m1', '2.a2.r0.m0.1.b', '2.a1.r0.m0.0.b', 'a'.repeat(80), '%E0%A4%A']) {
      expect(parseConsent(bad)).toBeNull();
    }
    // r1 ama a0 → replay false'a zorlanır
    expect(parseConsent('2.a0.r1.m0.1700000000.b')?.categories.replay).toBe(false);
  });

  it('eski sürüm ve 180 günden eski rıza geçersiz', () => {
    const old = createConsent({ analytics: true }, { now: NOW, version: CONSENT_VERSION - 1 });
    expect(isConsentCurrent(old, NOW)).toBe(false);
    expect(hasConsent(old, 'analytics', NOW)).toBe(false);
    const stale = createConsent({ analytics: true }, { now: new Date(NOW.getTime() - (CONSENT_MAX_AGE_SECONDS + 60) * 1000) });
    expect(isConsentCurrent(stale, NOW)).toBe(false);
    const future = createConsent({ analytics: true }, { now: new Date(NOW.getTime() + 3 * 86400_000) });
    expect(isConsentCurrent(future, NOW)).toBe(false);
  });

  it('tümünü kabul / isteğe bağlıları reddet', () => {
    expect(effectiveConsent(acceptAllConsent({ now: NOW }), NOW).categories).toEqual({
      necessary: true,
      analytics: true,
      replay: true,
      marketing: true,
    });
    const rej = effectiveConsent(rejectOptionalConsent({ now: NOW }), NOW);
    expect(rej.decided).toBe(true);
    expect(rej.categories.analytics).toBe(false);
  });

  it('çerez dizesi ve Cookie başlığı okuma', () => {
    const c = acceptAllConsent({ now: NOW });
    const cookie = buildConsentCookie(c, { secure: true });
    expect(cookie).toContain(`${CONSENT_COOKIE}=`);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    const header = `foo=bar; ${CONSENT_COOKIE}=${serializeConsent(c)}; other=1`;
    expect(readConsentCookieValue(header)).toBe(serializeConsent(c));
    expect(readConsentCookieValue('qx_consent_x=1')).toBeNull();
  });
});

describe('eski localStorage kaydının taşınması', () => {
  it('ret → güncel sürümde hepsi kapalı (yeniden sorulmaz)', () => {
    const m = migrateLegacyConsent(JSON.stringify({ accepted: true, optionalRejected: true, date: NOW.toISOString() }), NOW);
    expect(m?.version).toBe(CONSENT_VERSION);
    expect(effectiveConsent(m, NOW)).toMatchObject({ decided: true, categories: { analytics: false, replay: false } });
  });

  it('kabul → eski sürüm (yeni kategori sorulmadığı için banner yeniden sorar, işleme kapalı)', () => {
    const m = migrateLegacyConsent(JSON.stringify({ accepted: true, date: NOW.toISOString() }), NOW);
    expect(m?.version).toBeLessThan(CONSENT_VERSION);
    expect(effectiveConsent(m, NOW)).toMatchObject({ decided: false, categories: { analytics: false } });
  });

  it('bozuk/eksik kayıt → null', () => {
    expect(migrateLegacyConsent(null)).toBeNull();
    expect(migrateLegacyConsent('{')).toBeNull();
    expect(migrateLegacyConsent('{"accepted":false}')).toBeNull();
  });
});

describe('sunucu okuyucusu', () => {
  it('Cookie başlığından ve NextRequest benzeri nesneden', () => {
    const raw = serializeConsent(acceptAllConsent());
    expect(readConsentFromCookieHeader(`${CONSENT_COOKIE}=${raw}`).categories.analytics).toBe(true);
    expect(readConsentFromCookieHeader(null).decided).toBe(false);
    const req = { cookies: { get: (n: string) => (n === CONSENT_COOKIE ? { value: raw } : undefined) } };
    expect(readConsentFromRequest(req).decided).toBe(true);
    const throwing = {
      cookies: {
        get: () => {
          throw new Error('x');
        },
      },
    };
    expect(readConsentFromRequest(throwing).decided).toBe(false);
  });
});

describe('analitik redaksiyonu', () => {
  it('şifre sıfırlama / magic / OAuth parametrelerini gizler', () => {
    const out = redactUrl('https://app.qratex.com/auth/reset-password?token=abc123&callbackUrl=%2Fcustomer');
    expect(out).not.toContain('abc123');
    expect(out).toContain(`token=${REDACTED}`);
    expect(out).toContain('callbackUrl=%2Fcustomer');
    expect(redactUrl('/auth/magic?token=t0k&email=a%40b.com')).toBe(`/auth/magic?token=${REDACTED}&email=${REDACTED}`);
    expect(redactUrl('/api/auth/callback/google?code=xyz&state=s')).toBe(`/api/auth/callback/google?code=${REDACTED}&state=${REDACTED}`);
    expect(redactUrl('/x?resetToken=1&client_secret=2&page=3')).toBe(`/x?resetToken=${REDACTED}&client_secret=${REDACTED}&page=3`);
  });

  it('yol içindeki kart/paylaşım token’larını ve hash’i gizler', () => {
    expect(redactUrl('https://app.qratex.com/c/SECRET123?x=1#access_token=zzz')).toBe('https://app.qratex.com/c/[token]?x=1');
    expect(redactUrl('/experience/abc')).toBe('/experience/[token]');
    expect(redactUrl('https://u:p@app.qratex.com/a')).toBe('https://app.qratex.com/a');
    expect(redactUrl('')).toBe('');
  });

  it('oturum kaydı yasak yollar', () => {
    expect(isReplayAllowedPath('/auth/login')).toBe(false);
    expect(isReplayAllowedPath('/auth')).toBe(false);
    expect(isReplayAllowedPath('/admin-gate')).toBe(false);
    expect(isReplayAllowedPath('/c/abc')).toBe(false);
    expect(isReplayAllowedPath('/customer')).toBe(true);
    expect(isReplayAllowedPath('/customer/wallet')).toBe(true);
    expect(isReplayAllowedPath('/campaigns')).toBe(true);
    expect(isReplayAllowedPath(null)).toBe(false);
  });

  it('PostHog before_send olayını kopyalayarak ayıklar', () => {
    const ev = {
      event: '$pageview',
      properties: {
        $current_url: 'https://app.qratex.com/auth/magic?token=abc',
        $referrer: 'https://mail.google.com/?code=1',
        resetToken: 'zzz',
        plain: 'kalsın',
      },
    };
    const out = redactAnalyticsEvent(ev);
    expect(out?.properties?.$current_url).toBe(`https://app.qratex.com/auth/magic?token=${REDACTED}`);
    expect(out?.properties?.$referrer).toBe(`https://mail.google.com/?code=${REDACTED}`);
    expect(out?.properties?.resetToken).toBe(REDACTED);
    expect(out?.properties?.plain).toBe('kalsın');
    expect(ev.properties.$current_url).toContain('abc'); // girdi değişmez
    expect(redactAnalyticsEvent(null)).toBeNull();
  });
});

describe('istemci deposu', () => {
  type Jar = Map<string, string>;
  let jar: Jar;
  let storage: Map<string, string>;

  beforeEach(() => {
    jest.resetModules();
    jar = new Map();
    storage = new Map();
    const win = new EventTarget() as EventTarget & Record<string, unknown>;
    win.localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    };
    const g = globalThis as unknown as Record<string, unknown>;
    g.window = win;
    g.location = { protocol: 'https:' };
    g.BroadcastChannel = undefined;
    g.document = {
      get cookie() {
        return Array.from(jar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      },
      set cookie(value: string) {
        const [pair, ...attrs] = value.split(';').map((p) => p.trim());
        const idx = (pair ?? '').indexOf('=');
        const name = (pair ?? '').slice(0, idx);
        const val = (pair ?? '').slice(idx + 1);
        if (attrs.some((a) => a.toLowerCase() === 'max-age=0')) jar.delete(name);
        else jar.set(name, val);
      },
    };
  });

  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.window;
    delete g.document;
    delete g.location;
    delete g.BroadcastChannel;
  });

  it('yazar, yayar, okur; eski PWA olayını da yayar', async () => {
    const client = await import('@/lib/consent/client');
    const changes: number[] = [];
    let legacyFired = 0;
    (globalThis as unknown as { window: EventTarget }).window.addEventListener(client.LEGACY_CONSENT_COMPLETE_EVENT, () => {
      legacyFired += 1;
    });
    const unsub = client.subscribeConsent(() => changes.push(1));
    expect(client.getConsentSnapshot().decided).toBe(false);

    storage.set('pwa-install-dismissed', '1');
    client.writeConsent(createConsent({ analytics: true }));
    expect(jar.get(CONSENT_COOKIE)).toMatch(/^\d+\.a1\.r0\.m0\.\d+\.b$/);
    expect(changes).toHaveLength(1);
    expect(legacyFired).toBe(1);
    expect(storage.has('pwa-install-dismissed')).toBe(false);
    const snap = client.getConsentSnapshot();
    expect(snap.decided).toBe(true);
    expect(snap.categories.analytics).toBe(true);
    // Aynı çerezde referans kararlı (useSyncExternalStore için şart)
    expect(client.getConsentSnapshot()).toBe(snap);

    client.clearConsent();
    expect(jar.has(CONSENT_COOKIE)).toBe(false);
    expect(client.getConsentSnapshot().decided).toBe(false);
    unsub();
  });

  it('eski localStorage reddini çereze taşır', async () => {
    storage.set(LEGACY_CONSENT_STORAGE_KEY, JSON.stringify({ accepted: true, optionalRejected: true, date: new Date().toISOString() }));
    const client = await import('@/lib/consent/client');
    const snap = client.getConsentSnapshot();
    expect(snap.decided).toBe(true);
    expect(snap.categories.analytics).toBe(false);
    expect(jar.get(CONSENT_COOKIE)).toMatch(/\.l$/);
  });

  it('tercih merkezi olayı', async () => {
    const client = await import('@/lib/consent/client');
    const opened = jest.fn();
    (globalThis as unknown as { window: EventTarget }).window.addEventListener(client.CONSENT_OPEN_EVENT, opened);
    client.openConsentPreferences();
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
