'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { CUSTOMER_HOME_QUERY_KEY, type CustomerHomeData } from '@/lib/customer-home/types';

/** Zarf v2 hatası — `QueryState.classifyError` `status`/`code` alanlarını okur. */
export class HomeFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string | null, retryable = false) {
    super(message);
    this.name = 'HomeFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

/** Zarf v2 uçlarını okur; başarısızlıkta kodlu hata fırlatır ("200 + sıfırlar" yok). */
export async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new HomeFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, !!json?.retryable);
  }
  return json.data as T;
}

export async function fetchCustomerHome(): Promise<CustomerHomeData> {
  const res = await fetch('/api/customer/home', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return readEnvelope<CustomerHomeData>(res);
}

/**
 * Ana Sayfa verisi. İlk değer SSR'dan `HydrationBoundary` ile gelir (istek yok).
 * Periyodik yoklama YOK: puanı değiştiren eylemlerden sonra hedefli `invalidate`,
 * sekmeye dönüşte tazeleme.
 */
export function useCustomerHome() {
  return useQuery({
    queryKey: CUSTOMER_HOME_QUERY_KEY,
    queryFn: fetchCustomerHome,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => {
      if (error instanceof HomeFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
      return count < 2;
    },
  });
}

/** Önbellekteki Ana Sayfa verisini yerinde güncelle (sunucu yanıtıyla) + arkadan tazele. */
export function useHomeCache() {
  const qc = useQueryClient();
  const patch = useCallback(
    (fn: (prev: CustomerHomeData) => CustomerHomeData) => {
      qc.setQueryData<CustomerHomeData>(CUSTOMER_HOME_QUERY_KEY, (prev) => (prev ? fn(prev) : prev));
    },
    [qc]
  );
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: CUSTOMER_HOME_QUERY_KEY }), [qc]);
  return { patch, refresh };
}
