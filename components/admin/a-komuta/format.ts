/** Komuta Merkezi istemci biçimleyicileri (İstanbul saatinde). */
const TZ = 'Europe/Istanbul';

/** `YYYY-MM-DDTHH` (İstanbul yerel) → UTC an. */
export function keyToDate(key: string): Date {
  const [d, h] = key.split('T');
  const [y, m, day] = (d ?? '').split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1, Number(h ?? 0) - 3));
}

const hourFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ });
const dayLongFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });

export function bucketLabel(key: string, unit: 'hour' | 'day', long = false): string {
  const d = keyToDate(key);
  if (unit === 'hour') return long ? `${dayFmt.format(d)} ${hourFmt.format(d)}` : hourFmt.format(d);
  return long ? dayLongFmt.format(d) : dayFmt.format(d);
}

export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatClock = (iso: string) => timeFmt.format(new Date(iso));
export const formatInt = (n: number) => n.toLocaleString('tr-TR');

export const RANGE_LABEL = { '24h': 'Son 24 saat', '7d': 'Son 7 gün', '30d': 'Son 30 gün' } as const;
