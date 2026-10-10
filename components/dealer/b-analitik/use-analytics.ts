'use client';

/**
 * b-analitik veri kancaları. İlk değer SSR'dan (`HydrationBoundary`) gelir; süzgeç değişince
 * önceki veri soluk gösterilir (`keepPreviousData`, rapor B-6: yarış koşulu ve "eski veri yeni
 * etiketle" yok — React Query anahtarı dönemi taşır, eski istek iptal edilir). "Yenile" önbelleği
 * gerçekten atlar (`fresh=1`).
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { analyticsSearchString, parseAnalyticsSearch, parseHeatmapSearch } from '@/lib/dealer-analytics/params';
import {
  heatmapQueryKey,
  overviewQueryKey,
  type ActivityHeatmap,
  type AnalyticsOverview,
  type AnalyticsQuery,
  type HeatmapQuery,
} from '@/lib/dealer-analytics/types';

/** Zarf v2 hatası — `QueryState.classifyError` `status`/`code` alanlarını okur. */
export class AnalyticsFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string | null, retryable = false) {
    super(message);
    this.name = 'AnalyticsFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new AnalyticsFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, !!json?.retryable);
  }
  return json.data as T;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  return readEnvelope<T>(res);
}

export function fetchOverview(q: AnalyticsQuery, opts: { fresh?: boolean; signal?: AbortSignal } = {}) {
  const qs = analyticsSearchString(q, { fresh: opts.fresh ? '1' : null });
  return getJson<AnalyticsOverview>(`/api/dealer/analytics${qs ? `?${qs}` : ''}`, opts.signal);
}

export function fetchHeatmap(q: HeatmapQuery, opts: { fresh?: boolean; signal?: AbortSignal } = {}) {
  const qs = analyticsSearchString(q, { metric: q.metric !== 'feedback' ? q.metric : null, fresh: opts.fresh ? '1' : null });
  return getJson<ActivityHeatmap>(`/api/dealer/heatmap${qs ? `?${qs}` : ''}`, opts.signal);
}

function retry(count: number, error: unknown): boolean {
  if (error instanceof AnalyticsFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
}

/** URL → sorgu (sunucu sayfası aynı fonksiyonla ön-yükler). */
export function useAnalyticsQueryFromUrl(): AnalyticsQuery {
  const sp = useSearchParams();
  const key = sp?.toString() ?? '';
  return useMemo(() => parseAnalyticsSearch(new URLSearchParams(key)), [key]);
}

export function useHeatmapQueryFromUrl(): HeatmapQuery {
  const sp = useSearchParams();
  const key = sp?.toString() ?? '';
  return useMemo(() => parseHeatmapSearch(new URLSearchParams(key)), [key]);
}

export function useAnalyticsOverview(q: AnalyticsQuery) {
  return useQuery({
    queryKey: overviewQueryKey(q),
    queryFn: ({ signal }) => fetchOverview(q, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

export function useActivityHeatmap(q: HeatmapQuery) {
  return useQuery({
    queryKey: heatmapQueryKey(q),
    queryFn: ({ signal }) => fetchHeatmap(q, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

/** "Yenile": önbelleği atlayan istek; sonuç aynı anahtara yazılır. Hata görünür döner. */
export function useFreshRefresh<T>(queryKey: readonly unknown[], load: () => Promise<T>) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const data = await load();
      qc.setQueryData(queryKey, data);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }, [qc, queryKey, load]);
  return { refresh, pending, error };
}

