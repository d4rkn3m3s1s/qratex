/**
 * URL → filtre çözümleyicileri. SAF ve 'use client' DEĞİL: sunucu sayfası (ön yükleme) ile
 * istemci sekmeleri aynı kuralı kullanır; böylece SSR verisi istemci sorgu anahtarıyla eşleşir.
 */
import { isSourceGroup, type SourceGroup } from '@/lib/customer-wallet/activity/sources';
import type { ReviewFilter } from '@/lib/customer-wallet/activity/visits';
import { isSummaryRange, type SummaryRange } from '@/lib/customer-wallet/periods';

type Get = (key: string) => string | null;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type PointsFilterValue = { dir: 'all' | 'earn' | 'spend'; group: SourceGroup | null };
export type VisitsFilterValue = { review: ReviewFilter; q: string; dealer: string | null };

export function readPointsFilter(get: Get): PointsFilterValue {
  const d = get('dir');
  const g = get('src');
  return { dir: d === 'earn' || d === 'spend' ? d : 'all', group: isSourceGroup(g) ? g : null };
}

/** `review` öncelikli; eski derin bağlantı `?hasReview=false|true` de anlaşılır (denetim B3). */
export function readVisitsFilter(get: Get): VisitsFilterValue {
  const r = get('review');
  const legacy = get('hasReview');
  const review: ReviewFilter =
    r === 'pending' || r === 'reviewed' ? r : legacy === 'false' ? 'pending' : legacy === 'true' ? 'reviewed' : 'all';
  const dealer = get('dealer');
  return { review, q: (get('q') ?? '').trim().slice(0, 80), dealer: dealer && ID_RE.test(dealer) ? dealer : null };
}

export function readRange(get: Get): SummaryRange {
  const r = get('range');
  return isSummaryRange(r) ? r : 'month';
}

export const ACTIVITY_TABS = ['points', 'visits', 'summary'] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export function readActivityTab(get: Get, summaryEnabled: boolean): ActivityTab {
  const t = get('tab');
  if (t === 'visits') return 'visits';
  if (t === 'summary' && summaryEnabled) return 'summary';
  return 'points';
}

export const DONATE_TABS = ['projects', 'community', 'history'] as const;
export type DonateTab = (typeof DONATE_TABS)[number];

/** Eski pano derin bağlantısı `?tab=leaderboard` ve `activity` → Topluluk (denetim B8). */
export function readDonateTab(get: Get): DonateTab {
  const t = get('tab');
  if (t === 'community' || t === 'leaderboard' || t === 'activity') return 'community';
  if (t === 'history') return 'history';
  return 'projects';
}

/** Arama parametrelerini (Next `searchParams` nesnesi) tek değerli okuyucuya çevirir. */
export function getterFrom(sp: Record<string, string | string[] | undefined>): Get {
  return (key) => {
    const v = sp[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === 'string' ? v : null;
  };
}
