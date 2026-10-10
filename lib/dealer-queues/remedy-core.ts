/**
 * Telafi onayı kuyruğu — saf sözleşme (istemci + sunucu ortak; DB'ye dokunmaz).
 *
 * Telafi yaşam döngüsünün bayi tarafı dört görünümde izlenir (denetim B8):
 *   Onay bekleyen (awaiting_dealer_approval) → Müşteride (pending) → Kabul edildi (accepted)
 *   → Kapalı (rejected | expired).
 */
import { DAY_MS, HOUR_MS } from './time';

export const REMEDY_VIEWS = ['awaiting', 'sent', 'accepted', 'closed'] as const;
export type RemedyView = (typeof REMEDY_VIEWS)[number];

export const REMEDY_VIEW_STATUSES: Readonly<Record<RemedyView, readonly string[]>> = {
  awaiting: ['awaiting_dealer_approval'],
  sent: ['pending'],
  accepted: ['accepted'],
  closed: ['rejected', 'expired'],
};

export function isRemedyView(v: unknown): v is RemedyView {
  return typeof v === 'string' && (REMEDY_VIEWS as readonly string[]).includes(v);
}

export function normalizeRemedyView(v: unknown): RemedyView {
  return isRemedyView(v) ? v : 'awaiting';
}

export function viewOfStatus(status: string): RemedyView {
  if (status === 'awaiting_dealer_approval') return 'awaiting';
  if (status === 'pending') return 'sent';
  if (status === 'accepted') return 'accepted';
  return 'closed';
}

export const REMEDY_SOURCE_FILTERS = ['all', 'qr', 'consumption'] as const;
export type RemedySourceFilter = (typeof REMEDY_SOURCE_FILTERS)[number];

export function normalizeRemedySource(v: unknown): RemedySourceFilter {
  return typeof v === 'string' && (REMEDY_SOURCE_FILTERS as readonly string[]).includes(v) ? (v as RemedySourceFilter) : 'all';
}

export function normalizeSearch(v: unknown, max = 80): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Red nedenleri (otomasyon eşiğinin öğrenmesi + bayinin kendi raporu için). */
export const REMEDY_REJECT_REASONS = ['false_positive', 'already_resolved', 'abuse', 'duplicate', 'other'] as const;
export type RemedyRejectReason = (typeof REMEDY_REJECT_REASONS)[number];

export function isRejectReason(v: unknown): v is RemedyRejectReason {
  return typeof v === 'string' && (REMEDY_REJECT_REASONS as readonly string[]).includes(v);
}

/** Yanlışlıkla reddedilen taslak bu süre içinde geri alınabilir. */
export const REMEDY_RESTORE_WINDOW_MS = 10 * 60 * 1000;

/** Müşteride bekleyen teklif bu kadar gün sonra süresi dolmuş sayılır (günlük bakım işi). */
export const REMEDY_PENDING_TTL_DAYS = 30;

/** Onay bekleyen taslak bu süreyi geçince "gecikiyor" sayılır (hatırlatma + vurgu). */
export const REMEDY_AWAITING_WARN_MS = 24 * HOUR_MS;
export const REMEDY_AWAITING_DANGER_MS = 3 * DAY_MS;

export type WaitTone = 'neutral' | 'warning' | 'danger';

/** Onay bekleme süresinin tonu (yalnız onay bekleyenler için anlamlı). */
export function awaitingWaitTone(createdAt: Date | string, now: Date = new Date()): WaitTone {
  const age = now.getTime() - new Date(createdAt).getTime();
  if (age >= REMEDY_AWAITING_DANGER_MS) return 'danger';
  if (age >= REMEDY_AWAITING_WARN_MS) return 'warning';
  return 'neutral';
}

export type RemedyTrigger = 'low_rating' | 'high_churn' | 'churn_intervention';

/** Zaman çizelgesindeki `created` olayının meta'sından otomasyon tetik nedeni. */
export function triggerFromMeta(meta: unknown): RemedyTrigger | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const t = (meta as Record<string, unknown>).trigger;
  if (t === 'low_rating' || t === 'high_churn') return t;
  if (t === 'churn' || t === 'churn_intervention') return 'churn_intervention';
  return null;
}

export function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v ? v : null;
}

export function readMetaNumber(meta: unknown, key: string): number | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** "Ayşe Kaya" → "AK"; boş → "?". */
export function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/** Metin özeti (tek satır), `max` karakteri aşarsa "…" ile kırpılır. */
export function excerpt(text: string | null | undefined, max = 160): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Toplu işlem sınırı (tek istekte). */
export const REMEDY_BULK_MAX = 50;

/** Sayfa boyutu (imleçli). */
export const REMEDY_PAGE_SIZE = 20;
