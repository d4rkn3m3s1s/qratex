/**
 * Dönemsel konseptin istemci katmanlarına iletimi (saf, DB'siz).
 *
 * `SeasonalConceptApplier` aktif konsepti çözünce bu modülle yayınlar; palet sahibi
 * (`ThemeColorsProvider`) ve arka plan sahibi (`DynamicBackground`) dinler. Böylece palet
 * TEK yoldan uygulanır (açık/koyu varyantı + background/foreground dahil, mod değişiminde
 * kaybolmaz) ve arka plan efekti gerçekten görünür. Sonradan bağlanan bileşenler son değeri
 * `readSeasonalOverride()` ile okur.
 */
export const SEASONAL_OVERRIDE_EVENT = 'qratex:seasonal-override';

export type SeasonalOverride = { themePresetId: string | null; backgroundEffect: string | null };

const EMPTY: SeasonalOverride = { themePresetId: null, backgroundEffect: null };

declare global {
  interface Window {
    __qratexSeasonalOverride?: SeasonalOverride;
  }
}

export function readSeasonalOverride(): SeasonalOverride {
  if (typeof window === 'undefined') return EMPTY;
  return window.__qratexSeasonalOverride ?? EMPTY;
}

export function publishSeasonalOverride(next: SeasonalOverride): void {
  if (typeof window === 'undefined') return;
  window.__qratexSeasonalOverride = next;
  window.dispatchEvent(new CustomEvent<SeasonalOverride>(SEASONAL_OVERRIDE_EVENT, { detail: next }));
}

export function subscribeSeasonalOverride(fn: (o: SeasonalOverride) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => fn((e as CustomEvent<SeasonalOverride>).detail ?? EMPTY);
  window.addEventListener(SEASONAL_OVERRIDE_EVENT, handler);
  return () => window.removeEventListener(SEASONAL_OVERRIDE_EVENT, handler);
}
