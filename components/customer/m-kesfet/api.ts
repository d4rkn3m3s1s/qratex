'use client';

import type { DealsResponse, NearbyResponse, SavedResponse, TopResponse } from '@/lib/places/types';
import type { PlaceCategory } from '@/lib/places/categories';

/** Zarf v2 hatası: `QueryState` sınıflandırması için `status` + `code` taşır. */
export class PlacesApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, retryable: boolean) {
    super(message);
    this.name = 'PlacesApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export async function placesFetch<T>(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };
  if (!res.ok || env.success === false || env.ok === false) {
    throw new PlacesApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.retryable === true);
  }
  return env.data as T;
}

export type Coords = { lat: number; lng: number } | null;

function coordsParams(c: Coords, p = new URLSearchParams()): URLSearchParams {
  if (c) {
    p.set('lat', String(c.lat));
    p.set('lng', String(c.lng));
  }
  return p;
}

export interface NearbyParams {
  coords: Coords;
  radius: number;
  category: PlaceCategory | null;
  q: string;
  open: boolean;
  boost: boolean;
  sort: 'distance' | 'rating';
}

export const placesKeys = {
  all: ['customer', 'places'] as const,
  nearby: (p: NearbyParams) => ['customer', 'places', 'nearby', p] as const,
  saved: (c: Coords) => ['customer', 'places', 'saved', c ? `${c.lat},${c.lng}` : 'none'] as const,
  deals: (c: Coords) => ['customer', 'places', 'deals', c ? `${c.lat},${c.lng}` : 'none'] as const,
  top: (category: PlaceCategory | null, window: 30 | 90) => ['customer', 'places', 'top', category ?? 'all', window] as const,
};

export function fetchNearby(p: NearbyParams, offset: number, signal?: AbortSignal): Promise<NearbyResponse> {
  const qs = coordsParams(p.coords);
  if (p.coords) qs.set('radius', String(p.radius));
  if (p.category) qs.set('category', p.category);
  if (p.q) qs.set('q', p.q);
  if (p.open) qs.set('open', '1');
  if (p.boost) qs.set('boost', '1');
  if (p.coords && p.sort === 'rating') qs.set('sort', 'rating');
  if (offset > 0) qs.set('offset', String(offset));
  return placesFetch<NearbyResponse>(`/api/customer/places/nearby?${qs}`, { signal });
}

export function fetchSaved(c: Coords, signal?: AbortSignal): Promise<SavedResponse> {
  return placesFetch<SavedResponse>(`/api/customer/places/saved?${coordsParams(c)}`, { signal });
}

export function fetchDeals(c: Coords, signal?: AbortSignal): Promise<DealsResponse> {
  return placesFetch<DealsResponse>(`/api/customer/places/deals?${coordsParams(c)}`, { signal });
}

export function fetchTop(category: PlaceCategory | null, window: 30 | 90, signal?: AbortSignal): Promise<TopResponse> {
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (window === 30) qs.set('window', '30');
  return placesFetch<TopResponse>(`/api/customer/places/top?${qs}`, { signal });
}

export function setSaved(dealerId: string, saved: boolean): Promise<{ dealerId: string; saved: boolean; count: number }> {
  return placesFetch(`/api/customer/places/saved/${encodeURIComponent(dealerId)}`, { method: saved ? 'PUT' : 'DELETE' });
}

export function claimEventReward(campaignId: string): Promise<{ points: number; badgeAwarded: boolean; campaignId: string }> {
  return placesFetch(`/api/customer/seasonal-event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ campaignId }),
  });
}

/** Mekân detayı — `/customer/places/[dealerId]` (ayrı yüzey; eski `?focus=`/`?dealerId=` linklerinin hedefi). */
export function venueHref(dealerId: string): string {
  return `/customer/places/${encodeURIComponent(dealerId)}`;
}
