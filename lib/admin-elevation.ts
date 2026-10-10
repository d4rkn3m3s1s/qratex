/**
 * ADMIN KAPI YÜKSELTMESİ (elevation) — İZOMORFİK (proxy + API aynı fonksiyon), P0-01.
 *
 * Yalnız Web Crypto (`globalThis.crypto.subtle`) kullanır; Node `crypto` modülünü
 * İÇE AKTARMAZ. Böylece proxy (edge ya da Node çalışma zamanı) ile API route'ları
 * kapı çerezini BİREBİR aynı kuralla doğrular.
 *
 * Eski sorun: proxy çerezi yalnız `<userId>.<64 hex>` BİÇİMİNE bakıyordu; DevTools'ta
 * `admin_gate=<id>.aaaa…` yazan her ADMIN kapıyı atlıyordu ve API'de hiç kapı yoktu.
 *
 * Çerez biçimi (sürüm `g2`):
 *
 *   g2.<userId>.<cfgVer>.<exp>.<sessionTag>.<sig>
 *
 *   userId     → çerez başka hesaba taşınamaz.
 *   cfgVer     → kapı yapılandırma sürümü. Cevap değişince ya da "tüm kapı oturumlarını
 *                sonlandır" basılınca artar → eski bütün çerezler anında geçersiz.
 *   exp        → saniye cinsinden mutlak bitiş (en fazla ELEVATION_TTL_SECONDS).
 *   sessionTag → giriş oturumunun (JWT `jti`) SHA-256 özetinin ilk 16 karakteri.
 *                Çıkış yapıp yeniden giren, kapıyı yeniden geçer; çalınan çerez başka
 *                oturumda işe yaramaz.
 *   sig        → HMAC-SHA256(NEXTAUTH_SECRET, "qratex-admin-gate|g2|…") base64url.
 *                Doğrulama `crypto.subtle.verify` ile (sabit zamanlı).
 */

export const ADMIN_GATE_COOKIE = 'admin_gate';
export const ELEVATION_VERSION = 'g2';
/** Kapı oturumunun en uzun ömrü: 12 saat. Çerez `maxAge` değeri de budur. */
export const ELEVATION_TTL_SECONDS = 12 * 60 * 60;
/** Redis'te yayınlanan güncel kapı yapılandırma sürümü (proxy hızlı kontrolü için). */
export const ADMIN_GATE_CFGVER_REDIS_KEY = 'admin-gate:cfgver';

const SIGN_DOMAIN = 'qratex-admin-gate';
const NO_SESSION_TAG = 'nosession';
const USER_ID_RE = /^[A-Za-z0-9_-]{1,191}$/;
const INT_RE = /^(0|[1-9][0-9]{0,15})$/;
const TAG_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SIG_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bayt → base64url (dolgusuz) 43 karakter

export interface ElevationClaims {
  userId: string;
  cfgVer: number;
  /** Unix saniye. */
  exp: number;
  sessionTag: string;
}

export type ElevationFailure =
  | 'missing'
  | 'malformed'
  | 'no_secret'
  | 'bad_signature'
  | 'expired'
  | 'wrong_user'
  | 'wrong_session'
  | 'stale_config';

export type ElevationCheck =
  | { ok: true; claims: ElevationClaims }
  | { ok: false; reason: ElevationFailure };

export interface ElevationExpectation {
  userId: string;
  /** Oturumun JWT `jti` değeri (yoksa `nosession` etiketi beklenir). */
  jti?: string | null;
  /**
   * Güncel kapı yapılandırma sürümü. Verilirse eşleşmeyen çerez reddedilir.
   * `undefined` → sürüm kontrolü atlanır (proxy'de Redis'e ulaşılamadığında; API her zaman verir).
   */
  cfgVer?: number | null;
  /** Test için: şimdiki zaman (ms). */
  nowMs?: number;
}

// ───────────────────────────── Yardımcılar ─────────────────────────────

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Web Crypto (crypto.subtle) bu çalışma zamanında yok');
  return c.subtle;
}

/**
 * İmza anahtarı. Üretimde NEXTAUTH_SECRET / AUTH_SECRET YOKSA null → kapı kapalı kalır
 * (fail-closed). Geliştirme/testte sabit bir yedek kullanılır.
 */
export function getElevationSecret(): string | null {
  const s = (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').trim();
  if (s) return s;
  if (process.env.NODE_ENV === 'production') return null;
  return 'qratex-admin-gate-dev-only-secret';
}

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = getSubtle().importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keyCache.set(secret, k);
  }
  return k;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function signingInput(c: ElevationClaims): string {
  return `${SIGN_DOMAIN}|${ELEVATION_VERSION}|${c.userId}|${c.cfgVer}|${c.exp}|${c.sessionTag}`;
}

/** Oturum etiketi: SHA-256(jti) base64url ilk 16 karakter. jti yoksa sabit etiket. */
export async function sessionTagFor(jti: string | null | undefined): Promise<string> {
  if (!jti) return NO_SESSION_TAG;
  const digest = await getSubtle().digest('SHA-256', encoder.encode(`${SIGN_DOMAIN}|jti|${jti}`));
  return toBase64Url(digest).slice(0, 16);
}

// ───────────────────────────── API ─────────────────────────────

/** Çerez değerini ayrıştırır (imza DOĞRULAMAZ). Bozuksa null. */
export function parseElevation(value: string | null | undefined): (ElevationClaims & { sig: string }) | null {
  if (!value || typeof value !== 'string' || value.length > 512) return null;
  const parts = value.split('.');
  if (parts.length !== 6) return null;
  const [ver, userId, cfgVerRaw, expRaw, sessionTag, sig] = parts;
  if (ver !== ELEVATION_VERSION) return null;
  if (!USER_ID_RE.test(userId) || !INT_RE.test(cfgVerRaw) || !INT_RE.test(expRaw)) return null;
  if (!TAG_RE.test(sessionTag) || !SIG_RE.test(sig)) return null;
  return { userId, cfgVer: Number(cfgVerRaw), exp: Number(expRaw), sessionTag, sig };
}

/**
 * İmzalı kapı çerezi üretir. `exp` verilmezse şimdi + ELEVATION_TTL_SECONDS.
 * Gizli anahtar yoksa (üretimde NEXTAUTH_SECRET eksik) hata fırlatır.
 */
export async function signElevation(input: {
  userId: string;
  cfgVer: number;
  jti?: string | null;
  exp?: number;
  nowMs?: number;
}): Promise<string> {
  const secret = getElevationSecret();
  if (!secret) throw new Error('Admin kapısı imza anahtarı (NEXTAUTH_SECRET) tanımlı değil');
  if (!USER_ID_RE.test(input.userId)) throw new Error('Geçersiz kullanıcı kimliği');
  if (!Number.isSafeInteger(input.cfgVer) || input.cfgVer < 0) throw new Error('Geçersiz kapı sürümü');
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const claims: ElevationClaims = {
    userId: input.userId,
    cfgVer: input.cfgVer,
    exp: input.exp ?? now + ELEVATION_TTL_SECONDS,
    sessionTag: await sessionTagFor(input.jti),
  };
  const key = await hmacKey(secret);
  const sig = await getSubtle().sign('HMAC', key, encoder.encode(signingInput(claims)));
  return [ELEVATION_VERSION, claims.userId, claims.cfgVer, claims.exp, claims.sessionTag, toBase64Url(sig)].join('.');
}

/**
 * Çerezi TAM doğrular: biçim → imza (sabit zamanlı) → kullanıcı → süre → oturum → sürüm.
 * Herhangi bir adım tutmazsa `{ ok: false, reason }`. Hiçbir durumda istisna fırlatmaz.
 */
export async function verifyElevation(
  value: string | null | undefined,
  expect: ElevationExpectation
): Promise<ElevationCheck> {
  if (!value) return { ok: false, reason: 'missing' };
  const parsed = parseElevation(value);
  if (!parsed) return { ok: false, reason: 'malformed' };
  const secret = getElevationSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };

  const sigBytes = fromBase64Url(parsed.sig);
  if (!sigBytes || sigBytes.length !== 32) return { ok: false, reason: 'malformed' };
  const claims: ElevationClaims = {
    userId: parsed.userId,
    cfgVer: parsed.cfgVer,
    exp: parsed.exp,
    sessionTag: parsed.sessionTag,
  };
  let valid = false;
  try {
    const key = await hmacKey(secret);
    valid = await getSubtle().verify('HMAC', key, sigBytes, encoder.encode(signingInput(claims)));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };

  if (!expect.userId || claims.userId !== expect.userId) return { ok: false, reason: 'wrong_user' };
  const nowSec = Math.floor((expect.nowMs ?? Date.now()) / 1000);
  if (claims.exp <= nowSec) return { ok: false, reason: 'expired' };
  // Aşırı uzun ömürlü (gelecekte ileri tarihli) çerez kabul edilmez.
  if (claims.exp > nowSec + ELEVATION_TTL_SECONDS + 60) return { ok: false, reason: 'expired' };
  if (claims.sessionTag !== (await sessionTagFor(expect.jti))) return { ok: false, reason: 'wrong_session' };
  if (expect.cfgVer !== undefined && expect.cfgVer !== null && claims.cfgVer !== expect.cfgVer) {
    return { ok: false, reason: 'stale_config' };
  }
  return { ok: true, claims };
}

/** Kapı çerezinin ortak öznitelikleri (set ve silme için). */
export function elevationCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ELEVATION_TTL_SECONDS,
  };
}
