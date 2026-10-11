'use client';

import { Archive, CalendarClock, CircleSlash, Eye, EyeOff, PauseCircle, Radio, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data';
import type { Tone } from '@/components/states';
import {
  CAMPAIGN_TYPE_LABEL,
  STATUS_LABEL,
  type CalendarStatus,
  type CampaignView,
  type ConceptView,
} from '@/lib/campaigns-calendar/contract';

export const STATUS_TONE: Record<CalendarStatus, Tone> = {
  live: 'success',
  shadowed: 'warning',
  exhausted: 'warning',
  scheduled: 'info',
  paused: 'neutral',
  ended: 'neutral',
  archived: 'neutral',
};

const STATUS_ICON: Record<CalendarStatus, LucideIcon> = {
  live: Radio,
  shadowed: EyeOff,
  exhausted: Wallet,
  scheduled: CalendarClock,
  paused: PauseCircle,
  ended: CircleSlash,
  archived: Archive,
};

export const STATUS_HINT: Record<CalendarStatus, string> = {
  live: 'Şu an uygulanıyor',
  shadowed: 'Penceresi açık ama başka bir kayıt kazanıyor; şu an uygulanmıyor',
  exhausted: 'Puan bütçesi doldu; seçici artık bu kampanyayı atlıyor',
  scheduled: 'Başlangıcı gelecekte',
  paused: 'Elle duraklatıldı; penceresi açık olsa da uygulanmaz',
  ended: 'Penceresi kapandı',
  archived: 'Arşivlendi; hiçbir yerde uygulanmaz',
};

export function ItemStatus({ status, targeted, size = 'sm' }: { status: CalendarStatus; targeted?: boolean; size?: 'sm' | 'md' }) {
  const label = status === 'live' && targeted ? 'Canlı · hedefli' : STATUS_LABEL[status];
  return (
    <StatusBadge
      label={label}
      tone={STATUS_TONE[status]}
      icon={status === 'live' && targeted ? Eye : STATUS_ICON[status]}
      size={size}
      srPrefix="Durum"
      title={STATUS_HINT[status]}
    />
  );
}

const nf = new Intl.NumberFormat('tr-TR');
const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : nf.format(Math.round(n)));
export const fmtMult = (n: number) => `${nf1.format(n)}×`;

/** "2× · +50 puan" — etkinin kısa özeti (seçicinin uyguladığı kırpılmış değerler). */
export function campaignEffect(c: Pick<CampaignView, 'effectiveMultiplier' | 'effectiveBonus' | 'challenge'>): string {
  const parts: string[] = [];
  if (c.effectiveMultiplier > 1) parts.push(fmtMult(c.effectiveMultiplier));
  if (c.effectiveBonus > 0) parts.push(`+${fmtInt(c.effectiveBonus)} puan`);
  if (c.challenge) parts.push('görev');
  return parts.length ? parts.join(' · ') : 'Etkisiz';
}

export function campaignAudience(c: Pick<CampaignView, 'type' | 'minLevel'>): string {
  const t = CAMPAIGN_TYPE_LABEL[c.type] ?? c.type;
  return c.minLevel ? `${t} · seviye ≥ ${c.minLevel}` : t;
}

export function conceptLayers(k: Pick<ConceptView, 'themePresetId' | 'backgroundEffect' | 'bannerText'>): string {
  const parts: string[] = [];
  if (k.themePresetId) parts.push('palet');
  if (k.backgroundEffect) parts.push('arka plan');
  if (k.bannerText) parts.push('banner');
  return parts.join(' · ') || '—';
}

/** Basit tek satırlık alan hatası. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="qx-caption mt-1 text-danger" role="alert">
      {message}
    </p>
  );
}
