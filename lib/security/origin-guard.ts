/**
 * CSRF — durum değiştiren API isteklerinde KÖKEN denetimi (guvenlik-admin-api B5).
 *
 * Eskiden tek savunma oturum çerezinin `SameSite=Lax` olmasıydı. `Lax` AYNI SİTE'den gelen
 * isteklere çerezi gönderir: kullanıcı içeriği barındıran bir alt alan adı (ör. R2 eki
 * `cdn.<site>`), `sandbox`'lı bir iframe (`Origin: null`) ya da ileride eklenecek herhangi bir
 * alt alan adı, yöneticinin çereziyle `/api/admin/*` uçlarına POST atabilirdi.
 *
 * Kural (yalnız POST/PUT/PATCH/DELETE; GET/HEAD/OPTIONS serbest):
 *  - `Origin` varsa: isteğin kendi kökeni, uygulamanın yapılandırılmış adresleri
 *    (NEXTAUTH_URL / NEXT_PUBLIC_APP_URL) ya da açık CORS izin listesi olmalı. `null` → red.
 *  - `Origin` yoksa `Sec-Fetch-Site`: `same-origin`/`none` → izin; `same-site`/`cross-site` → red.
 *  - İkisi de yoksa → izin: tarayıcı değil (sunucudan sunucuya istek; çerezle yetki almaz,
 *    Bearer/imza ile doğrulanır). Modern tarayıcılar POST'ta her zaman `Origin` gönderir.
 *  - Makineden makineye uçlar (cron, iç işler, Inngest, webhook, partner API) muaf: çerezle
 *    değil sır/imza ile doğrulanırlar.
 *
 * Edge uyumlu (Node modülü yok); `proxy.ts` her `/api/*` isteğinde çağırır.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Çerezle değil sır/imza ile doğrulanan uçlar. */
export const ORIGIN_CHECK_EXEMPT_PREFIXES: ReadonlyArray<string> = [
  '/api/cron/',
  '/api/internal/',
  '/api/inngest',
  '/api/webhooks/',
  '/api/partner/',
  // Tarayıcının kendiliğinden gönderdiği CSP ihlal raporu (çerezsiz, kökeni güvenilmez; uç
  // yalnız sayaç/günlük yazar, hiçbir yetki kullanmaz).
  '/api/security/csp-report',
];

export type OriginDecision =
  | { ok: true }
  | { ok: false; reason: 'null_origin' | 'foreign_origin' | 'cross_site_fetch' };

export interface OriginRequestLike {
  method: string;
  pathname: string;
  /** İsteğin kendi kökeni (ör. `https://qratex.com`). */
  selfOrigin: string;
  headers: { get(name: string): string | null };
}

function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Uygulamanın kendine ait saydığı kökenler (istek kökeni + yapılandırılmış adresler + CORS listesi). */
export function trustedOrigins(selfOrigin: string, extra: ReadonlyArray<string> = []): Set<string> {
  const out = new Set<string>();
  const add = (v: string | undefined | null) => {
    const o = originOf(v);
    if (o) out.add(o);
  };
  add(selfOrigin);
  add(process.env.NEXTAUTH_URL);
  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  for (const e of extra) add(e);
  return out;
}

export function isOriginCheckExempt(pathname: string): boolean {
  return ORIGIN_CHECK_EXEMPT_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));
}

/** Saf karar fonksiyonu (test edilebilir). */
export function checkRequestOrigin(req: OriginRequestLike, extraAllowed: ReadonlyArray<string> = []): OriginDecision {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return { ok: true };
  if (isOriginCheckExempt(req.pathname)) return { ok: true };

  const origin = req.headers.get('origin');
  if (origin !== null) {
    const trimmed = origin.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null') return { ok: false, reason: 'null_origin' };
    const normalized = originOf(trimmed);
    if (normalized && trustedOrigins(req.selfOrigin, extraAllowed).has(normalized)) return { ok: true };
    return { ok: false, reason: 'foreign_origin' };
  }

  const site = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (site === 'same-site' || site === 'cross-site') return { ok: false, reason: 'cross_site_fetch' };
  return { ok: true };
}
