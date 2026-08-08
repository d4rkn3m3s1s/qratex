/**
 * ADMIN GİZLİ KAPI ("gate") — admin paneline ek bir eğlenceli/güvenlik katmanı.
 * ADMIN rolü YETMEZ; kullanıcı ayrıca yalnızca kurucuların bildiği havalı bir soruya
 * (cevabı TEK RAKAM) doğru yanıt vermelidir. Doğru cevap → HMAC imzalı cookie set edilir,
 * oturum boyunca tekrar sorulmaz. Böylece rolü kazara/kötü niyetle ADMIN yapılan bir stajyer
 * bile gizli rakamı bilmeden panele giremez.
 *
 * Soru + cevap Settings tablosunda (admin panelinden değiştirilebilir). Cevap İSTEMCİYE
 * ASLA gönderilmez — yalnız sunucuda doğrulanır. Cookie HMAC ile imzalı (client sahteleyemez).
 */
import crypto from 'crypto';

export const ADMIN_GATE_SETTING_KEY = 'admin_gate';
export const ADMIN_GATE_SETTING_CATEGORY = 'security';
export const ADMIN_GATE_COOKIE = 'admin_gate';

/** Varsayılan soru/cevap (admin değiştirene kadar). Havalı, cevabı tek rakam. */
export const DEFAULT_ADMIN_GATE = {
  question: 'Evrende bize göre kaç boyut gizlidir?',
  answer: '7',
};

export interface AdminGateConfig {
  question: string;
  answer: string; // tek rakam (0-9) — sunucuda tutulur, istemciye gitmez
}

/** DB'den gelen ham JSON'ı güvenli config'e çevirir (bozuksa varsayılana düşer). */
export function normalizeAdminGate(value: unknown): AdminGateConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_ADMIN_GATE };
  const raw = value as Record<string, unknown>;
  const question = typeof raw.question === 'string' && raw.question.trim() ? raw.question.trim().slice(0, 200) : DEFAULT_ADMIN_GATE.question;
  // Cevap yalnız TEK RAKAM (0-9). Geçersizse varsayılan.
  const ans = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  const answer = /^[0-9]$/.test(ans) ? ans : DEFAULT_ADMIN_GATE.answer;
  return { question, answer };
}

// ── HMAC cookie ── (NEXTAUTH_SECRET ile imzalı; client değeri sahteleyemez)
function secret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-admin-gate-fallback-secret';
}

/**
 * Cookie değeri: "<userId>.<hmac>". hmac = HMAC-SHA256(userId + ":" + answer, secret).
 * answer'ı bağlamak, admin cevabı değiştirdiğinde ESKİ cookie'lerin geçersiz olmasını sağlar
 * (herkes yeniden doğrular). userId'yi bağlamak, cookie'nin başka kullanıcıya taşınmasını engeller.
 */
export function makeGateCookieValue(userId: string, answer: string): string {
  const h = crypto.createHmac('sha256', secret()).update(`${userId}:${answer}`).digest('hex');
  return `${userId}.${h}`;
}

/** Cookie geçerli mi (bu kullanıcı + güncel cevap için imza tutuyor mu). Node ortamı (API). */
export function verifyGateCookie(cookieValue: string | undefined, userId: string, answer: string): boolean {
  if (!cookieValue || !userId) return false;
  const expected = makeGateCookieValue(userId, answer);
  // Sabit-zaman karşılaştırma (timing attack önlemi).
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

