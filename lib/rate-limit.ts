/**
 * In-memory rate limiter (per process). For production at scale, use Redis or similar.
 * Keys are cleared after windowMs to avoid unbounded growth.
 */

const store = new Map<string, { count: number; resetAt: number }>();

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

// --- Per-QR feedback throttle (abuse protection) ---
export function checkFeedbackPerQrRateLimit(
  qrCodeId: string,
  ip: string
): { ok: boolean; retryAfterMs?: number } {
  const key = getKey('feedback_qr', `${qrCodeId}:${ip}`);
  cleanup(key);
  const max = MAX_FEEDBACK_PER_QR_PER_WINDOW;
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + WINDOW_MS };
    store.set(key, entry);
    return { ok: true };
  }
  if (entry.count >= max) {
    return {
      ok: false,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }
  entry.count += 1;
  return { ok: true };
}

// --- QR scan throttle (abuse protection) ---
export function checkScanRateLimit(ip: string): { ok: boolean; retryAfterMs?: number } {
  const key = getKey('scan', ip);
  cleanup(key);
  const max = MAX_SCAN_PER_IP_PER_MINUTE;
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: Date.now() + WINDOW_MS };
    store.set(key, entry);
    return { ok: true };
  }
  if (entry.count >= max) {
    return {
      ok: false,
      retryAfterMs: Math.max(0, entry.resetAt - Date.now()),
    };
  }
  entry.count += 1;
  return { ok: true };
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

const emailActionStore = new Map<string, { count: number; resetAt: number }>();
const AUTH_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FORGOT_PASSWORD_PER_IP = 8;
const MAX_MAGIC_LINK_PER_IP = 8;

/** Şifre sıfırlama / magic link — IP başına 15 dk penceresi */
export function checkAuthEmailActionLimit(
  action: 'forgot_password' | 'magic_link',
  clientId: string
): { ok: boolean; retryAfterMs?: number } {
  const key = `email_${action}:${clientId}`;
  const max = action === 'forgot_password' ? MAX_FORGOT_PASSWORD_PER_IP : MAX_MAGIC_LINK_PER_IP;
  const now = Date.now();
  const existing = emailActionStore.get(key);
  if (!existing || now > existing.resetAt) {
    emailActionStore.set(key, { count: 1, resetAt: now + AUTH_EMAIL_WINDOW_MS });
    return { ok: true };
  }
  if (existing.count >= max) {
    return { ok: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  return { ok: true };
}
