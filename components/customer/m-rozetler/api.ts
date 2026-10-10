'use client';

import type { CollectionOverview } from '@/lib/badges/collection-logic';

/**
 * Rozet yüzeyinin istemci uçları. Zarf v2 (`{ ok, success, data, code, retryable }`) okunur;
 * başarısız yanıt `BadgesApiError` fırlatır → `QueryState` hatayı türüne göre gösterir
 * (401/403 yetkisiz, ağ hatası çevrimdışı). "Hata = boş koleksiyon" yapısal olarak yok.
 */
export class BadgesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string, retryable: boolean) {
    super(message);
    this.name = 'BadgesApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

async function call<T>(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });
  let body: { success?: boolean; data?: unknown; error?: string; code?: string; retryable?: boolean } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    throw new BadgesApiError(
      body?.error || 'İstek tamamlanamadı.',
      res.status,
      body?.code || (res.ok ? 'INVALID_RESPONSE' : `HTTP_${res.status}`),
      body?.retryable ?? res.status >= 500,
    );
  }
  return body.data as T;
}

export const BADGES_QUERY_KEY = ['customer', 'badges', 'overview'] as const;

export function fetchBadgesOverview(signal?: AbortSignal): Promise<CollectionOverview> {
  return call<CollectionOverview>('/api/customer/badges', { signal });
}

export type PinResult = { badgeId: string; isPinned: boolean; pinnedBadges: number; pinnedTotal: number; pinLimit: number };

export function setBadgePinned(badgeId: string, isPinned: boolean): Promise<PinResult> {
  return call<PinResult>(`/api/customer/badges/${encodeURIComponent(badgeId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPinned }),
  });
}

/** Ana karakter — mevcut `/api/customer/character` POST `action:'feature'` (eski zarf). */
export async function featureCharacter(badgeId: string): Promise<void> {
  const res = await fetch('/api/customer/character', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action: 'feature', badgeId }),
  });
  let body: { success?: boolean; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body?.success) {
    throw new BadgesApiError(body?.error || 'Ana karakter ayarlanamadı.', res.status, `HTTP_${res.status}`, res.status >= 500);
  }
}

export type RarestRow = {
  rowKey: string;
  badgeId: string | null;
  name: string | null;
  thumb: string | null;
  category: { key: string; name: string; emoji: string; accent: string } | null;
  rarity: string;
  holders: number;
  holdersPct: number | null;
  isMine: boolean;
};

export type WeeklyRow = { rank: number; rowKey: string; name: string | null; count: number; isCurrentUser: boolean };

export type LeaderboardData =
  | { mode: 'rarest'; totalCustomers: number; leaderboard: RarestRow[] }
  | {
      mode: 'top-weekly';
      weekStart: string;
      participants: number;
      leaderboard: WeeklyRow[];
      currentUser: { count: number; rank: number | null };
    };

export function fetchCharacterLeaderboard(mode: 'rarest' | 'top-weekly', signal?: AbortSignal): Promise<LeaderboardData> {
  return call<LeaderboardData>(`/api/customer/character-leaderboard?mode=${mode}`, { signal });
}
