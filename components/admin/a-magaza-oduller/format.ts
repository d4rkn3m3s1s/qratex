import { Archive, CalendarClock, CheckCircle2, CircleDashed, CircleOff, Clock, PackageCheck, TimerOff, XCircle } from 'lucide-react';
import { defineStatusMap } from '@/components/ds/data';
import type { Tone } from '@/components/states';
import type { CosmeticStatus, RedemptionStatus, RewardStatus, RewardType } from '@/lib/admin-store/contract';

const NUM = new Intl.NumberFormat('tr-TR');
const DATE = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
export const fmtPoints = (n: number | null | undefined) => (n == null ? '—' : `${NUM.format(n)} puan`);
export const fmtDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : '—');

/** Admin ve müşteri aynı dili konuşur: "Sınırsız" / "Tükendi" / "Az kaldı: 4" (B14). */
export function stockLabel(stock: number, low = 10): { label: string; tone: Tone } {
  if (stock < 0) return { label: 'Sınırsız', tone: 'neutral' };
  if (stock === 0) return { label: 'Tükendi', tone: 'danger' };
  if (stock < low) return { label: `Az kaldı: ${NUM.format(stock)}`, tone: 'warning' };
  return { label: NUM.format(stock), tone: 'neutral' };
}

export const REWARD_STATUS = defineStatusMap<RewardStatus>({
  published: { label: 'Yayında', tone: 'success', icon: CheckCircle2 },
  draft: { label: 'Taslak', tone: 'neutral', icon: CircleDashed },
  scheduled: { label: 'Zamanlanmış', tone: 'info', icon: CalendarClock },
  expired: { label: 'Süresi doldu', tone: 'warning', icon: TimerOff },
  archived: { label: 'Arşivde', tone: 'neutral', icon: Archive },
});

export const REDEMPTION_STATUS = defineStatusMap<RedemptionStatus>({
  pending: { label: 'Bekliyor', tone: 'warning', icon: Clock },
  fulfilled: { label: 'Teslim / kullanıldı', tone: 'success', icon: PackageCheck },
  cancelled: { label: 'İptal edildi', tone: 'neutral', icon: XCircle },
});

export const COSMETIC_STATUS = defineStatusMap<CosmeticStatus>({
  active: { label: 'Satışta', tone: 'success', icon: CheckCircle2 },
  inactive: { label: 'Satışta değil', tone: 'warning', icon: CircleOff },
  archived: { label: 'Arşivde', tone: 'neutral', icon: Archive },
});

export const REWARD_TYPE_TONE: Record<RewardType, Tone> = { digital: 'info', physical: 'warning', coupon: 'success' };

export function rulesSummary(r: { perUserLimit: number | null; validFrom: string | null; validUntil: string | null }): string[] {
  const out: string[] = [];
  if (r.perUserLimit) out.push(`Kişi başı ${NUM.format(r.perUserLimit)}`);
  if (r.validFrom) out.push(`${fmtDate(r.validFrom)} başlar`);
  if (r.validUntil) out.push(`${fmtDate(r.validUntil)} biter`);
  return out;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Ad',
  description: 'Açıklama',
  icon: 'İkon',
  cost: 'Maliyet',
  type: 'Tür',
  isActive: 'Durum',
  stock: 'Stok',
  perUserLimit: 'Kişi başı limit',
  validFrom: 'Başlangıç',
  validUntil: 'Bitiş',
  slug: 'Kısa ad',
  price: 'Fiyat',
  asset: 'Görünüm',
  rarity: 'Nadirlik',
};
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'açık' : 'kapalı';
  if (typeof v === 'number') return NUM.format(v);
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
