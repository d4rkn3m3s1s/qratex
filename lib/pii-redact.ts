/**
 * PII redaction for safe logging (KVKK / GDPR).
 * Use before writing any user data to logs or audit payloads.
 */
import { maskIpAddress } from '@/lib/request-metadata';

function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const masked = local.length <= 1 ? '*' : local[0] + '***';
  return `${masked}@${domain}`;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '***';
  if (phone.length <= 4) return '****';
  return phone.slice(-4).padStart(phone.length, '*');
}

export function redactEmail(email: string | null | undefined): string {
  return maskEmail(email);
}

export function redactPhone(phone: string | null | undefined): string {
  return maskPhone(phone);
}

export function redactIp(ip: string | null | undefined): string | null {
  return maskIpAddress(ip);
}

const PII_KEYS = ['email', 'phone', 'ipAddress', 'ip', 'userAgent'];

/**
 * Returns a copy of the object with PII keys redacted for logging.
 */
export function redactForLog<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of PII_KEYS) {
    if (key in out && out[key] != null) {
      const v = out[key];
      if (key === 'email') (out as Record<string, unknown>)[key] = maskEmail(v as string);
      else if (key === 'phone') (out as Record<string, unknown>)[key] = maskPhone(v as string);
      else if (key === 'ipAddress' || key === 'ip') (out as Record<string, unknown>)[key] = maskIpAddress(v as string);
      else (out as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return out;
}
