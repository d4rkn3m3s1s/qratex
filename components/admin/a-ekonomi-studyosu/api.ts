'use client';

import type { PointsMatrix } from '@/lib/points-rules';
import type { LeagueRule } from '@/lib/league-rules-core';
import type {
  CapsSnapshot,
  EconomyFlow,
  HistoryKind,
  HistoryPage,
  LeagueDistribution,
  LeaguePreview,
  Multipliers,
  SimulationResult,
} from '@/lib/admin-economy/contract';
import { fetchResourceJson, requireVersion, saveVersioned } from '@/lib/versioned-resource';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) okur. */
export class EconomyApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'EconomyApiError';
    this.status = status;
    this.code = code;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
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
    throw new EconomyApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    /* gövdesiz / HTML */
  }
  if (!res.ok || body.success === false || body.ok === false) {
    throw new EconomyApiError(
      res.status || 500,
      typeof body.error === 'string' ? body.error : 'İstek tamamlanamadı.',
      typeof body.code === 'string' ? body.code : null
    );
  }
  return (body.data !== undefined ? body.data : body) as T;
}

// ── Puan matrisi (mevcut sürümlü uç) ──
export async function loadMatrix() {
  const body = await fetchResourceJson('/api/admin/settings/points-matrix', 'Puan matrisi alınamadı');
  return {
    data: body.matrix as PointsMatrix,
    meta: { defaults: body.defaults as PointsMatrix },
    version: requireVersion(body),
  };
}
export function saveMatrix(draft: PointsMatrix, baseVersion: string) {
  return saveVersioned('/api/admin/settings/points-matrix', 'PUT', { matrix: draft, baseVersion }, 'Puan matrisi kaydedilemedi');
}
export function parseMatrixSave(body: Record<string, unknown>) {
  return { data: body.matrix as PointsMatrix, version: requireVersion(body) };
}

// ── Çarpanlar ──
type MultipliersBody = { multipliers: Multipliers; isDefault: boolean; caps: CapsSnapshot; version: string };
export async function loadMultipliers() {
  const d = await call<MultipliersBody>('/api/admin/gamification/settings');
  if (!d.version) throw new EconomyApiError(500, 'Sunucu sürüm bilgisi döndürmedi; düzenleme kilitli.', 'MISSING_VERSION');
  return { data: d.multipliers, meta: { isDefault: d.isDefault, caps: d.caps }, version: d.version };
}
export function saveMultipliers(draft: Multipliers, baseVersion: string) {
  return saveVersioned('/api/admin/gamification/settings', 'PUT', { ...draft, baseVersion }, 'Çarpanlar kaydedilemedi');
}
export function parseMultipliersSave(body: Record<string, unknown>) {
  const d = (body.data ?? body) as { multipliers: Multipliers; version: string };
  return { data: d.multipliers, version: requireVersion(d as unknown as Record<string, unknown>) };
}

// ── Ligler ──
export type LeaguesMeta = { isDefault: boolean; distribution: LeagueDistribution | null; totalUsers: number | null };
export async function loadLeagues() {
  const body = await fetchResourceJson('/api/admin/settings/leagues', 'Lig ayarları alınamadı');
  return {
    data: body.rules as LeagueRule[],
    meta: {
      isDefault: body.isDefault === true,
      distribution: (body.distribution as LeagueDistribution | null) ?? null,
      totalUsers: typeof body.totalUsers === 'number' ? body.totalUsers : null,
    } satisfies LeaguesMeta,
    version: requireVersion(body),
  };
}
export function saveLeagues(draft: LeagueRule[], baseVersion: string) {
  return saveVersioned('/api/admin/settings/leagues', 'PUT', { rules: draft, baseVersion }, 'Lig ayarları kaydedilemedi');
}
export function parseLeaguesSave(body: Record<string, unknown>) {
  return { data: body.rules as LeagueRule[], version: requireVersion(body) };
}
export function previewLeagues(rules: LeagueRule[], signal?: AbortSignal) {
  return call<LeaguePreview>('/api/admin/economy/leagues/preview', { method: 'POST', body: JSON.stringify({ rules }), signal });
}

// ── Akış, simülasyon, geçmiş ──
export function getFlow(days: number, signal?: AbortSignal) {
  return call<EconomyFlow>(`/api/admin/economy/flow?days=${days}`, { signal });
}
export function simulate(body: { days: number; matrix?: PointsMatrix; multipliers?: Multipliers }, signal?: AbortSignal) {
  return call<SimulationResult>('/api/admin/economy/simulate', { method: 'POST', body: JSON.stringify(body), signal });
}
export function getHistory(kind: HistoryKind, page: number, signal?: AbortSignal) {
  return call<HistoryPage>(`/api/admin/economy/history?kind=${kind}&page=${page}&size=10`, { signal });
}
