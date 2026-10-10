'use client';

/**
 * Hareketler + Bağış istemci veri katmanı: zarf v2 okuyucu, sorgu anahtarları, fetch'ler.
 * Hata kodlu fırlatılır → `QueryState` (moduleDisabled / forbidden / offline) doğru ekranı seçer;
 * "200 + sıfırlar" yok.
 */
import type { PointsEntry, PointsHistoryPage, PointsOverview } from '@/lib/customer-wallet/activity/points-history';
import type { ReviewFilter, ReviewRewardPreview, VisitItem, VisitStats } from '@/lib/customer-wallet/activity/visits';
import type { SpendSummary } from '@/lib/customer-wallet/activity/spend-summary';
import type { SummaryRange } from '@/lib/customer-wallet/periods';
import type { SourceGroup } from '@/lib/customer-wallet/activity/sources';
import type {
  DonateOverview,
  DonationCommunity,
  DonationReceipt,
  MakeDonationResult,
} from '@/lib/customer-wallet/donate/service';

export class MovesFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly details: unknown;
  constructor(message: string, status: number, code: string | null, retryable = false, details: unknown = null) {
    super(message);
    this.name = 'MovesFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean; details?: unknown };

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new MovesFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, !!json?.retryable, json?.details ?? null);
  }
  return json.data as T;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  return readEnvelope<T>(res);
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** 4xx (429 hariç) yeniden denenmez; ağ/5xx en fazla 2 kez. */
export function shouldRetry(count: number, error: unknown): boolean {
  if (error instanceof MovesFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
}

// ── Puan defteri ──
export type PointsFilter = { dir: 'all' | 'earn' | 'spend'; group: SourceGroup | null };
export type PointsPage = PointsHistoryPage & { overview: PointsOverview | null };
export const pointsKey = (f: PointsFilter) => ['wallet-activity', 'points', f.dir, f.group ?? 'all'] as const;
export const fetchPointsPage = (f: PointsFilter, cursor: string | null, signal?: AbortSignal) =>
  getJson<PointsPage>(`/api/customer/wallet/activity/points${qs({ cursor, dir: f.dir === 'all' ? null : f.dir, group: f.group })}`, signal);
export const fetchPointsEntry = (id: string, signal?: AbortSignal) =>
  getJson<{ entry: PointsEntry }>(`/api/customer/wallet/activity/points/${encodeURIComponent(id)}`, signal).then((d) => d.entry);

// ── Ziyaretler ──
export type VisitsFilter = { review: ReviewFilter; q: string; dealer: string | null };
export type VisitsPage = {
  items: VisitItem[];
  nextCursor: string | null;
  review: ReviewFilter;
  stats: VisitStats | null;
  reward: ReviewRewardPreview | null;
  pendingShelf: VisitItem[] | null;
};
export const visitsKey = (f: VisitsFilter) => ['wallet-activity', 'visits', f.review, f.q, f.dealer ?? ''] as const;
export const fetchVisitsPage = (f: VisitsFilter, cursor: string | null, signal?: AbortSignal) =>
  getJson<VisitsPage>(
    `/api/customer/wallet/activity/visits${qs({ cursor, review: f.review === 'all' ? null : f.review, q: f.q || null, dealer: f.dealer })}`,
    signal,
  );

// ── Özet ──
export const summaryKey = (range: SummaryRange) => ['wallet-activity', 'summary', range] as const;
export const fetchSummary = (range: SummaryRange, signal?: AbortSignal) =>
  getJson<SpendSummary>(`/api/customer/wallet/activity/summary${qs({ range })}`, signal);
export const exportUrl = (range: SummaryRange, lang: 'tr' | 'en') => `/api/customer/wallet/activity/export${qs({ range, lang })}`;

// ── Bağış ──
export const DONATE_KEY = ['wallet-donate', 'overview'] as const;
export const COMMUNITY_KEY = ['wallet-donate', 'community'] as const;
export const HISTORY_KEY = ['wallet-donate', 'history'] as const;
export const receiptKey = (id: string) => ['wallet-donate', 'receipt', id] as const;
export const fetchDonate = (signal?: AbortSignal) => getJson<DonateOverview>('/api/customer/wallet/donate', signal);
export const fetchCommunity = (signal?: AbortSignal) => getJson<DonationCommunity>('/api/customer/wallet/donate/community', signal);
export const fetchHistory = (cursor: string | null, signal?: AbortSignal) =>
  getJson<{ items: DonationReceipt[]; nextCursor: string | null }>(`/api/customer/wallet/donate/history${qs({ cursor })}`, signal);
export const fetchReceipt = (id: string, signal?: AbortSignal) =>
  getJson<{ receipt: DonationReceipt }>(`/api/customer/wallet/donate/history/${encodeURIComponent(id)}`, signal).then((d) => d.receipt);

export async function postDonation(body: {
  projectId: string;
  points: number;
  message: string | null;
  isPublic: boolean;
  requestKey: string;
}): Promise<MakeDonationResult> {
  const res = await fetch('/api/customer/wallet/donate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return readEnvelope<MakeDonationResult>(res);
}

export function newRequestKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
  }
}
