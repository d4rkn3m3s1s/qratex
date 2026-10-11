/**
 * Çalışma saatleri düzenleyici modeli ↔ kayıtlı `User.businessHours` metni.
 *
 * Okuyucular (Keşfet kartı, mekân detayı, Kaydettiklerim) `lib/places/business-hours.ts`
 * üzerinden hem eski serbest metni hem JSON biçimini çözer. Ayarlar artık YAPILANDIRILMIŞ
 * JSON yazar (`{"mon":[{"open":"09:00","close":"18:00"}],"tue":[],…}`) — böylece bayinin
 * girdiği saat, müşterinin gördüğü "Açık · 18:00'de kapanır" ile birebir aynı kurala bağlıdır.
 *
 * Düzenleyici sırası Pazartesi → Pazar (0…6); `WeeklySchedule` ise Pazar = 0 kullanır.
 * Saf modül (istemci + sunucu; Jest).
 */
import { formatMinutes, parseBusinessHours, type WeeklySchedule } from '@/lib/places/business-hours';
import type { DayHours, WeeklyHours } from './contract';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Düzenleyici gün sırası (Pzt=0) → JS haftanın günü (Paz=0). */
export function uiDayToWeekday(uiIndex: number): number {
  return (uiIndex + 1) % 7;
}

export function emptyWeek(): WeeklyHours {
  return DAY_KEYS.map(() => ({ open: false, ranges: [] }));
}

function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return 1440;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhmm(min: number, isClose: boolean): string {
  if (isClose && min === 1440) return '24:00';
  return formatMinutes(min);
}

/** Çözümlenmiş haftalık program → düzenleyici değeri. */
export function scheduleToWeek(schedule: WeeklySchedule): WeeklyHours {
  return DAY_KEYS.map((_, i) => {
    const ranges = (schedule[uiDayToWeekday(i)] ?? []).slice(0, 3).map((r) => ({
      open: minutesToHhmm(r.open, false),
      close: minutesToHhmm(r.close, true),
    }));
    return { open: ranges.length > 0, ranges };
  });
}

export interface StoredHours {
  hours: WeeklyHours;
  /** Kayıt eski serbest metinse ham metin + çözümlenebildi mi. */
  legacy: { raw: string; parsed: boolean } | null;
}

/** Kayıtlı alanı düzenleyici değerine çevirir. JSON biçimi "yapılandırılmış" sayılır. */
export function hoursFromStored(raw: string | null | undefined): StoredHours {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { hours: emptyWeek(), legacy: null };
  const parsed = parseBusinessHours(text);
  if (text.startsWith('{')) {
    return { hours: parsed ? scheduleToWeek(parsed) : emptyWeek(), legacy: parsed ? null : { raw: text.slice(0, 500), parsed: false } };
  }
  return { hours: parsed ? scheduleToWeek(parsed) : emptyWeek(), legacy: { raw: text.slice(0, 500), parsed: !!parsed } };
}

export interface HoursIssue {
  day: number;
  range?: number;
  message: string;
}

/**
 * İş kuralları: açık gün en az bir aralık ister; açılış ≠ kapanış (24 saat için 00:00–24:00);
 * gece taşan (kapanış ≤ açılış) aralık yalnız günün SON aralığı olabilir; aralıklar çakışmaz.
 */
export function validateWeek(week: WeeklyHours): HoursIssue[] {
  const issues: HoursIssue[] = [];
  week.forEach((day: DayHours, d) => {
    if (!day.open) return;
    if (day.ranges.length === 0) {
      issues.push({ day: d, message: 'Açık günde en az bir saat aralığı olmalı' });
      return;
    }
    const mins = day.ranges.map((r) => ({ open: toMinutes(r.open), close: toMinutes(r.close) }));
    mins.forEach((r, i) => {
      if (r.open === r.close) issues.push({ day: d, range: i, message: 'Açılış ve kapanış aynı olamaz (24 saat için 00:00–24:00)' });
      if (r.close < r.open && i !== mins.length - 1) {
        issues.push({ day: d, range: i, message: 'Gece yarısını aşan aralık günün son aralığı olmalı' });
      }
    });
    for (let i = 1; i < mins.length; i++) {
      const prev = mins[i - 1];
      const prevEnd = prev.close <= prev.open ? 1440 : prev.close;
      if (mins[i].open < prevEnd) {
        issues.push({ day: d, range: i, message: 'Aralıklar sıralı olmalı ve çakışmamalı' });
      }
    }
  });
  return issues;
}

/** Düzenleyici değeri → kayıt metni. Hiç açık gün yoksa `null` (saat bilinmiyor). */
export function weekToStored(week: WeeklyHours): string | null {
  const out: Record<string, Array<{ open: string; close: string }>> = {};
  let any = false;
  week.forEach((day, i) => {
    const ranges = day.open ? day.ranges.map((r) => ({ open: r.open, close: r.close })) : [];
    if (ranges.length > 0) any = true;
    out[DAY_KEYS[i]] = ranges;
  });
  return any ? JSON.stringify(out) : null;
}

/** İki düzenleyici değeri eşit mi (kirli durum karşılaştırması). */
export function sameWeek(a: WeeklyHours, b: WeeklyHours): boolean {
  return weekToStored(a) === weekToStored(b);
}
