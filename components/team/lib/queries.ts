'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qs, teamFetch } from './api';
import type {
  InitiativeDto,
  SavedView,
  TaskDetailPayload,
  TaskList,
  TeamMeta,
  TeamSummary,
  TeamTag,
} from './types';

export const API = '/api/admin/team';

/** Canlı güncelleme: odakta ve görünürken dakikada bir (denetim #76/#100). */
const LIVE = { refetchOnWindowFocus: true, refetchInterval: 60_000, refetchIntervalInBackground: false } as const;

export type TaskQuery = {
  view: 'board' | 'mine' | 'archive' | 'review';
  weekKey?: string;
  department?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  tag?: string;
  q?: string;
  mine?: string;
  sort?: string;
};

export const teamKeys = {
  all: ['team'] as const,
  meta: ['team', 'meta'] as const,
  tasks: (p: TaskQuery) => ['team', 'tasks', p] as const,
  summary: (week: string, dept: string | undefined) => ['team', 'summary', week, dept ?? ''] as const,
  task: (id: string) => ['team', 'task', id] as const,
  tags: ['team', 'tags'] as const,
  views: ['team', 'views'] as const,
  initiatives: (archived: boolean) => ['team', 'initiatives', archived] as const,
  initiative: (id: string) => ['team', 'initiative', id] as const,
};

export function useTeamMeta(initial?: TeamMeta) {
  return useQuery({
    queryKey: teamKeys.meta,
    queryFn: () => teamFetch<TeamMeta>(`${API}/departments`),
    initialData: initial,
    staleTime: 60_000,
  });
}

export function useTasks(p: TaskQuery, enabled = true) {
  return useQuery({
    queryKey: teamKeys.tasks(p),
    queryFn: () => teamFetch<TaskList>(`${API}/tasks${qs(p)}`),
    placeholderData: keepPreviousData,
    enabled,
    ...LIVE,
  });
}

export function useSummary(weekKey: string, department?: string) {
  return useQuery({
    queryKey: teamKeys.summary(weekKey, department),
    queryFn: () => teamFetch<TeamSummary>(`${API}/summary${qs({ weekKey, department })}`),
    placeholderData: keepPreviousData,
    ...LIVE,
  });
}

export function useTaskDetail(id: string | null) {
  return useQuery({
    queryKey: teamKeys.task(id ?? ''),
    queryFn: () => teamFetch<TaskDetailPayload>(`${API}/tasks/${encodeURIComponent(id!)}`),
    enabled: !!id,
    retry: (count, err) => !(err && typeof err === 'object' && 'status' in err && [403, 404].includes((err as { status: number }).status)) && count < 2,
    refetchOnWindowFocus: true,
  });
}

export function useTags() {
  return useQuery({ queryKey: teamKeys.tags, queryFn: () => teamFetch<{ items: TeamTag[] }>(`${API}/tags`), staleTime: 5 * 60_000 });
}

export function useViews() {
  return useQuery({ queryKey: teamKeys.views, queryFn: () => teamFetch<{ items: SavedView[] }>(`${API}/views`), staleTime: 60_000 });
}

export function useInitiatives(archived = false) {
  return useQuery({
    queryKey: teamKeys.initiatives(archived),
    queryFn: () => teamFetch<{ items: InitiativeDto[] }>(`${API}/initiatives${qs({ archived: archived ? '1' : undefined })}`),
    ...LIVE,
  });
}

export function useCursorList<T>(key: readonly unknown[], url: (cursor: string | null) => string) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => teamFetch<{ items: T[]; nextCursor: string | null } & Record<string, unknown>>(url(pageParam)),
    getNextPageParam: (last) => last.nextCursor,
    refetchOnWindowFocus: true,
  });
}

/** Görev değişince ilgili önbellekleri tazele (iskelete düşmeden; placeholder korunur). */
export function invalidateTasks(qc: QueryClient, taskId?: string) {
  void qc.invalidateQueries({ queryKey: ['team', 'tasks'] });
  void qc.invalidateQueries({ queryKey: ['team', 'summary'] });
  if (taskId) void qc.invalidateQueries({ queryKey: teamKeys.task(taskId) });
}

export function useTeamQueryClient() {
  return useQueryClient();
}
