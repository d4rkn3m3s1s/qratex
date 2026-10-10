import { addDays } from '@/components/ds/page/date-range';
import { localeTag, type MeLocale } from '../copy';
import type { BucketUnit } from '../period';

/** Kova anahtarı (`YYYY-MM-DD`, takvim günü) → okunur etiket. Takvim günü olduğu için UTC ile biçimlenir. */
export function bucketLabel(key: string, unit: BucketUnit, locale: MeLocale, long = false): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const tag = localeTag(locale);
  if (unit === 'month') {
    return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' }).format(date);
  }
  const fmt = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  if (unit === 'week') {
    const endKey = addDays(key, 6);
    const [ey, em, ed] = endKey.split('-').map(Number);
    const end = new Date(Date.UTC(ey, em - 1, ed));
    return long ? `${fmt.format(date)} – ${fmt.format(end)}` : fmt.format(date);
  }
  if (long) {
    return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }
  return fmt.format(date);
}

/** ISO gün indeksi (1 = Pazartesi … 7 = Pazar) → kısa/uzun gün adı. 2024-01-01 bir Pazartesi. */
export function weekdayName(isoDow: number, locale: MeLocale, long = false): string {
  const date = new Date(Date.UTC(2024, 0, isoDow));
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'UTC', weekday: long ? 'long' : 'short' }).format(date);
}
