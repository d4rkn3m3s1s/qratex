/**
 * Rate limiter. In-memory (per process) hızlı katman + DB-backed kalıcı katman.
 *
 * Serverless (Vercel) ortamında her Lambda kendi belleğinde olduğu ve cold
 * start sayaçları sıfırladığı için in-memory Map TEK başına güvenilir değildir.
 * Güvenlik açısından kritik kontroller (login lockout, auth-email, register,
 * QR scan, public action) `RateLimitCounter` tablosuna dayanan async
 * fonksiyonları kullanır (aşağıda *Db varyantları).
 */
import { prisma } from '@/lib/prisma';

const store = new Map<string, { count: number; resetAt: number }>();

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
  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowMs);

  // 1) Kayıt yoksa oluştur (count=1). Varsa create atlanır.
  try {
    await prisma.rateLimitCounter.create({
      data: { bucket, count: 1, resetAt: newResetAt },
    });
    return { ok: true, remaining: max - 1 };
  } catch {
    // zaten var — devam
  }

  // 2) Penceresi dolmuşsa atomik resetle (count=1) — koşullu updateMany.
  const reset = await prisma.rateLimitCounter.updateMany({
    where: { bucket, resetAt: { lte: now } },
    data: { count: 1, resetAt: newResetAt },
  });
  if (reset.count > 0) {
    return { ok: true, remaining: max - 1 };
  }

  // 3) Pencere aktif: limiti aşmayacaksa atomik artır.
  const bumped = await prisma.rateLimitCounter.updateMany({
    where: { bucket, count: { lt: max }, resetAt: { gt: now } },
    data: { count: { increment: 1 } },
  });
  if (bumped.count > 0) {
    const row = await prisma.rateLimitCounter.findUnique({ where: { bucket }, select: { count: true } });
    return { ok: true, remaining: Math.max(0, max - (row?.count ?? max)) };
  }

  // 4) Limit dolu.
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

export async function recordFailedLoginAttemptDb(identifier: string): Promise<void> {
  const now = new Date();
  const bucket = `lockout:${identifier}`;
  const windowResetAt = new Date(now.getTime() + LOCKOUT_MS);

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
  await prisma.rateLimitCounter.update({
    where: { bucket },
    data: {
      count: newCount,
      lockedUntil: newCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : existing.lockedUntil,
    },
  });
}

export async function clearFailedLoginAttemptsDb(identifier: string): Promise<void> {
  await prisma.rateLimitCounter.deleteMany({ where: { bucket: `lockout:${identifier}` } });
}

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REGISTER = 5;
const MAX_LOGIN = 10;
const MAX_FEEDBACK = 20;
const MAX_FEEDBACK_PER_QR_PER_WINDOW = 5;
const MAX_SCAN_PER_IP_PER_MINUTE = 60; // QR scan abuse protection

function getKey(prefix: string, identifier: string): string {
  return `${prefix}:${identifier}`;
}

function cleanup(key: string): void {
  const entry = store.get(key);
  if (entry && Date.now() > entry.resetAt) store.delete(key);
}

export function checkRateLimit(
  prefix: 'register' | 'login' | 'feedback',
  identifier: string
): { ok: boolean; remaining: number; retryAfterMs?: number } {
  const key = getKey(prefix, identifier);
  cleanup(key);

  const max =
    prefix === 'register' ? MAX_REGISTER : prefix === 'login' ? MAX_LOGIN : MAX_FEEDBACK;
  let entry = store.get(key);

  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + WINDOW_MS };
    store.set(key, entry);
    return { ok: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }

  entry.count += 1;
  return { ok: true, remaining: max - entry.count };
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;
  return ip || request.headers.get('x-real-ip') || 'unknown';
}

// --- Login lockout (5 failed attempts = 15 min block) ---
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const lockoutStore = new Map<
  string,
  { failedCount: number; lockedUntil: number }
>();

function cleanupLockout(key: string): void {
  const entry = lockoutStore.get(key);
  if (entry && Date.now() > entry.lockedUntil) lockoutStore.delete(key);
}

export function getLoginLockout(identifier: string): { locked: boolean; retryAfterMs?: number } {
  cleanupLockout(identifier);
  const entry = lockoutStore.get(identifier);
  if (!entry) return { locked: false };
  if (entry.failedCount >= MAX_FAILED_ATTEMPTS && Date.now() < entry.lockedUntil) {
    return {
      locked: true,
      retryAfterMs: Math.max(0, entry.lockedUntil - Date.now()),
    };
  }
  if (Date.now() >= entry.lockedUntil) {
    lockoutStore.delete(identifier);
    return { locked: false };
  }
  return { locked: false };
}

export function recordFailedLoginAttempt(identifier: string): void {
  cleanupLockout(identifier);
  const entry = lockoutStore.get(identifier);
  const now = Date.now();
  if (!entry) {
    lockoutStore.set(identifier, {
      failedCount: 1,
      lockedUntil: now + LOCKOUT_MS,
    });
    return;
  }
  const newCount = entry.failedCount + 1;
  lockoutStore.set(identifier, {
    failedCount: newCount,
    lockedUntil: newCount >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : entry.lockedUntil,
  });
}

export function clearFailedLoginAttempts(identifier: string): void {
  lockoutStore.delete(identifier);
}

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

const MAX_ADMIN_SEO_PER_MINUTE = 30;
const MAX_ADMIN_MUTATION_PER_MINUTE = 50;

/** Admin SEO API: dakikada max istek (identifier = userId) */
export function checkAdminSeoRateLimit(identifier: string): { ok: boolean; retryAfterMs?: number } {
  const key = getKey('admin_seo', identifier);
  cleanup(key);
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + WINDOW_MS };
    store.set(key, entry);
    return { ok: true };
  }
  if (entry.count >= MAX_ADMIN_SEO_PER_MINUTE) {
    return {
      ok: false,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }
  entry.count += 1;
  return { ok: true };
}

/** Admin mutation APIs (settings batch, feedbacks delete/restore, api-keys, webhooks, user bulk): dakikada max istek (identifier = userId) */
export function checkAdminRateLimit(identifier: string): { ok: boolean; retryAfterMs?: number } {
  const key = getKey('admin_mutation', identifier);
  cleanup(key);
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + WINDOW_MS };
    store.set(key, entry);
    return { ok: true };
  }
  if (entry.count >= MAX_ADMIN_MUTATION_PER_MINUTE) {
    return {
      ok: false,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }
  entry.count += 1;
  return { ok: true };
}

// --- QRA floating chat (/api/chat): müşteri sıkı, bayi/admin gevşek, anon IP parmak izi ---
const QRA_CHAT_WINDOW_MS = 60 * 1000;
const MAX_QRA_CHAT_PER_MINUTE = {
  admin: 120,
  dealer_staff: 80,
  customer: 12,
  anonymous: 8,
} as const;

export type QraChatTier = keyof typeof MAX_QRA_CHAT_PER_MINUTE;

export function checkQraChatRateLimit(
  identifier: string,
  tier: QraChatTier
): { ok: boolean; retryAfterMs?: number; remaining?: number } {
  const key = getKey('qra_chat', `${tier}:${identifier}`);
  cleanup(key);
  const max = MAX_QRA_CHAT_PER_MINUTE[tier];
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + QRA_CHAT_WINDOW_MS };
    store.set(key, entry);
    return { ok: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }
  entry.count += 1;
  return { ok: true, remaining: max - entry.count };
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
