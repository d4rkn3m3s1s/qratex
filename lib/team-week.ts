import { utcMondayWeekStart } from '@/lib/innovation-week';
import { istanbulDayOf } from '@/lib/team/dates';

/**
 * Haftalık pano için hafta anahtarı ("YYYY-Www", Pazartesi başlangıçlı).
 * Ekip modülünde CompanyTask.weekKey ile eşleşir.
 *
 * Hafta, ANIN İSTANBUL takvim gününe göre belirlenir (Pazartesi 00:00–03:00 TR arası artık
 * geçen haftaya düşmez). Anahtar biçimi değişmedi; eski kayıtlarla uyumlu.
 */
export function weekKeyOf(date: Date = new Date()): string {
  const day = istanbulDayOf(date);
  const [y, m, d] = day.split('-').map(Number);
  const base = Number.isFinite(y) ? new Date(Date.UTC(y, m - 1, d)) : date;
  const monday = utcMondayWeekStart(base);
  const year = monday.getUTCFullYear();
  // Yılın ilk pazartesisine göre hafta numarası.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstMonday = utcMondayWeekStart(jan1);
  const diffWeeks = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const week = diffWeeks + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** Geçerli bir hafta anahtarı mı? */
export function isWeekKey(value: unknown): value is string {
  return typeof value === 'string' && WEEK_RE.test(value);
}

/** weekKey'i bir önceki/sonraki haftaya kaydırır (offset: -1 geçen, +1 gelecek). */
export function shiftWeekKey(currentKey: string, offset: number): string {
  const monday = mondayFromWeekKey(currentKey);
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return weekKeyOfUtcMonday(monday);
}

/** UTC pazartesi tarihinden anahtar (İstanbul dönüşümü olmadan; takvim aritmetiği için). */
function weekKeyOfUtcMonday(monday: Date): string {
  const year = monday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstMonday = utcMondayWeekStart(jan1);
  const diffWeeks = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks < 0) {
    // Yılın ilk pazartesisinden önceki günler önceki yılın son haftasıdır.
    return weekKeyOfUtcMonday(utcMondayWeekStart(new Date(Date.UTC(year - 1, 11, 31))));
  }
  return `${year}-W${String(diffWeeks + 1).padStart(2, '0')}`;
}

/** weekKey'den o haftanın pazartesi tarihini üretir (UTC gece yarısı). */
export function mondayFromWeekKey(key: string): Date {
  const [yStr, wStr] = key.split('-W');
  const year = Number(yStr);
  const week = Number(wStr);
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstMonday = utcMondayWeekStart(jan1);
  const monday = new Date(firstMonday);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** Haftanın 7 günü (`YYYY-MM-DD`, Pazartesi → Pazar). */
export function weekDays(key: string): string[] {
  const monday = mondayFromWeekKey(key);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  });
}

/** weekKey'in insan-okunur etiketi ("6 Oca – 12 Oca 2026"). Hydration-güvenli (UTC + sabit ay adları). */
const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function weekKeyLabel(key: string): string {
  const monday = mondayFromWeekKey(key);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const m1 = `${monday.getUTCDate()} ${TR_MONTHS[monday.getUTCMonth()]}`;
  const m2 = `${sunday.getUTCDate()} ${TR_MONTHS[sunday.getUTCMonth()]} ${sunday.getUTCFullYear()}`;
  return `${m1} – ${m2}`;
}
