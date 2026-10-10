import type { Tone } from '@/components/states';
import type { PrintTemplate, QrSort, QrStatus, QrStatusFilter } from '@/lib/dealer/qr-codes/rules';

export const STATUS_LABEL: Record<QrStatus, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  expired: 'Süresi doldu',
  revoked: 'İptal edildi',
  archived: 'Arşivde',
};

export const STATUS_TONE: Record<QrStatus, Tone> = {
  active: 'success',
  paused: 'neutral',
  expired: 'warning',
  revoked: 'danger',
  archived: 'neutral',
};

export const FILTER_LABEL: Record<QrStatusFilter, string> = {
  all: 'Tümü',
  active: 'Aktif',
  paused: 'Duraklatılan',
  expiring: 'Süresi yaklaşan',
  expired: 'Süresi dolan',
  revoked: 'İptal',
  archived: 'Arşiv',
};

export const SORT_LABEL: Record<QrSort, string> = {
  newest: 'En yeni',
  oldest: 'En eski',
  name: 'Ada göre',
  expiry: 'Son kullanma tarihine göre',
};

export const TEMPLATE_META: Record<PrintTemplate, { label: string; hint: string }> = {
  card: { label: 'Masa kartı', hint: 'A6 (105×148 mm) — standa ya da masaya' },
  tent: { label: 'Katlanır masa standı', hint: 'A4 — ortadan katlanır, iki yüzü de okunur' },
  sticker: { label: 'Sticker', hint: '90×90 mm — kapı, kasa, paket' },
  plain: { label: 'Yalnız QR', hint: '60×60 mm — kendi tasarımınıza yerleştirin' },
};

const nf = new Intl.NumberFormat('tr-TR');
export const fmtInt = (n: number) => nf.format(n);

export function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(v)}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso)
  );
}

export function fmtDayShort(day: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' }).format(
    new Date(`${day}T12:00:00+03:00`)
  );
}

/** "312 tarama · 41 yorum · %13" */
export function statsLine(scans: number, feedbacks: number, conversion: number | null): string {
  const parts = [`${fmtInt(scans)} tarama`, `${fmtInt(feedbacks)} yorum`];
  if (conversion != null) parts.push(`${fmtPct(conversion)} dönüşüm`);
  return parts.join(' · ');
}

export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'İşlem tamamlanamadı.';
}
