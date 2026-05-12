/**
 * Auth event logging for security monitoring.
 * Logs failed login, lockout, and success (no PII in plain text; email masked).
 * Uses pii-redact for KVKK/GDPR compliance.
 * In production, pipe stdout to a log aggregator or add a transport to a security feed.
 */
import { redactEmail } from '@/lib/pii-redact';

export type AuthEventType =
  | 'auth:login_failed'
  | 'auth:lockout'
  | 'auth:login_success'
  | 'auth:rate_limit';

export interface AuthEventPayload {
  type: AuthEventType;
  ip?: string;
  emailMasked?: string;
  reason?: string;
  retryAfterSec?: number;
  userAgent?: string;
  ts: string;
}

export function logAuthEvent(payload: Omit<AuthEventPayload, 'ts'>): void {
  const event: AuthEventPayload = {
    ...payload,
    ts: new Date().toISOString(),
  };
  try {
    console.log(JSON.stringify({ tag: 'AUTH_EVENT', ...event }));
  } catch {
    // avoid breaking auth flow if logging fails
  }
}

export function logLoginFailed(ip: string, email: string, reason: string): void {
  logAuthEvent({
    type: 'auth:login_failed',
    ip,
    emailMasked: redactEmail(email),
    reason,
  });
}

export function logLockout(ip: string, email: string, retryAfterSec: number): void {
  logAuthEvent({
    type: 'auth:lockout',
    ip,
    emailMasked: redactEmail(email),
    retryAfterSec,
  });
}

export function logLoginSuccess(ip: string, email: string): void {
  logAuthEvent({
    type: 'auth:login_success',
    ip,
    emailMasked: redactEmail(email),
  });
}

export function logRateLimit(ip: string, email: string, retryAfterSec?: number): void {
  logAuthEvent({
    type: 'auth:rate_limit',
    ip,
    emailMasked: redactEmail(email),
    retryAfterSec,
  });
}
