'use client';

/**
 * a-analitik veri kancaları. Her sekme kendi bölüm ucunu ve kendi React Query anahtarını kullanır
 * (rapor B-11: "biriken sections" listesi yok). İlk sekme SSR'dan gelir (HydrationBoundary).
 * Süzgeç değişince eski veri soluk kalır (`keepPreviousData`), ekran "isFetching" ile işaretlenir
 * (B-8: eski veri yeni etiketle sessizce durmaz). "Yenile" önbelleği gerçekten atlar (`fresh=1`).
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminAnalyticsSearchString, adminQueryCacheKey, parseAdminAnalyticsSearch } from '@/lib/admin-analytics/params';
import { sectionQueryKey, type AdminAnalyticsQuery, type AdminAnalyticsSection, type SectionData } from '@/lib/admin-analytics/types';

/** Zarf v2 hatası — `QueryState` `status`/`code` alanlarını okur (403 → yetkisiz, MODULE_DISABLED). */
export class AdminAnalyticsError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly requestId: string | null;
  constructor(message: string, status: number, code: string | null, retryable = false, requestId: string | null = null) {
    super(message);
    this.name = 'AdminAnalyticsError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean; requestId?: string };

export async function fetchSection<S extends AdminAnalyticsSection>(
  section: S,
  q: AdminAnalyticsQuery,
  opts: { fresh?: boolean; signal?: AbortSignal } = {},
): Promise<SectionData[S]> {
  const qs = adminAnalyticsSearchString(q, { fresh: opts.fresh ? '1' : null });
  const res = await fetch(`/api/admin/analytics/${section}${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  // 401/403'te HTML ya da farklı şekil dönebilir: JSON okunamazsa da anlamlı hata (B-10).
  const json = (await res.json().catch(() => null)) as Envelope<SectionData[S]> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new AdminAnalyticsError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, !!json?.retryable, json?.requestId ?? res.headers.get('x-request-id'));
  }
  return json.data as SectionData[S];
}

function retry(count: number, error: unknown): boolean {
  if (error instanceof AdminAnalyticsError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
}

export function useAdminQueryFromUrl(): AdminAnalyticsQuery {
  const sp = useSearchParams();
  const key = sp?.toString() ?? '';
  return useMemo(() => parseAdminAnalyticsSearch(new URLSearchParams(key)), [key]);
}

export function useSection<S extends AdminAnalyticsSection>(section: S, q: AdminAnalyticsQuery, enabled = true) {
  return useQuery({
    queryKey: sectionQueryKey(section, adminQueryCacheKey(q)),
    queryFn: ({ signal }) => fetchSection(section, q, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry,
    enabled,
  });
}

/** Sekme üzerine gelince/odaklanınca ön-yükleme. */
export function usePrefetchSection(q: AdminAnalyticsQuery) {
  const qc = useQueryClient();
  return useCallback(
    (section: AdminAnalyticsSection) => {
      void qc.prefetchQuery({
        queryKey: sectionQueryKey(section, adminQueryCacheKey(q)),
        queryFn: ({ signal }) => fetchSection(section, q, { signal }),
        staleTime: 60_000,
      });
    },
    [qc, q],
  );
}

/** "Yenile": önbelleği atlayan istek; sonuç aynı anahtara yazılır, hata görünür döner. */
export function useFreshRefresh(section: AdminAnalyticsSection, q: AdminAnalyticsQuery) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const data = await fetchSection(section, q, { fresh: true });
      qc.setQueryData(sectionQueryKey(section, adminQueryCacheKey(q)), data);
      // Genel bakış diğer bölümleri de taze hesaplar; onların istemci önbelleğini bayatlat.
      if (section === 'overview') {
        void qc.invalidateQueries({ queryKey: sectionQueryKey('dealers', adminQueryCacheKey(q)) });
        void qc.invalidateQueries({ queryKey: sectionQueryKey('root-cause', adminQueryCacheKey(q)) });
      }
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }, [qc, q, section]);
  return { refresh, pending, error };
}
