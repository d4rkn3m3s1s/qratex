/**
 * Emekliye ayrılan oyunların (§7.3 KALDIR) eski sayfaları Oyna merkezine KALICI yönlenir.
 * Sorgu parametreleri korunur; `emekli=<id>` eklenir ki hub tek seferlik, dürüst bir
 * "bu oyun portföyden çıktı" notu gösterebilsin (halefi varsa ona bağlantı).
 */
import { GAMES_HUB_PATH, getGameEntry, getRetiredGame, isPlayable } from '@/lib/games/registry';

export const RETIRED_QUERY_KEY = 'emekli';

export function retiredRedirectTarget(
  id: string,
  searchParams: Record<string, string | string[] | undefined> = {}
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined || k === RETIRED_QUERY_KEY) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  if (getRetiredGame(id)) q.set(RETIRED_QUERY_KEY, id);
  const s = q.toString();
  return s ? `${GAMES_HUB_PATH}?${s}` : GAMES_HUB_PATH;
}

export interface RetiredNotice {
  id: string;
  title: string;
  reason: string;
  successor: { title: string; href: string } | null;
}

/** `?emekli=<id>` → bildirim içeriği (bilinmeyen kimlik → null; serbest metin yansıtılmaz). */
export function retiredNoticeFor(raw: string | string[] | undefined): RetiredNotice | null {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return null;
  const g = getRetiredGame(id);
  if (!g) return null;
  const succ = g.successor ? getGameEntry(g.successor) : undefined;
  return {
    id: g.id,
    title: g.title,
    reason: g.reason,
    successor: isPlayable(succ) ? { title: succ.title, href: `${GAMES_HUB_PATH}/${succ.id}` } : null,
  };
}
