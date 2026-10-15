import {
  Bot, Building2, Coins, Database, FileText, FlaskConical, Gauge, Globe, LayoutDashboard, Mail, Package,
  Palette, Plug, Server, ShieldCheck, Smartphone, Store, User, Users, type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/states/tone';

export const AREA_META: Record<string, { label: string; icon: LucideIcon }> = {
  admin: { label: 'Yönetim paneli', icon: LayoutDashboard },
  bayi: { label: 'Bayi paneli', icon: Store },
  musteri: { label: 'Müşteri paneli', icon: User },
  personel: { label: 'Personel', icon: Users },
  public: { label: 'Herkese açık site', icon: Globe },
  api: { label: 'API', icon: Plug },
  veritabani: { label: 'Veritabanı', icon: Database },
  guvenlik: { label: 'Güvenlik', icon: ShieldCheck },
  performans: { label: 'Performans', icon: Gauge },
  tasarim: { label: 'Tasarım', icon: Palette },
  mobil: { label: 'Mobil', icon: Smartphone },
  altyapi: { label: 'Altyapı', icon: Server },
  ai: { label: 'Yapay zekâ', icon: Bot },
  ekonomi: { label: 'Puan ekonomisi', icon: Coins },
  mail: { label: 'E-posta', icon: Mail },
  test: { label: 'Test', icon: FlaskConical },
  dokuman: { label: 'Doküman', icon: FileText },
  diger: { label: 'Diğer', icon: Package },
};
export const areaMeta = (a?: string) => AREA_META[a ?? ''] ?? { label: a || 'Diğer', icon: Building2 };

export const TYPE_META: Record<string, { label: string; tone: Tone }> = {
  feature: { label: 'Yeni özellik', tone: 'brand' },
  improvement: { label: 'İyileştirme', tone: 'info' },
  fix: { label: 'Düzeltme', tone: 'warning' },
  security: { label: 'Güvenlik', tone: 'danger' },
  performance: { label: 'Performans', tone: 'success' },
  design: { label: 'Tasarım', tone: 'brand' },
  infra: { label: 'Altyapı', tone: 'neutral' },
  docs: { label: 'Doküman', tone: 'neutral' },
  refactor: { label: 'Yeniden düzenleme', tone: 'neutral' },
  removal: { label: 'Kaldırma', tone: 'danger' },
};
export const typeMeta = (t?: string) => TYPE_META[t ?? ''] ?? { label: t || 'Değişiklik', tone: 'neutral' as Tone };

const nf = new Intl.NumberFormat('tr-TR');
export const fmtInt = (n: number | null | undefined) => nf.format(n ?? 0);
export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  const x = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('tr-TR', opts);
}
export const monthKey = (d: string | null | undefined) => (d ? d.slice(0, 7) : '');

/** Dönem rengi: kategori paleti (açık/koyu tema token'ları), 9. dönemden sonra marka rengiyle döner. */
export function eraColor(i: number, alpha?: number): string {
  if (i < 0) return alpha == null ? 'hsl(var(--border-strong))' : `hsl(var(--border-strong) / ${alpha})`;
  const v = i % 9 === 8 ? '--primary' : `--category-${(i % 9) + 1}`;
  return alpha == null ? `hsl(var(${v}))` : `hsl(var(${v}) / ${alpha})`;
}

export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
