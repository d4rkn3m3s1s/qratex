/** İletişim yüzeyi biçimlendiricileri — saat dilimi her zaman Europe/Istanbul. */
const TZ = 'Europe/Istanbul';

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayMonthFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' });
const fullDateFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' });

/** Liste tarihi: bugün → saat, bu yıl → "12 Eki", eski yıl → "12.10.2025" (Bulgu 16). */
export function fmtListDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const a = dayKey.format(d);
  const b = dayKey.format(now);
  if (a === b) return timeFmt.format(d);
  if (a.slice(0, 4) === b.slice(0, 4)) return dayMonthFmt.format(d);
  return fullDateFmt.format(d);
}

export function fmtLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : longFmt.format(d);
}

/** "3 dk önce" / "2 sa önce" / "dün" / tarih. */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'hiç';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'az önce';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  if (d === 1) return 'dün';
  if (d < 7) return `${d} gün önce`;
  return fullDateFmt.format(new Date(t));
}

/** `YYYY-MM-DDTHH:mm` (İstanbul yerel) → okunur etiket; eski serbest metin aynen. */
export function fmtDeadline(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return s;
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
}

/** İstanbul'da "şu an" — `datetime-local` karşılaştırması için `YYYY-MM-DDTHH:mm`. */
export function istanbulNowLocal(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function initials(name: string | null | undefined, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR');
}
