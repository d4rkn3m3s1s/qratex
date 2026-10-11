import { defineStatusMap } from '@/components/ds/data';
import type { Tone } from '@/components/states/tone';
import { ROLE_LABELS, ROLE_TONES, resolveRoleKey } from '@/app/admin/users/role-meta';

/** Saat dilimi sabit: Europe/Istanbul (mimari ilke 10). */
const TZ = 'Europe/Istanbul';

const nf = new Intl.NumberFormat('tr-TR');
const df = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export const fmtNumber = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? nf.format(n) : '—');
export const fmtSigned = (n: number) => (n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(Math.abs(n))}` : '0');
export const fmtDate = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)) : '—');

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  return df.format(new Date(iso));
}

export const roleLabel = (r: string) => {
  const k = resolveRoleKey(r);
  return k === 'UNKNOWN' ? r || ROLE_LABELS.UNKNOWN : ROLE_LABELS[k];
};
export const roleTone = (r: string): Tone => ROLE_TONES[resolveRoleKey(r)];

export const ROLE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Müşteri' },
  { value: 'DEALER', label: 'Bayi' },
  { value: 'STAFF', label: 'Personel' },
  { value: 'ADMIN', label: 'Admin' },
] as const;

export const STATUS = defineStatusMap({
  active: { label: 'Etkin', tone: 'success' },
  suspended: { label: 'Askıda', tone: 'warning' },
  anonymized: { label: 'Anonimleştirildi', tone: 'neutral' },
});

export const TRUST = defineStatusMap({
  trusted: { label: 'Güvenilir', tone: 'success' },
  neutral: { label: 'Nötr', tone: 'neutral' },
  watch: { label: 'İzlemede', tone: 'warning' },
  low: { label: 'Düşük güven', tone: 'danger' },
});

export const FRAUD = defineStatusMap({
  clean: { label: 'Temiz', tone: 'success' },
  flagged: { label: 'İşaretli', tone: 'warning' },
  shadow_ban: { label: 'Gölge yasak', tone: 'danger' },
});

export const RARITY_LABELS: Record<string, string> = {
  common: 'Yaygın',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
};
export const rarityLabel = (r: string) => RARITY_LABELS[r] ?? r;

const SOURCE_LABELS: Record<string, string> = {
  feedback: 'Geri bildirim',
  review: 'Tüketim yorumu',
  consumption: 'Tüketim',
  dealer_passive: 'İşletme puanı',
  game: 'Oyun',
  tournament: 'Turnuva',
  quest: 'Görev',
  badge: 'Rozet ödülü',
  referral: 'Davet',
  streak: 'Seri',
  spin: 'Çark',
  surprise: 'Sürpriz kutu',
  squad: 'Klan',
  remedy: 'Telafi',
  seasonal: 'Sezon etkinliği',
  shop: 'Mağaza',
  reward: 'Ödül harcaması',
  gift: 'Hediye',
  donation: 'Bağış',
  admin_adjust: 'Yönetici düzeltmesi',
  automation: 'Otomasyon',
  opening_balance: 'Açılış bakiyesi',
  reversal: 'Ters kayıt',
};
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

export const LEDGER_STATUS = defineStatusMap({
  posted: { label: 'İşlendi', tone: 'success' },
  pending: { label: 'Bekletmede', tone: 'warning' },
  void: { label: 'Geçersiz', tone: 'neutral' },
  reversed: { label: 'Ters çevrildi', tone: 'info' },
});

const AUDIT_LABELS: Record<string, string> = {
  ADMIN_POINTS_ADJUST: 'Puan düzeltmesi',
  ADMIN_POINTS_ADJUST_APPROVAL: 'Puan düzeltmesine ikinci onay',
  USER_ROLE_CHANGE: 'Rol değişikliği',
  ROLE_ELEVATION_REQUESTED: 'Yönetici yükseltme talebi',
  ROLE_ELEVATION_APPROVED: 'Yönetici yükseltmesi onaylandı',
  ROLE_ELEVATION_REJECTED: 'Yönetici yükseltmesi reddedildi',
  USER_SUSPEND: 'Askıya alındı',
  USER_UNSUSPEND: 'Askıdan çıkarıldı',
  BULK_SUSPEND_USERS: 'Toplu askıya alma',
  BULK_UNSUSPEND_USERS: 'Toplu askıdan çıkarma',
  USER_SESSIONS_REVOKE: 'Oturumlar sonlandırıldı',
  USER_DIRECT_NOTIFICATION: 'Doğrudan bildirim',
  USER_PROFILE_UPDATE: 'Profil güncellendi',
  USER_PASSWORD_RESET_LINK: 'Şifre sıfırlama bağlantısı',
  USER_VERIFY_LINK: 'Doğrulama bağlantısı',
  USERS_EXPORT: 'Kullanıcı dışa aktarımı',
  grant_badge: 'Rozet verildi',
  revoke_badge: 'Rozet geri alındı',
  grant_reward: 'Ödül verildi',
  create: 'Oluşturma',
  update: 'Güncelleme',
  delete: 'Silme',
  USER_ANONYMIZED: 'Anonimleştirildi',
};
export const auditLabel = (a: string) => AUDIT_LABELS[a] ?? a.replace(/_/g, ' ').toLocaleLowerCase('tr-TR');

export const initials = (name: string | null, email: string) =>
  (name || email)
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR');

export const displayName = (u: { name: string | null; email: string }) => u.name?.trim() || u.email;
