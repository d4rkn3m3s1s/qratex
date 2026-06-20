/**
 * Timezone standard: backend UTC, frontend locale dönüşümü.
 * Tüm backend new Date() UTC; raporlar/export locale ile formatlanır.
 */
import { format } from 'date-fns';

/** Backend: UTC ISO string (Prisma DateTime ile uyumlu). */
export function toUTC(date: Date | string | number): Date {
  if (typeof date === 'string' || typeof date === 'number') {
    return new Date(date);
  }
  return date;
}

/**
 * UTC gün başlangıcı (00:00:00.000 UTC). TEK kaynak — analytics/cap/streak
 * gün sınırları her yerde aynı olmalı (yerel setHours sunucu TZ'ine göre kayar).
 */
export function startOfDayUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** UTC hafta başlangıcı — Pazartesi 00:00 UTC. */
export function startOfWeekUTC(d: Date = new Date()): Date {
  const x = startOfDayUTC(d);
  const day = x.getUTCDay(); // 0=Pazar ... 6=Cumartesi
  const diffToMonday = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diffToMonday);
  return x;
}

/** Backend: UTC'de format (ISO veya belirli format). */
export function formatDateUTC(date: Date | string, fmt = 'yyyy-MM-dd'): string {
  const d = toUTC(date);
  return format(d, fmt);
}

/** Frontend: kullanıcının timezone'una göre format (varsayılan Türkiye). */
export function formatDateTimeLocal(
  date: Date | string,
  locale = 'tr-TR'
): string {
  const d = toUTC(date);
  const tz = locale === 'tr-TR' ? 'Europe/Istanbul' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return d.toLocaleString(locale, { timeZone: tz });
}

/** Frontend: sadece tarih (locale). */
export function formatDateLocal(date: Date | string, locale = 'tr-TR'): string {
  const d = toUTC(date);
  const tz = locale === 'tr-TR' ? 'Europe/Istanbul' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return d.toLocaleDateString(locale, { timeZone: tz });
}
