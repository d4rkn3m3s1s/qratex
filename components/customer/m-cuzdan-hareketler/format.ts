'use client';

/**
 * Yerel biçimleyiciler — uygulama dilini izler (denetim B6: göreli zaman/para EN'de Türkçe çıkıyordu).
 * Gün sınırları Europe/Istanbul'a göre (`istanbulDay`), cihaz saat diliminden bağımsız.
 */
import { useMemo } from 'react';
import { addDays, ISTANBUL_TZ, istanbulDay } from '@/components/ds/page/date-range';

export type Formatters = ReturnType<typeof makeFormatters>;

export function makeFormatters(locale: 'tr' | 'en') {
  const tag = locale === 'en' ? 'en-GB' : 'tr-TR';
  const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
  const moneyRound = new Intl.NumberFormat(tag, { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  const rel = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const time = new Intl.DateTimeFormat(tag, { timeZone: ISTANBUL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayLong = new Intl.DateTimeFormat(tag, { timeZone: ISTANBUL_TZ, day: 'numeric', month: 'long', weekday: 'long' });
  const dayLongYear = new Intl.DateTimeFormat(tag, { timeZone: ISTANBUL_TZ, day: 'numeric', month: 'long', year: 'numeric' });
  const dateTime = new Intl.DateTimeFormat(tag, {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const monthYear = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const monthShort = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'short' });
  const dayShort = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const monthOnlyLong = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'long' });

  return {
    locale,
    tag,
    int: (n: number) => int.format(n),
    dec: (n: number) => dec.format(n),
    money: (n: number) => (Number.isInteger(n) ? moneyRound.format(n) : money.format(n)),
    signed: (n: number) => (n > 0 ? `+${int.format(n)}` : n < 0 ? `−${int.format(Math.abs(n))}` : '0'),
    time: (iso: string) => time.format(new Date(iso)),
    dateTime: (iso: string) => dateTime.format(new Date(iso)),
    dayLongYear: (iso: string) => dayLongYear.format(new Date(iso)),
    /** Göreli zaman ("2 gün önce" / "2 days ago"); 30 günden eskiyse tarih. */
    relative: (iso: string, now: number = Date.now()) => {
      const diff = new Date(iso).getTime() - now;
      const abs = Math.abs(diff);
      const min = 60_000;
      const hour = 60 * min;
      const day = 24 * hour;
      if (abs < min) return rel.format(0, 'minute');
      if (abs < hour) return rel.format(Math.round(diff / min), 'minute');
      if (abs < day) return rel.format(Math.round(diff / hour), 'hour');
      if (abs < 30 * day) return rel.format(Math.round(diff / day), 'day');
      return dayLongYear.format(new Date(iso));
    },
    /** İstanbul günü başlığı: Bugün / Dün / "12 Ekim Pazartesi". */
    dayHeading: (day: string, labels: { today: string; yesterday: string }, today: string = istanbulDay()) => {
      if (day === today) return labels.today;
      if (day === addDays(today, -1)) return labels.yesterday;
      // Öğlen UTC: her saat diliminde aynı takvim günü.
      const at = new Date(`${day}T12:00:00Z`);
      return day.slice(0, 4) === today.slice(0, 4) ? dayLong.format(at) : dayLongYear.format(at);
    },
    /** Kova anahtarı (`YYYY-MM-DD`) → kısa etiket. */
    bucketLabel: (key: string, bucket: 'day' | 'week' | 'month') => {
      const at = new Date(`${key}T12:00:00Z`);
      if (bucket === 'month') return monthShort.format(at);
      return dayShort.format(at);
    },
    bucketLabelLong: (key: string, bucket: 'day' | 'week' | 'month') => {
      const at = new Date(`${key}T12:00:00Z`);
      if (bucket === 'month') return monthYear.format(at);
      return dayLongYear.format(at);
    },
    monthHeading: (monthKey: string, currentYear: string) => {
      const at = new Date(`${monthKey}-15T12:00:00Z`);
      return monthKey.slice(0, 4) === currentYear ? monthOnlyLong.format(at) : monthYear.format(at);
    },
  };
}

export function useFormatters(locale: 'tr' | 'en'): Formatters {
  return useMemo(() => makeFormatters(locale), [locale]);
}

/** Türkçe duyarlı baş harf (İ/ı doğru). */
export function initialOf(name: string | null | undefined, locale: 'tr' | 'en'): string {
  const ch = (name ?? '').trim().charAt(0);
  return ch ? ch.toLocaleUpperCase(locale === 'en' ? 'en-GB' : 'tr-TR') : '?';
}
