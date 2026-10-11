/** Güven Merkezi biçimleyicileri — saat dilimi her zaman Europe/Istanbul. */
import type { CaseSeverity, CaseSubject } from '@/lib/admin-trust/contract';
import type { Severity } from '@/components/ds/data';

const TZ = 'Europe/Istanbul';
const absFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
const numFmt = new Intl.NumberFormat('tr-TR');
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export const fmtNum = (n: number) => numFmt.format(n);
export const fmtAbs = (iso: string | null | undefined) => (iso ? absFmt.format(new Date(iso)) : '—');

export function fmtRel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return 'az önce';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return absFmt.format(new Date(iso));
}

export const toDsSeverity = (s: CaseSeverity): Severity =>
  s === 'CRITICAL' ? 'critical' : s === 'HIGH' ? 'high' : s === 'MEDIUM' ? 'medium' : 'low';

export function subjectText(s: CaseSubject): { title: string; sub: string | null } {
  switch (s.kind) {
    case 'user':
      return { title: s.name || s.email || 'Adsız hesap', sub: s.name && s.email ? s.email : null };
    case 'identifier':
      return { title: s.value, sub: 'Giriş denemesi hedefi' };
    case 'ip':
      return { title: s.value, sub: 'IP adresi' };
    default:
      return { title: 'Özne yok', sub: null };
  }
}

export const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Müşteri',
  DEALER: 'Bayi',
  STAFF: 'Personel',
  ADMIN: 'Yönetici',
};

export const LEDGER_SOURCE_LABEL: Record<string, string> = {
  feedback: 'Geri bildirim',
  review: 'Yorum',
  consumption: 'Tüketim',
  dealer_passive: 'Bayi puanı',
  game: 'Oyun',
  tournament: 'Turnuva',
  quest: 'Görev',
  badge: 'Rozet',
  referral: 'Davet',
  streak: 'Seri',
  spin: 'Çark',
  surprise: 'Sürpriz',
  squad: 'Takım',
  remedy: 'Telafi',
  seasonal: 'Sezon',
  shop: 'Mağaza',
  reward: 'Ödül',
  gift: 'Hediye',
  donation: 'Bağış',
  admin_adjust: 'Yönetici düzeltmesi',
  opening_balance: 'Açılış bakiyesi',
};
export const ledgerSourceLabel = (s: string) => LEDGER_SOURCE_LABEL[s] ?? s;
export const LEDGER_STATUS_LABEL: Record<string, string> = {
  posted: 'Yansıdı',
  pending: 'Bekliyor',
  void: 'Geçersiz (gölge yasak)',
  reversed: 'Geri alındı',
};
