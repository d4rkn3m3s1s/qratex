/**
 * Emekli rotalar → Keşfet sekmesi (308, sorgu korunur). Saf modül (Jest).
 *
 *   /customer/nearby                → /customer/places            (Yakınımda)
 *   /customer/favorites             → /customer/places?tab=saved  (Kaydettiklerim)
 *   /customer/campaigns, /event     → /customer/places?tab=deals  (Fırsatlar)
 *   /customer/category-leaderboard  → /customer/places?tab=top    (En iyiler)
 *
 * Ölü derin linkler canlanır: `?focus=<id>` ve `?dealerId=<id>` (ana sayfa, Ayın İşletmesi,
 * öneriler, eski favoriler) → `/customer/places/<id>` mekân detayı. Diğer parametreler korunur.
 */
import type { PlacesTab } from './types';

export type LegacyPlacesSource = 'nearby' | 'favorites' | 'campaigns' | 'event' | 'category-leaderboard';
export type LegacySearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_BY_SOURCE: Record<LegacyPlacesSource, PlacesTab> = {
  nearby: 'nearby',
  favorites: 'saved',
  campaigns: 'deals',
  event: 'deals',
  'category-leaderboard': 'top',
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function legacyPlacesHref(source: LegacyPlacesSource, params: Record<string, string | string[] | undefined> = {}): string {
  const out = new URLSearchParams();
  const tab = TAB_BY_SOURCE[source];
  const venue = [first(params.venue), first(params.focus), first(params.dealerId)].find((v) => v && ID_RE.test(v));
  if (venue) return `/customer/places/${encodeURIComponent(venue)}`;
  if (tab !== 'nearby') out.set('tab', tab);
  for (const [key, raw] of Object.entries(params)) {
    if (key === 'focus' || key === 'dealerId' || key === 'venue' || key === 'tab') continue;
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const v of values) out.append(key, v);
  }
  const qs = out.toString();
  return qs ? `/customer/places?${qs}` : '/customer/places';
}
