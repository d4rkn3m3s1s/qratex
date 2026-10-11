/** Entegrasyon Merkezi biçimleyicileri — saat dilimi her zaman Europe/Istanbul. */
import type { Tone } from '@/components/states';
import type { KeyStatus, WebhookHealth } from '@/lib/integrations/contract';

const TZ = 'Europe/Istanbul';
const absFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' });
const numFmt = new Intl.NumberFormat('tr-TR');
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export const fmtNum = (n: number) => numFmt.format(n);
export const fmtAbs = (iso: string | null | undefined) => (iso ? absFmt.format(new Date(iso)) : '—');
export const fmtDay = (day: string) => dayFmt.format(new Date(`${day}T12:00:00+03:00`));

export function fmtRel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return 'az önce';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 60 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return absFmt.format(new Date(iso));
}

export const KEY_STATUS_META: Record<KeyStatus, { label: string; tone: Tone }> = {
  active: { label: 'Etkin', tone: 'success' },
  expired: { label: 'Süresi doldu', tone: 'neutral' },
  revoked: { label: 'İptal edildi', tone: 'danger' },
};

export const WEBHOOK_STATUS_META: Record<'active' | 'paused' | 'archived', { label: string; tone: Tone }> = {
  active: { label: 'Etkin', tone: 'success' },
  paused: { label: 'Duraklatıldı', tone: 'warning' },
  archived: { label: 'Arşivde', tone: 'neutral' },
};

export const PARTNER_STATUS_META: Record<'active' | 'inactive' | 'archived', { label: string; tone: Tone }> = {
  active: { label: 'Etkin', tone: 'success' },
  inactive: { label: 'Pasif', tone: 'warning' },
  archived: { label: 'Arşivde', tone: 'neutral' },
};

/** Sağlık rozeti: oran + örneklem; renk tek başına anlam taşımaz (metin her zaman var). */
export function healthSummary(h: WebhookHealth): { label: string; tone: Tone } {
  if (h.total === 0) return { label: 'Teslim yok', tone: 'neutral' };
  const rate = Math.round((h.ok / h.total) * 1000) / 10;
  const tone: Tone = rate >= 98 ? 'success' : rate >= 80 ? 'warning' : 'danger';
  return { label: `%${String(rate).replace('.', ',')} · ${fmtNum(h.total)} teslim`, tone };
}

export const ERROR_KIND_LABEL: Record<string, string> = {
  timeout: 'Zaman aşımı',
  network: 'Bağlantı hatası',
  blocked_url: 'Adres engellendi',
  redirect: 'Yönlendirme',
  http_4xx: 'İstemci hatası (4xx)',
  http_5xx: 'Sunucu hatası (5xx)',
  secret: 'İmza sırrı',
};

/** Kalan süre: "12 gün kaldı" / "süresiz". */
export function expiryText(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Süresiz';
  const diff = Date.parse(iso) - now;
  if (diff <= 0) return `Doldu · ${fmtAbs(iso)}`;
  const days = Math.ceil(diff / 86_400_000);
  return days <= 1 ? `${Math.max(1, Math.ceil(diff / 3_600_000))} saat kaldı` : `${days} gün kaldı`;
}

export const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://qratex.com');
