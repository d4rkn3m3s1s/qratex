/**
 * P0-39 / P0-25: Boş Site URL kaydedilince kök layout `new URL('')` ile TypeError
 * fırlatıp admin dahil bütün siteyi çökertiyordu.
 * Senaryo: admin "Site URL" alanını temizleyip kaydeder → DB'de `siteUrl: ''` →
 * `generateMetadata` → `new URL(seo.canonicalBase || seo.siteUrl)` → çökme.
 */
import {
  isHttpUrl,
  normalizeHttpUrl,
  normalizeOgImageUrl,
  resolveSeoBaseUrl,
  safeMetadataBase,
  validateSeoGlobalUrls,
} from '@/lib/seo-url';

const ENV = 'https://qratex.com';

describe('seo-url', () => {
  it('eski hata yeniden üretilir: new URL("") fırlatır', () => {
    expect(() => new URL('')).toThrow();
  });

  it('boş/bozuk siteUrl ile metadata tabanı ASLA fırlatmaz', () => {
    for (const siteUrl of ['', '   ', 'qratex.com', 'javascript:alert(1)', 'ftp://x.com', null, undefined, 42]) {
      expect(() => safeMetadataBase({ siteUrl, canonicalBase: '' }, ENV)).not.toThrow();
      expect(resolveSeoBaseUrl({ siteUrl, canonicalBase: '' }, ENV)).toBe(ENV);
    }
  });

  it('öncelik: geçerli canonicalBase → geçerli siteUrl → ortam varsayılanı', () => {
    expect(resolveSeoBaseUrl({ canonicalBase: 'https://cdn.qratex.com/', siteUrl: 'https://a.com' }, ENV)).toBe(
      'https://cdn.qratex.com'
    );
    expect(resolveSeoBaseUrl({ canonicalBase: 'bozuk', siteUrl: 'https://a.com/' }, ENV)).toBe('https://a.com');
    expect(resolveSeoBaseUrl(null, ENV)).toBe(ENV);
    expect(resolveSeoBaseUrl({}, '')).toBe('http://localhost:3000');
  });

  it('isHttpUrl yalnız http(s) mutlak adresleri kabul eder', () => {
    expect(isHttpUrl('https://qratex.com')).toBe(true);
    expect(isHttpUrl('http://localhost:3000')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl('/relative')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });

  it('normalizeHttpUrl: DB’de kalmış bozuk değer varsayılana döner', () => {
    expect(normalizeHttpUrl('', ENV)).toBe(ENV);
    expect(normalizeHttpUrl('https://x.com///', ENV)).toBe('https://x.com');
    expect(normalizeHttpUrl('bozuk')).toBe('');
  });

  it('normalizeOgImageUrl: mutlak ya da kök-göreli; tehlikeli şemalar reddedilir', () => {
    expect(normalizeOgImageUrl('https://x.com/og.png', 'F')).toBe('https://x.com/og.png');
    expect(normalizeOgImageUrl('/logo/og.png', 'F')).toBe('/logo/og.png');
    expect(normalizeOgImageUrl('//evil.com/x.png', 'F')).toBe('F');
    expect(normalizeOgImageUrl('javascript:alert(1)', 'F')).toBe('F');
    expect(normalizeOgImageUrl(undefined, 'F')).toBe('F');
  });

  describe('validateSeoGlobalUrls (admin PUT / rollback)', () => {
    it('boş Site URL reddedilir', () => {
      expect(validateSeoGlobalUrls({ siteUrl: '' })).toMatch(/Site URL zorunludur/);
      expect(validateSeoGlobalUrls({ siteUrl: '   ' })).toMatch(/Site URL zorunludur/);
    });
    it('javascript: şemalı Site URL reddedilir (eski `new URL` kontrolü geçiriyordu)', () => {
      expect(() => new URL('javascript:alert(1)')).not.toThrow();
      expect(validateSeoGlobalUrls({ siteUrl: 'javascript:alert(1)' })).toMatch(/Site URL/);
    });
    it('geçerli ayar kabul edilir; canonical boş olabilir', () => {
      expect(validateSeoGlobalUrls({ siteUrl: 'https://qratex.com', canonicalBase: '', ogImageUrl: '/og.png' })).toBeNull();
    });
    it('bozuk canonical ve OG reddedilir', () => {
      expect(validateSeoGlobalUrls({ siteUrl: 'https://q.com', canonicalBase: 'q.com' })).toMatch(/Canonical/);
      expect(validateSeoGlobalUrls({ siteUrl: 'https://q.com', ogImageUrl: 'javascript:x' })).toMatch(/OG/);
    });
  });
});
