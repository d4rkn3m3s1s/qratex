'use client';

import { useCallback } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { insightsApiSearch, insightsSearchString } from '@/lib/dealer-insights/params';
import {
  INSIGHTS_QUERY_KEY,
  insightsQueryKey,
  type EvidencePage,
  type InsightsData,
  type InsightsQuery,
  type NarrativeView,
  type RecPriority,
} from '@/lib/dealer-insights/types';

/** Zarf v2 hatası — `QueryState.classifyError` `status`/`code` alanlarını okur. */
export class InsightsFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly retryAfterSec: number | null;
  constructor(message: string, status: number, code: string | null, retryable = false, retryAfterSec: number | null = null) {
    super(message);
    this.name = 'InsightsFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSec = retryAfterSec;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

/** `!res.ok` ya da `success:false` → kodlu hata ("200 + sıfırlar" yok). */
export async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    const ra = Number(res.headers.get('Retry-After'));
    throw new InsightsFetchError(
      json?.error || `HTTP ${res.status}`,
      res.status,
      json?.code ?? null,
      !!json?.retryable,
      Number.isFinite(ra) && ra > 0 ? ra : null
    );
  }
  return json.data as T;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  return readEnvelope<T>(res);
}

function newIdempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function postJson<T>(url: string, body: unknown, opts: { idempotent?: boolean } = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.idempotent ? { 'Idempotency-Key': newIdempotencyKey() } : {}),
    },
    body: JSON.stringify(body),
  });
  return readEnvelope<T>(res);
}

const noRetryOn4xx = (count: number, error: unknown) => {
  if (error instanceof InsightsFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
};

const apiSearch = insightsApiSearch;

/**
 * Ana veri. İlk değer SSR'dan (HydrationBoundary) gelir. Dönem değişiminde önceki veri
 * gösterilmeye devam eder (`keepPreviousData`) — tam sayfa spinner'a dönülmez; yarış koşulu
 * React Query anahtarıyla kapanır (eski sayfada geç dönen yanıt yanlış dönemi basabiliyordu).
 */
export function useInsights(q: InsightsQuery, lang: 'tr' | 'en') {
  const search = apiSearch(q, lang);
  return useQuery({
    queryKey: insightsQueryKey(search),
    queryFn: ({ signal }) => getJson<InsightsData>(`/api/dealer/insights${search ? `?${search}` : ''}`, signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: noRetryOn4xx,
  });
}

/** Sunucu önbelleğini atlayarak tazele ("Yenile" ve yazma sonrası). */
export function useRefreshInsights(q: InsightsQuery, lang: 'tr' | 'en') {
  const qc = useQueryClient();
  return useCallback(async () => {
    const search = apiSearch(q, lang);
    const fresh = await getJson<InsightsData>(`/api/dealer/insights?${apiSearch(q, lang, { fresh: '1' })}`);
    qc.setQueryData(insightsQueryKey(search), fresh);
    // Diğer dönemlerin önbelleği eskidi say (düzeltme/aksiyon hepsini etkileyebilir).
    void qc.invalidateQueries({ queryKey: [INSIGHTS_QUERY_KEY], refetchType: 'none' });
    return fresh;
  }, [qc, q, lang]);
}

export function useGenerateNarrative(q: InsightsQuery, lang: 'tr' | 'en') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regenerate: boolean) =>
      postJson<NarrativeView>('/api/dealer/insights/narrative', {
        ...(q.preset === 'custom' ? { from: q.range.from, to: q.range.to } : { period: q.preset }),
        compare: q.compare,
        ...(q.location ? { location: q.location } : {}),
        lang,
        regenerate,
      }),
    onSuccess: (narrative) => {
      const key = insightsQueryKey(apiSearch(q, lang));
      qc.setQueryData<InsightsData>(key, (old) => (old ? { ...old, narrative } : old));
    },
  });
}

export interface AddActionInput {
  text: string;
  priority: RecPriority;
  assignedToId: string | null;
  dueDay: string | null;
  feedbackIds: string[];
  recId: string;
}

export function useAddAction(q: InsightsQuery, lang: 'tr' | 'en') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recId: _recId, ...body }: AddActionInput) =>
      postJson<{ created: boolean; id: string }>('/api/dealer/insights/actions', body, { idempotent: true }),
    onSuccess: (res, input) => {
      const key = insightsQueryKey(apiSearch(q, lang));
      qc.setQueryData<InsightsData>(key, (old) =>
        old
          ? {
              ...old,
              recommendations: old.recommendations.map((r) => (r.id === input.recId ? { ...r, actionItemId: res.id } : r)),
            }
          : old
      );
    },
  });
}

export type EvidenceTarget =
  | { kind: 'theme'; key: string; label: string }
  | { kind: 'rec'; key: string; label: string }
  | { kind: 'entity'; key: string; label: string };

export function useEvidence(q: InsightsQuery, target: EvidenceTarget | null) {
  const param = target ? (target.kind === 'theme' ? 'theme' : target.kind === 'rec' ? 'rec' : 'entity') : null;
  const base = target && param ? insightsSearchString(q, { [param]: target.key }) : '';
  return useInfiniteQuery({
    queryKey: ['dealer-insights-evidence', base],
    enabled: !!target,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getJson<EvidencePage>(
        `/api/dealer/insights/evidence?${base}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        signal
      ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    retry: noRetryOn4xx,
  });
}

export function useCorrectSentiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { feedbackId: string; sentiment: 'positive' | 'neutral' | 'negative' }) =>
      postJson<{ changed: boolean; sentiment: string }>('/api/dealer/insights/corrections', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealer-insights-evidence'] });
    },
  });
}
