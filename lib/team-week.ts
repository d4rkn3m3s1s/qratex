import { utcMondayWeekStart } from '@/lib/innovation-week';

/**
 * Haftalık pano için hafta anahtarı ("YYYY-Www", ISO-benzeri, Pazartesi başlangıçlı UTC).
 * Ekip modülünde CompanyTask.weekKey ile eşleşir.
 */
export function weekKeyOf(date: Date = new Date()): string {
  const monday = utcMondayWeekStart(date);
  const year = monday.getUTCFullYear();
  // Yılın ilk pazartesisine göre hafta numarası.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstMonday = utcMondayWeekStart(jan1);
  const diffWeeks = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const week = diffWeeks + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** weekKey'i bir önceki/sonraki haftaya kaydırır (offset: -1 geçen, +1 gelecek). */
export function shiftWeekKey(currentKey: string, offset: number): string {
  const monday = mondayFromWeekKey(currentKey);
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return weekKeyOf(monday);
}

/** weekKey'den o haftanın pazartesi tarihini üretir. */
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
