'use client';

import { useCallback } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COMMAND_QUERY_KEYS,
  type CommandEventsPage,
  type CommandOverview,
  type CommandRange,
  type EventActor,
  type HealthSection,
} from '@/lib/admin-command/types';

/** Zarf v2 hatası — `QueryState.classifyError` `status`/`code` okur. */
export class CommandFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'CommandFetchError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new CommandFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null);
  }
  return json.data as T;
}

const noRetryOn4xx = (count: number, error: unknown) => {
  if (error instanceof CommandFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
};

export type HealthPayload = HealthSection & { generatedAt: string };

/** Genel bakış: ilk değer SSR'dan; sekme görünürken 2 dk'da bir, gizliyken yoklama YOK. */
export function useCommandOverview(range: CommandRange) {
  return useQuery({
    queryKey: COMMAND_QUERY_KEYS.overview(range),
    queryFn: ({ signal }) => getJson<CommandOverview>(`/api/admin/command-center?section=overview&range=${range}`, signal),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: noRetryOn4xx,
  });
}

/** Sağlık: 30 sn'de bir (yalnız sekme görünürken). */
export function useCommandHealth() {
  return useQuery({
    queryKey: COMMAND_QUERY_KEYS.health,
    queryFn: ({ signal }) => getJson<HealthPayload>('/api/admin/command-center?section=health', signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: noRetryOn4xx,
  });
}

export function useCommandEvents(actor: EventActor) {
  return useInfiniteQuery({
    queryKey: COMMAND_QUERY_KEYS.events(actor),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getJson<CommandEventsPage>(
        `/api/admin/command-center/events?actor=${actor}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        signal
      ),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: noRetryOn4xx,
  });
}

/** "Yenile": sunucu önbelleğini atlayarak üç kaynağı tazeler. */
export function useRefreshCommand(range: CommandRange) {
  const qc = useQueryClient();
  return useCallback(async () => {
    const [overview, health] = await Promise.all([
      getJson<CommandOverview>(`/api/admin/command-center?section=overview&range=${range}&fresh=1`),
      getJson<HealthPayload>('/api/admin/command-center?section=health&fresh=1'),
    ]);
    qc.setQueryData(COMMAND_QUERY_KEYS.overview(range), overview);
    qc.setQueryData(COMMAND_QUERY_KEYS.health, health);
    await qc.invalidateQueries({ queryKey: ['admin-command', 'events'] });
  }, [qc, range]);
}
