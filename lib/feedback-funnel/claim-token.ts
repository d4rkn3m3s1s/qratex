/**
 * Oturumsuz geri bildirimi sonradan hesaba bağlama belirteci (rapor Bulgu 7).
 *
 * Şema değişikliği olmadan: HMAC imzalı, 24 saat geçerli, geri bildirim kimliğine ve
 * gönderim anındaki "detaylı yorum" kararına bağlı belirteç. Tek seferlik garanti
 * belirteçte DEĞİL veritabanındadır:
 *   - `feedback.updateMany({ where: { id, userId: null } })` → yalnız bir hesap bağlar,
 *   - kredi `mintPoints` ile `feedback:<id>` defter anahtarıyla (PointsLedger @unique).
 * Belirteç yalnız gönderen cihazda (localStorage) tutulur.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_VERSION = 'fc1';
export const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface ClaimClaims {
  /** Feedback id */
  f: string;
  /** Gönderimde kullanıcının KENDİ metni detaylı eşiği geçti mi (sunucu kararı). */
  d: boolean;
  /** Son geçerlilik (ms epoch) */
  e: number;
}

function secret(): string {
  const s = process.env.FEEDBACK_CLAIM_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    // Fail-closed: imzasız belirteç üretilmez/doğrulanmaz.
    throw new Error('FEEDBACK_CLAIM_SECRET / NEXTAUTH_SECRET yapılandırılmamış.');
  }
  return s;
}

function mac(body: string): string {
  return createHmac('sha256', secret()).update(`${TOKEN_VERSION}.${body}`).digest('base64url');
}

export function signClaimToken(feedbackId: string, detailed: boolean, now: number = Date.now()): { token: string; expiresAt: Date } {
  const claims: ClaimClaims = { f: feedbackId, d: detailed, e: now + CLAIM_TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${TOKEN_VERSION}.${body}.${mac(body)}`, expiresAt: new Date(claims.e) };
}

export type ClaimVerifyResult = { ok: true; claims: ClaimClaims } | { ok: false; reason: 'invalid' | 'expired' };

export function verifyClaimToken(token: unknown, now: number = Date.now()): ClaimVerifyResult {
  if (typeof token !== 'string' || token.length > 1024) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, reason: 'invalid' };
  const [, body, got] = parts;
  let want: string;
  try {
    want = mac(body);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  let claims: ClaimClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ClaimClaims;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof claims?.f !== 'string' || !claims.f || typeof claims.e !== 'number' || typeof claims.d !== 'boolean') {
    return { ok: false, reason: 'invalid' };
  }
  if (claims.e < now) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
