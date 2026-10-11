import { defineStatusMap } from '@/components/ds/data';

const DT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const DTY = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const D = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short' });
const NUM = new Intl.NumberFormat('tr-TR');
const REL = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export const fmtDateTime = (iso: string | null | undefined) => (iso ? DT.format(new Date(iso)) : '—');
export const fmtDateTimeYear = (iso: string | null | undefined) => (iso ? DTY.format(new Date(iso)) : '—');
/** `YYYY-MM-DD` (İstanbul günü) → "13 Eki". */
export const fmtDay = (day: string) => D.format(new Date(`${day}T12:00:00+03:00`));
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
export const fmtMs = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : `${ms} ms`);

export function fmtRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return REL.format(Math.round(diff), 'second');
  if (abs < 3600) return REL.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return REL.format(Math.round(diff / 3600), 'hour');
  return REL.format(Math.round(diff / 86400), 'day');
}

export const SAMPLE_STATUS = defineStatusMap({
  pending: { label: 'Bekliyor', tone: 'warning' },
  reviewed: { label: 'İncelendi', tone: 'success' },
  skipped: { label: 'Atlandı', tone: 'neutral' },
  void: { label: 'Geçersiz', tone: 'danger' },
});

export const CHAT_OUTCOME = defineStatusMap({
  ok: { label: 'Yanıtlandı', tone: 'success' },
  blocked: { label: 'Güvenlik engeli', tone: 'danger' },
  maintenance: { label: 'Bakım yanıtı', tone: 'warning' },
  error: { label: 'Model hatası', tone: 'danger' },
});

/** Doğruluk skoru tonu (yalnız renk değil; yanında sayı her zaman yazılır). */
export const scoreTone = (s: number | null | undefined) => (s == null ? 'neutral' : s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger');
