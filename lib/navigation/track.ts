/**
 * Navigasyon kaynağı ölçümü (bilgi mimarisi geçiş planı Faz 5.3): hangi gezinme yüzeyi
 * (sidebar · ⌘K paleti · son kullanılanlar · mobil alt sekme) gerçekten kullanılıyor.
 * PostHog `nav_click` olayı; rıza yoksa `track` hiçbir şey yapmaz. Sorgu dizesi GÖNDERİLMEZ
 * (arama metni / kayıt kimliği taşıyabilir) — yalnız yol.
 */
import { track } from '@/lib/analytics';

export type NavSource = 'sidebar' | 'palette' | 'recent' | 'shortcut' | 'tabbar';

export function trackNav(source: NavSource, href: string, routeId?: string): void {
  if (!href.startsWith('/')) return;
  const path = href.split(/[?#]/)[0] || '/';
  track('nav_click', { source, path, ...(routeId ? { route_id: routeId } : {}) });
}
