import { formatMinor } from '@/lib/dealer/catalog/money';
import type { ProductStatsDto } from '@/lib/dealer/catalog/types';

/** Fiyat metni: null → "Fiyat yok", 0 → "Ücretsiz" (eski kart "0" basıyordu; Bulgu 5). */
export function priceLabel(minor: number | null): string {
  if (minor === null) return 'Fiyat yok';
  if (minor === 0) return 'Ücretsiz';
  return formatMinor(minor, 'tr');
}

export function ratingLabel(avg: number | null): string {
  return avg === null ? '—' : avg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Önceki 30 güne göre tüketim eğilimi (yalnız iki pencere de anlamlıysa). */
export function trend(stats: ProductStatsDto): { dir: 'up' | 'down' | 'flat'; text: string } | null {
  const { consumptions30: c, consumptionsPrev30: p } = stats;
  if (c === 0 && p === 0) return null;
  if (p === 0) return { dir: 'up', text: 'yeni hareket' };
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return { dir: 'flat', text: 'önceki 30 günle aynı' };
  return { dir: pct > 0 ? 'up' : 'down', text: `önceki 30 güne göre %${Math.abs(pct)} ${pct > 0 ? 'artış' : 'düşüş'}` };
}

const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
export function dayLabel(iso: string): string {
  return dtf.format(new Date(iso));
}
const wf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' });
export function weekLabel(ymd: string): string {
  return wf.format(new Date(`${ymd}T12:00:00+03:00`));
}
