/**
 * SEO URL yardımcıları — saf (DB/Next bağımlılığı yok), test edilebilir.
 *
 * P0-39 / P0-25: Admin "Site URL" alanını boş kaydettiğinde `validateGlobalUrls`
 * boş değeri atlıyor, `loadSeoSettingsRow` `?? defaults.siteUrl` ile boş metni
 * koruyordu; kök layout `new URL('')` ile TypeError fırlatıp admin dahil bütün
 * siteyi (her sayfanın `generateMetadata`'sı) çökertiyordu. Üç katmanlı çözüm:
 *   1) Yazma: Site URL zorunlu + yalnız http(s) mutlak URL (`isHttpUrl`).
 *   2) Okuma: DB'de kalmış bozuk değer varsayılana normalize edilir (`normalizeHttpUrl`).
 *   3) Tüketim: layout/robots/sitemap tabanı `resolveSeoBaseUrl` ile ASLA fırlatmaz.
 */

/** Yalnız `http:`/`https:` şemalı, host'u olan mutlak URL'leri kabul eder. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Geçerli bir http(s) URL'si ise sondaki `/` atılmış hâlini, değilse `fallback`'i döner.
 * `fallback` de geçersizse boş metin döner (çağıran kendi varsayılanını uygular).
 */
export function normalizeHttpUrl(value: unknown, fallback = ''): string {
  if (isHttpUrl(value)) return value.trim().replace(/\/+$/, '');
  if (fallback && isHttpUrl(fallback)) return fallback.trim().replace(/\/+$/, '');
  return '';
}

/**
 * Metadata/robots/sitemap tabanı: `canonicalBase` (geçerliyse) → `siteUrl` (geçerliyse)
 * → ortam varsayılanı. Her zaman `new URL()` ile ayrıştırılabilir bir değer döner.
 */
export function resolveSeoBaseUrl(
  seo: { canonicalBase?: unknown; siteUrl?: unknown } | null | undefined,
  envFallback: string
): string {
  const candidates = [seo?.canonicalBase, seo?.siteUrl, envFallback];
  for (const c of candidates) {
    if (isHttpUrl(c)) return c.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

/** `resolveSeoBaseUrl` sonucunu `URL` olarak döner (metadataBase için); asla fırlatmaz. */
export function safeMetadataBase(
  seo: { canonicalBase?: unknown; siteUrl?: unknown } | null | undefined,
  envFallback: string
): URL {
  return new URL(resolveSeoBaseUrl(seo, envFallback));
}

/**
 * OG görseli: mutlak http(s) URL ya da kök-göreli yol (`/logo/og.png`, metadataBase ile
 * çözülür) kabul edilir; diğer her şey (`javascript:`, boş, bozuk) `fallback`'e düşer.
 */
export function normalizeOgImageUrl(value: unknown, fallback: string): string {
  if (isHttpUrl(value)) return value.trim();
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s;
  }
  return fallback;
}

/**
 * Admin SEO kaydı doğrulaması (PUT). Site URL zorunlu ve yalnız http(s) mutlak
 * adres; `javascript:`/`data:` gibi şemalar ve boş değer reddedilir. Hata yoksa `null`.
 */
export function validateSeoGlobalUrls(g: {
  siteUrl?: unknown;
  ogImageUrl?: unknown;
  canonicalBase?: unknown;
}): string | null {
  if (!isHttpUrl(g.siteUrl)) {
    return 'Site URL zorunludur ve https:// ile başlayan geçerli bir adres olmalıdır';
  }
  const og = typeof g.ogImageUrl === 'string' ? g.ogImageUrl.trim() : '';
  if (og && normalizeOgImageUrl(og, '') === '') {
    return 'Geçersiz OG görsel URL (https:// ile başlayan adres ya da / ile başlayan yol olmalı)';
  }
  const canonical = typeof g.canonicalBase === 'string' ? g.canonicalBase.trim() : '';
  if (canonical && !isHttpUrl(canonical)) return 'Geçersiz Canonical base URL (https:// ile başlamalı)';
  return null;
}
