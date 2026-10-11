/**
 * Ayarlar yüzeyi biçimleyicileri ve sabit metin eşlemeleri. Zaman: Europe/Istanbul.
 */
const TZ = 'Europe/Istanbul';

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts }).format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  return fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtInt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat('tr-TR').format(n) : '—';
}

/** En küçük para biriminden (kuruş) biçim: 49900 TRY → "₺499,00". */
export function fmtMoneyMinor(minor: number, currency: string): string {
  const code = (currency || 'TRY').toUpperCase();
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: code }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/** "3 gün önce" gibi göreli zaman (yalnız istemcide, hidrasyon sonrası çağrılmalı). */
export function relativeDays(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'bugün';
  if (days === 1) return 'dün';
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ay önce`;
  return `${Math.floor(months / 12)} yıl önce`;
}

export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
export const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
/** JS haftanın günü (Paz=0) → kısa ad. */
export const WEEKDAY_SHORT_BY_JS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

export const SECURITY_EVENT_LABEL: Record<string, string> = {
  CHANGE_PASSWORD: 'Şifre değiştirildi',
  SET_INITIAL_PASSWORD: 'Şifre oluşturuldu',
  PASSWORD_RESET: 'Şifre sıfırlandı',
  REVOKE_SESSIONS: 'Oturumlar kapatıldı',
  UPDATE_ACCOUNT: 'Hesap bilgileri güncellendi',
  UPDATE_BUSINESS_PROFILE: 'İşletme profili güncellendi',
  UPDATE_AI_SETTINGS: 'AI ayarları değiştirildi',
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  active: { label: 'Aktif', tone: 'success' },
  trialing: { label: 'Deneme sürümü', tone: 'info' },
  past_due: { label: 'Ödeme alınamadı', tone: 'danger' },
  unpaid: { label: 'Ödenmedi', tone: 'danger' },
  canceled: { label: 'İptal edildi', tone: 'neutral' },
  incomplete: { label: 'Ödeme bekleniyor', tone: 'warning' },
  incomplete_expired: { label: 'Ödeme süresi doldu', tone: 'neutral' },
  paused: { label: 'Duraklatıldı', tone: 'warning' },
};

export const INVOICE_STATUS: Record<string, string> = {
  paid: 'Ödendi',
  open: 'Ödeme bekliyor',
  draft: 'Taslak',
  void: 'İptal',
  uncollectible: 'Tahsil edilemedi',
};

export const INTERVAL_LABEL: Record<string, string> = {
  monthly: '/ ay',
  month: '/ ay',
  yearly: '/ yıl',
  year: '/ yıl',
  lifetime: 'tek seferlik',
};

export const LEARNING_STATUS_LABEL: Record<string, string> = {
  idle: 'Henüz eğitilmedi',
  training: 'Eğitiliyor',
  ready: 'Hazır',
  unknown: 'Bilinmiyor',
};

export const PROVIDER_LABEL: Record<string, string> = { google: 'Google', apple: 'Apple', github: 'GitHub', facebook: 'Facebook' };
