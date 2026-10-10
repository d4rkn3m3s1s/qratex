'use client';

/**
 * Kıyas + Etki veri kancaları. İlk değer SSR'dan (`HydrationBoundary`) gelir; süzgeç değişince
 * önceki veri soluk kalır (`keepPreviousData`). Hata zarfı (`{ ok:false, code, error }`) görünür
 * hataya çevrilir — "200 + sıfırlar" yok. "Yenile" önbelleği gerçekten atlar (`fresh=1`).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { benchmarkSearchString, parseBenchmarkSearch } from '@/lib/dealer-benchmark/params';
import { benchmarkQueryKey, type BenchmarkData, type BenchmarkQuery } from '@/lib/dealer-benchmark/types';
import { impactSearchString, parseImpactSearch } from '@/lib/dealer-impact/core';
import { IMPACT_QUERY_PREFIX, impactQueryKey, type ImpactData, type ImpactQuery, type ImpactSettings } from '@/lib/dealer-impact/types';
import type { PlaceCategory } from '@/lib/places/categories';

export class BkFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string | null, retryable = false) {
    super(message);
    this.name = 'BkFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string | { message?: string; code?: string }; code?: string; retryable?: boolean };

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    const err = json?.error;
    const message = typeof err === 'string' ? err : err?.message;
    const code = json?.code ?? (typeof err === 'object' ? err?.code : undefined) ?? null;
    throw new BkFetchError(message || `HTTP ${res.status}`, res.status, code, !!json?.retryable);
  }
  return json.data as T;
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  return readEnvelope<T>(res);
}

function retry(count: number, error: unknown): boolean {
  if (error instanceof BkFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
}

function withQs(base: string, qs: string, fresh?: boolean): string {
  const sp = new URLSearchParams(qs);
  if (fresh) sp.set('fresh', '1');
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// ───────────────────────────── Kıyas ─────────────────────────────

export function fetchBenchmark(q: BenchmarkQuery, opts: { fresh?: boolean; signal?: AbortSignal } = {}) {
  return send<BenchmarkData>(withQs('/api/dealer/analytics/benchmark', benchmarkSearchString(q), opts.fresh), { signal: opts.signal });
}

export function useBenchmarkQueryFromUrl(): BenchmarkQuery {
  const sp = useSearchParams();
  const key = sp?.toString() ?? '';
  return useMemo(() => parseBenchmarkSearch(new URLSearchParams(key)), [key]);
}

export function useBenchmark(q: BenchmarkQuery) {
  return useQuery({
    queryKey: benchmarkQueryKey(q),
    queryFn: ({ signal }) => fetchBenchmark(q, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: PlaceCategory | null) =>
      send<{ category: PlaceCategory | null }>('/api/dealer/analytics/benchmark/segment', { method: 'PATCH', body: JSON.stringify({ category }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-benchmark'] }),
  });
}

// ───────────────────────────── Etki ─────────────────────────────

export function fetchImpact(q: ImpactQuery, opts: { fresh?: boolean; signal?: AbortSignal } = {}) {
  return send<ImpactData>(withQs('/api/dealer/analytics/impact', impactSearchString(q), opts.fresh), { signal: opts.signal });
}

export function useImpactQueryFromUrl(): ImpactQuery {
  const sp = useSearchParams();
  const key = sp?.toString() ?? '';
  return useMemo(() => parseImpactSearch(new URLSearchParams(key)), [key]);
}

export function useImpact(q: ImpactQuery) {
  return useQuery({
    queryKey: impactQueryKey(q),
    queryFn: ({ signal }) => fetchImpact(q, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry,
  });
}

export type ImpactSettingsInput = Omit<ImpactSettings, 'updatedAt'>;

export function useSaveImpactSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImpactSettingsInput) =>
      send<ImpactSettings>('/api/dealer/analytics/impact/settings', { method: 'PUT', body: JSON.stringify(input) }),
    // Varsayımlar hesabı değiştirir → bütün dönemlerin sonucu tazelenir (sunucu otoriter).
    onSuccess: () => qc.invalidateQueries({ queryKey: [...IMPACT_QUERY_PREFIX] }),
  });
}

// ───────────────────────────── Ortak ─────────────────────────────

/** "Yenile": önbelleği atlayan istek; sonuç aynı anahtara yazılır. Hata görünür döner. */
export function useFreshRefresh<T>(queryKey: readonly unknown[], load: () => Promise<T>) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      qc.setQueryData(queryKey, await load());
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }, [qc, queryKey, load]);
  return { refresh, pending, error };
}
