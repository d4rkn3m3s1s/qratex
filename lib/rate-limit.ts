/**
 * Rate limiter — PAYLAŞILAN sayaç (Redis öncelikli, DB'ye düşer). Bellek içi katman kaldırıldı.
 *
 * Serverless (Vercel) ortamında her Lambda kendi belleğinde olduğu ve cold
 * start sayaçları sıfırladığı için in-memory Map TEK başına güvenilir değildir.
 * Güvenlik açısından kritik kontroller (login lockout, auth-email, register,
 * QR scan, public action) `RateLimitCounter` tablosuna dayanan async
 * fonksiyonları kullanır (aşağıda *Db varyantları).
 */
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-metadata';

// Giriş kilidi: 5 başarısız deneme = 15 dk blok (DB/Redis sayaçlı `*Db` varyantları).
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;


// ───────────────────────── DB-backed atomic limiter ─────────────────────────

export type RateLimitResult = { ok: boolean; remaining?: number; retryAfterMs?: number };

/**
 * Atomik fixed-window sayaç. `bucket` benzersiz anahtar; `max` pencere başına
 * izin; `windowMs` pencere süresi. Race-safe: süresi dolmuş pencereyi atomik
 * resetleyip artırır, dolu pencerede koşullu artışla limiti aşmayı engeller.
 */
export async function checkRateLimitDb(
  bucket: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  // REDIS-FIRST: yapılandırılmışsa in-memory sayaç (~1-5ms) — DB roundtrip yok. Redis yoksa/
  // hata verirse null döner ve aşağıdaki DB yoluna düşülür (fail-safe, davranış değişmez).
  {
    const { redisIncrWithTtl } = await import('@/lib/redis');
    const rl = await redisIncrWithTtl(`rl:${bucket}`, Math.ceil(windowMs / 1000));
    if (rl) {
      if (rl.count <= max) return { ok: true, remaining: Math.max(0, max - rl.count) };
      return { ok: false, remaining: 0, retryAfterMs: Math.max(0, rl.ttlMs) };
    }
  }

  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowMs);

  // TEK ATOMİK SQL (INSERT ... ON CONFLICT DO UPDATE): oluştur / süresi geçmişse resetle /
  // aktif pencerede artır — hepsi tek roundtrip. Frankfurt/serverless'te 4 seri roundtrip yerine 1.
  // count artık kaç isteğin YAPILDIĞI (bu istek dahil). Limit kontrolü uygulama tarafında.
  try {
    // NOT: updatedAt @updatedAt yalnız Prisma-seviyedir; raw SQL Prisma'yı bypass ettiği için
    // NOT NULL updatedAt'i MANUEL set etmeliyiz (yoksa 23502 not-null violation).
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitCounter" ("bucket", "count", "resetAt", "updatedAt")
      VALUES (${bucket}, 1, ${newResetAt}, ${now})
      ON CONFLICT ("bucket") DO UPDATE SET
        "count"     = CASE WHEN "RateLimitCounter"."resetAt" <= ${now} THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
        "resetAt"   = CASE WHEN "RateLimitCounter"."resetAt" <= ${now} THEN ${newResetAt} ELSE "RateLimitCounter"."resetAt" END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `;
    const row = rows[0];
    if (!row) return { ok: true, remaining: max - 1 };
    const count = Number(row.count);
    if (count <= max) {
      return { ok: true, remaining: Math.max(0, max - count) };
    }
    // Limit aşıldı — bu istek sayıldı ama izin verilmiyor.
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, new Date(row.resetAt).getTime() - now.getTime()) };
  } catch (err) {
    // $queryRaw beklenmedik hata → güvenli tarafta kal: eski çok-adımlı yola düş.
    console.error('[rate-limit] atomic SQL failed, falling back:', err instanceof Error ? err.message : err);
    return checkRateLimitDbFallback(bucket, max, windowMs);
  }
}

/** Eski çok-adımlı limiter — atomik SQL patlarsa güvenli yedek. */
async function checkRateLimitDbFallback(
  bucket: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowMs);
  try {
    await prisma.rateLimitCounter.create({ data: { bucket, count: 1, resetAt: newResetAt } });
    return { ok: true, remaining: max - 1 };
  } catch { /* var — devam */ }
  const reset = await prisma.rateLimitCounter.updateMany({ where: { bucket, resetAt: { lte: now } }, data: { count: 1, resetAt: newResetAt } });
  if (reset.count > 0) return { ok: true, remaining: max - 1 };
  const bumped = await prisma.rateLimitCounter.updateMany({ where: { bucket, count: { lt: max }, resetAt: { gt: now } }, data: { count: { increment: 1 } } });
  if (bumped.count > 0) {
    const row = await prisma.rateLimitCounter.findUnique({ where: { bucket }, select: { count: true } });
    return { ok: true, remaining: Math.max(0, max - (row?.count ?? max)) };
  }
  const row = await prisma.rateLimitCounter.findUnique({ where: { bucket }, select: { resetAt: true } });
  return { ok: false, remaining: 0, retryAfterMs: row ? Math.max(0, row.resetAt.getTime() - now.getTime()) : windowMs };
}

/** Genel amaçlı public action limiter (survey doldurma vb.) */
export function checkPublicActionRateLimit(
  bucket: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  return checkRateLimitDb(`public:${bucket}`, max, windowMs);
}

/** DB-backed login lockout: başarısız deneme kaydı + kilit kontrolü. */
export async function getLoginLockoutDb(identifier: string): Promise<{ locked: boolean; retryAfterMs?: number }> {
  const now = new Date();
  const row = await prisma.rateLimitCounter.findUnique({
    where: { bucket: `lockout:${identifier}` },
    select: { lockedUntil: true },
  });
  if (row?.lockedUntil && row.lockedUntil > now) {
    return { locked: true, retryAfterMs: row.lockedUntil.getTime() - now.getTime() };
  }
  return { locked: false };
}

/**
 * Giriş kilidi politikası. Varsayılan (`ip:e-posta` anahtarı): 15 dk'da 5 hata → 15 dk kilit.
 * HESAP BAZLI üst sınır (`acct:e-posta`, guvenlik-admin-api B7): IP değiştiren dağıtık saldırı
 * her IP'den 5 deneme yapabiliyordu; hesabın tüm IP'lerdeki toplam hatası da sınırlanır.
 */
export interface LoginLockoutPolicy {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}
export const DEFAULT_LOGIN_LOCKOUT: LoginLockoutPolicy = { maxFailures: MAX_FAILED_ATTEMPTS, windowMs: LOCKOUT_MS, lockMs: LOCKOUT_MS };
/** Hesap bazlı: 15 dk'da (tüm IP'lerden) 20 hata → hesabın şifreli girişi 15 dk kilit. */
export const ACCOUNT_LOGIN_LOCKOUT: LoginLockoutPolicy = { maxFailures: 20, windowMs: LOCKOUT_MS, lockMs: LOCKOUT_MS };

export async function recordFailedLoginAttemptDb(
  identifier: string,
  policy: LoginLockoutPolicy = DEFAULT_LOGIN_LOCKOUT
): Promise<void> {
  const LOCKOUT_MS = policy.lockMs;
  const MAX_FAILED_ATTEMPTS = policy.maxFailures;
  const now = new Date();
  const bucket = `lockout:${identifier}`;
  const windowResetAt = new Date(now.getTime() + policy.windowMs);

  const existing = await prisma.rateLimitCounter.findUnique({ where: { bucket } });
  if (!existing || existing.resetAt <= now) {
    await prisma.rateLimitCounter.upsert({
      where: { bucket },
      create: { bucket, count: 1, resetAt: windowResetAt },
      update: { count: 1, resetAt: windowResetAt, lockedUntil: null },
    });
    return;
  }

  const newCount = existing.count + 1;
  const justLocked = newCount >= MAX_FAILED_ATTEMPTS && !(existing.lockedUntil && existing.lockedUntil > now);
  await prisma.rateLimitCounter.update({
    where: { bucket },
    data: {
      count: newCount,
      lockedUntil: newCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : existing.lockedUntil,
    },
  });

  // Brute-force tespiti: hesap bu denemeyle ilk kez kilitlendiyse HIGH şiddetli
  // güvenlik uyarısı üret (admin trust-command'da görünür + admin bildirimi).
  // Ateşle-unut: login akışını bloklamaz, hatayı yutar.
  if (justLocked) {
    import('@/lib/security')
      .then(({ reportSuspiciousActivity }) =>
        reportSuspiciousActivity({
          type: 'BRUTE_FORCE',
          severity: 'HIGH',
          description: `Çok sayıda başarısız giriş denemesi sonrası hesap geçici olarak kilitlendi (${identifier}).`,
          metadata: { identifier, failedAttempts: newCount, lockoutMs: LOCKOUT_MS },
        })
      )
      .catch((err) => console.error('[BRUTE_FORCE_ALERT] üretilemedi:', err));
  }
}

export async function clearFailedLoginAttemptsDb(identifier: string): Promise<void> {
  await prisma.rateLimitCounter.deleteMany({ where: { bucket: `lockout:${identifier}` } });
}

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_FEEDBACK_PER_QR_PER_WINDOW = 5;
const MAX_SCAN_PER_IP_PER_MINUTE = 60; // QR scan abuse protection

/**
 * Oran sınırı kimliği (IP). Tek kaynak `getClientIp` (mimari-api B15): denetim kaydındaki IP ile
 * oran sınırı kovası aynı istek için aynı değeri alır (eskiden başlık sırası farklıydı).
 */
export function getClientIdentifier(request: Request): string {
  return getClientIp(request) || 'unknown';
}

// NOT (mimari-api B7): Bellek içi `checkRateLimit` / `getLoginLockout` / `recordFailedLoginAttempt` /
// `clearFailedLoginAttempts` KALDIRILDI — serverless'te her Lambda kendi Map'ini saydığı için limit
// N-kat gevşiyordu. Giriş kilidi `*Db` varyantlarında; route limitleri `defineRoute({ rateLimit })`.

// --- Per-QR feedback throttle (abuse protection) — DB-backed ---
export function checkFeedbackPerQrRateLimit(
  qrCodeId: string,
  ip: string
): Promise<RateLimitResult> {
  return checkRateLimitDb(`feedback_qr:${qrCodeId}:${ip}`, MAX_FEEDBACK_PER_QR_PER_WINDOW, WINDOW_MS);
}

// --- QR scan throttle (abuse protection) — DB-backed (serverless güvenilir) ---
export function checkScanRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimitDb(`scan:${ip}`, MAX_SCAN_PER_IP_PER_MINUTE, WINDOW_MS);
}

const MAX_ADMIN_MUTATION_PER_MINUTE = 50;

/**
 * Admin mutasyon uçları (ayar toplu yazım, geri bildirim sil/geri al, kullanıcı toplu işlem,
 * otomasyon): dakikada en fazla 50 istek (identifier = userId). Eskiden bellek içi Map'ti
 * (serverless'te Lambda başına ayrı sayıyordu); artık PAYLAŞILAN sayaç — çağıran `await` etmeli.
 */
export function checkAdminRateLimit(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitDb(`admin_mutation:${identifier}`, MAX_ADMIN_MUTATION_PER_MINUTE, WINDOW_MS);
}

// --- QRA floating chat (/api/chat): müşteri sıkı, bayi/admin gevşek, anon IP parmak izi ---
const QRA_CHAT_WINDOW_MS = 60 * 1000;
export const MAX_QRA_CHAT_PER_MINUTE = {
  admin: 120,
  dealer_staff: 80,
  customer: 12,
  anonymous: 8,
} as const;

export type QraChatTier = keyof typeof MAX_QRA_CHAT_PER_MINUTE;

/**
 * QRA chat limiter — DB-backed (atomik). LLM her istek = gerçek para; serverless'te her Lambda
 * kendi belleğinde sayınca limit N-kat gevşer ve maliyet patlar. Bu yüzden PAYLAŞILAN DB sayacı
 * (checkRateLimitDb) kullanılır. Async'e çevrildi — çağıran await etmeli.
 */
export function checkQraChatRateLimit(
  identifier: string,
  tier: QraChatTier
): Promise<RateLimitResult> {
  const max = MAX_QRA_CHAT_PER_MINUTE[tier];
  return checkRateLimitDb(`qra_chat:${tier}:${identifier}`, max, QRA_CHAT_WINDOW_MS);
}

const AUTH_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FORGOT_PASSWORD_PER_IP = 8;
const MAX_MAGIC_LINK_PER_IP = 8;

/**
 * Şifre sıfırlama / magic link / reset-password — IP başına 15 dk penceresi.
 * DB-backed (serverless'te email-bombing korumasının güvenilir çalışması için).
 */
export function checkAuthEmailActionLimit(
  action: 'forgot_password' | 'magic_link' | 'reset_password',
  clientId: string
): Promise<RateLimitResult> {
  const max = action === 'forgot_password' ? MAX_FORGOT_PASSWORD_PER_IP
    : action === 'magic_link' ? MAX_MAGIC_LINK_PER_IP
    : 12; // reset_password
  return checkRateLimitDb(`email_${action}:${clientId}`, max, AUTH_EMAIL_WINDOW_MS);
}
