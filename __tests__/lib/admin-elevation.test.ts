/**
 * P0-01 — Admin kapı çerezi (izomorfik Web Crypto). Saldırı senaryoları:
 *  - Denetim raporundaki yeniden üretim: `document.cookie = 'admin_gate=' + id + '.' + 'a'.repeat(64)`
 *    → eski proxy biçime bakıp geçiriyordu. Artık REDDEDİLMELİ.
 *  - Aynı biçimde (g2) rastgele imzalı çerez, alanı değiştirilmiş çerez, başka kullanıcı / başka
 *    oturum / süresi dolmuş / eski sürüm (cevap değişti, "tümünü sonlandır") çerezleri reddedilir.
 */
import { webcrypto } from 'crypto';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}

process.env.NEXTAUTH_SECRET = 'test-secret-elevation';

import {
  ELEVATION_TTL_SECONDS,
  parseElevation,
  sessionTagFor,
  signElevation,
  verifyElevation,
} from '@/lib/admin-elevation';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

describe('admin kapı çerezi — imza ve doğrulama', () => {
  it('geçerli çerez: doğru kullanıcı + oturum + sürüm → ok', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 3, jti: 'jti-a', nowMs: NOW });
    const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 3, nowMs: NOW + 1000 });
    expect(r.ok).toBe(true);
  });

  it('SALDIRI: denetimdeki eski biçim sahte çerez (<id>.<64 hex>) reddedilir', async () => {
    const forged = `admin1.${'a'.repeat(64)}`;
    const r = await verifyElevation(forged, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'malformed' });
  });

  it('SALDIRI: yeni biçimde ama sırsız üretilmiş imza reddedilir', async () => {
    const tag = await sessionTagFor('jti-a');
    const exp = Math.floor(NOW / 1000) + 3600;
    const forged = `g2.admin1.0.${exp}.${tag}.${'A'.repeat(43)}`;
    const r = await verifyElevation(forged, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('SALDIRI: geçerli çerezin süresi/sürümü elle uzatılırsa imza bozulur', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 1, jti: 'jti-a', nowMs: NOW });
    const parts = c.split('.');
    parts[2] = '2'; // cfgVer'i güncel sürüme "yükselt"
    const r = await verifyElevation(parts.join('.'), { userId: 'admin1', jti: 'jti-a', cfgVer: 2, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('başka kullanıcının geçerli çerezi reddedilir', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', nowMs: NOW });
    const r = await verifyElevation(c, { userId: 'admin2', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'wrong_user' });
  });

  it('başka oturumda (farklı jti) kullanılan çerez reddedilir — çıkış/giriş kapıyı yeniden sorar', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', nowMs: NOW });
    const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-b', cfgVer: 0, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'wrong_session' });
  });

  it('süresi dolan çerez reddedilir (12 saat)', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', nowMs: NOW });
    const later = NOW + (ELEVATION_TTL_SECONDS + 1) * 1000;
    const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: later });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('aşırı ileri tarihli exp ile imzalanmış çerez kabul edilmez', async () => {
    const exp = Math.floor(NOW / 1000) + ELEVATION_TTL_SECONDS * 10;
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', exp, nowMs: NOW });
    const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('cevap değişince / "tümünü sonlandır" sonrası (cfgVer arttı) eski çerez reddedilir', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 4, jti: 'jti-a', nowMs: NOW });
    const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 5, nowMs: NOW });
    expect(r).toEqual({ ok: false, reason: 'stale_config' });
  });

  it('cfgVer bilinmiyorsa (proxy, Redis yok) sürüm kontrolü atlanır ama imza yine zorunlu', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 4, jti: 'jti-a', nowMs: NOW });
    expect((await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', nowMs: NOW })).ok).toBe(true);
    expect((await verifyElevation(c.slice(0, -2) + 'xx', { userId: 'admin1', jti: 'jti-a', nowMs: NOW })).ok).toBe(false);
  });

  it('farklı sırla imzalanmış çerez reddedilir (sır döndürme)', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', nowMs: NOW });
    process.env.NEXTAUTH_SECRET = 'rotated-secret';
    try {
      const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
      expect(r).toEqual({ ok: false, reason: 'bad_signature' });
    } finally {
      process.env.NEXTAUTH_SECRET = 'test-secret-elevation';
    }
  });

  it('üretimde sır yoksa kapı KAPALI (fail-closed)', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'jti-a', nowMs: NOW });
    const env = process.env as Record<string, string | undefined>;
    const saved = { s: env.NEXTAUTH_SECRET, n: env.NODE_ENV };
    delete env.NEXTAUTH_SECRET;
    env.NODE_ENV = 'production';
    try {
      const r = await verifyElevation(c, { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW });
      expect(r).toEqual({ ok: false, reason: 'no_secret' });
      await expect(signElevation({ userId: 'admin1', cfgVer: 0 })).rejects.toThrow();
    } finally {
      env.NEXTAUTH_SECRET = saved.s;
      env.NODE_ENV = saved.n;
    }
  });

  it('boş / bozuk girdiler istisna fırlatmadan reddedilir', async () => {
    const exp = { userId: 'admin1', jti: 'jti-a', cfgVer: 0, nowMs: NOW };
    expect(await verifyElevation(undefined, exp)).toEqual({ ok: false, reason: 'missing' });
    expect(await verifyElevation('', exp)).toEqual({ ok: false, reason: 'missing' });
    expect((await verifyElevation('g2.a.b.c.d.e', exp)).ok).toBe(false);
    expect((await verifyElevation('x'.repeat(2000), exp)).ok).toBe(false);
    expect(parseElevation('g2.admin1.0.1.tag.' + '!'.repeat(43))).toBeNull();
  });

  it('çerez değeri cevabı ya da jti\'yi açık metin içermez', async () => {
    const c = await signElevation({ userId: 'admin1', cfgVer: 0, jti: 'super-secret-jti', nowMs: NOW });
    expect(c).not.toContain('super-secret-jti');
    expect(c.startsWith('g2.admin1.0.')).toBe(true);
  });
});
