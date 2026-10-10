'use client';

import { useCallback } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEALER_TODAY_QUERY_KEY,
  DEALER_WEEKLY_ARCHIVE_QUERY_KEY,
  DEALER_WEEKLY_QUERY_KEY,
  type DealerTodayData,
  type WeeklyArchivePage,
  type WeeklyNarrative,
  type WeeklyReport,
} from '@/lib/dealer-today/types';

/** Zarf v2 hatası — `QueryState.classifyError` `status`/`code` alanlarını okur. */
export class TodayFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string | null, retryable = false) {
    super(message);
    this.name = 'TodayFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

/** Zarf v2'yi okur; `!res.ok` ya da `success:false` → kodlu hata ("200 + sıfırlar" yok). */
export async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new TodayFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, !!json?.retryable);
  }
  return json.data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  return readEnvelope<T>(res);
}

async function sendJson<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readEnvelope<T>(res);
}

const noRetryOn4xx = (count: number, error: unknown) => {
  if (error instanceof TodayFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
};

/**
 * Bugün verisi. İlk değer SSR'dan (HydrationBoundary) gelir. Periyodik yoklama YOK:
 * sekmeye dönüşte ve yazma sonrası tazelenir; "Yenile" sunucu önbelleğini atlar.
 */
export function useDealerToday() {
  return useQuery({
    queryKey: DEALER_TODAY_QUERY_KEY,
    queryFn: () => getJson<DealerTodayData>('/api/dealer/today'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: noRetryOn4xx,
  });
}

/** Sunucu önbelleğini atlayarak tazele (Yenile düğmesi + yazma sonrası). */
export function useRefreshToday() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const fresh = await getJson<DealerTodayData>('/api/dealer/today?fresh=1');
    qc.setQueryData(DEALER_TODAY_QUERY_KEY, fresh);
    return fresh;
  }, [qc]);
}

export function useWeeklyReport(week: string | null) {
  return useQuery({
    queryKey: DEALER_WEEKLY_QUERY_KEY(week),
    queryFn: () => getJson<WeeklyReport>(week ? `/api/dealer/today/weekly?week=${encodeURIComponent(week)}` : '/api/dealer/today/weekly'),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: noRetryOn4xx,
  });
}

export function useWeeklyArchive() {
  return useInfiniteQuery({
    queryKey: DEALER_WEEKLY_ARCHIVE_QUERY_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getJson<WeeklyArchivePage>(pageParam ? `/api/dealer/today/weekly/archive?before=${encodeURIComponent(pageParam)}` : '/api/dealer/today/weekly/archive'),
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 10 * 60_000,
    retry: noRetryOn4xx,
  });
}

export function useGenerateNarrative(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regenerate: boolean) => sendJson<WeeklyNarrative>('/api/dealer/today/weekly/narrative', 'POST', { week, regenerate }),
    onSuccess: (n) => {
      for (const key of [DEALER_WEEKLY_QUERY_KEY(week), DEALER_WEEKLY_QUERY_KEY(null)]) {
        qc.setQueryData<WeeklyReport>(key, (prev) => (prev && prev.week === n.week ? { ...prev, narrative: { text: n.text, generatedAt: n.generatedAt } } : prev));
      }
    },
  });
}

export function useAddSuggestion() {
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: (input: { feedbackId?: string; text: string; priority: string; dismiss?: boolean; source?: 'today' | 'weekly_brief' }) =>
      sendJson<{ id: string; status: string }>('/api/dealer/today/todos', 'POST', input),
    onSettled: () => {
      void refresh().catch(() => undefined);
    },
  });
}

export function useSetTodoStatus() {
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: (input: { id: string; status: 'done' | 'pending' }) =>
      sendJson<{ id: string; status: string }>(`/api/dealer/today/todos/${encodeURIComponent(input.id)}`, 'PATCH', { status: input.status }),
    // İyimser: tamamlanan satır listeden çıkar; hata olursa tazeleme geri getirir.
    onMutate: (input) => {
      if (input.status !== 'done') return;
      qc.setQueryData<DealerTodayData>(DEALER_TODAY_QUERY_KEY, (prev) =>
        prev
          ? {
              ...prev,
              todos: { ...prev.todos, open: prev.todos.open.filter((t) => t.id !== input.id), openTotal: Math.max(0, prev.todos.openTotal - 1) },
            }
          : prev
      );
    },
    onSettled: () => {
      void refresh().catch(() => undefined);
    },
  });
}
