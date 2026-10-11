'use client';

import type { JobsView, ObsWindow, ObservabilitySnapshot, RunJobBody, RunJobResult } from '@/lib/observability/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) aynı nesneyi okur. */
export class ObsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'ObsApiError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string };

async function call<T>(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new ObsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* HTML/boş gövde (ör. 504) → aşağıda anlaşılır mesaj */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    const fallback = res.status === 504 ? 'Sunucu zamanında yanıt vermedi.' : 'İstek tamamlanamadı.';
    throw new ObsApiError(res.status || 500, env.error || fallback, env.code ?? null);
  }
  return env.data as T;
}

export const obsKeys = {
  snapshot: (w: ObsWindow) => ['admin', 'observability', w] as const,
  jobs: () => ['admin', 'jobs'] as const,
};

export function fetchSnapshot(w: ObsWindow, opts: { fresh?: boolean; signal?: AbortSignal } = {}) {
  return call<ObservabilitySnapshot>(`/api/admin/observability?window=${w}${opts.fresh ? '&fresh=1' : ''}`, { signal: opts.signal });
}

export function fetchJobs(signal?: AbortSignal) {
  return call<JobsView>('/api/admin/jobs', { signal });
}

export function runJob(body: RunJobBody) {
  return call<RunJobResult>('/api/admin/jobs/run', { method: 'POST', body: JSON.stringify(body) });
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
