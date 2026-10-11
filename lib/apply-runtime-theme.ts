import { RUNTIME_THEME_LIVE_STYLE_ID, RUNTIME_THEME_STYLE_ID } from '@/lib/design-system/theme-runtime';

/**
 * Tema CSS'ini (lib/design-system/theme-runtime `buildRuntimeThemeCss`) belgeye uygular.
 *
 * Eskiden renkler `html` VE `body` üzerine satır içi `style.setProperty` ile yazılıyordu:
 * satır içi stil erişilebilirlik modlarını (yüksek kontrast, renk körü) eziyor, yalnız o anki
 * mod hesaplanıyor (açık/koyu geçişinde yeniden boyama) ve ikinci yazar (dönemsel konsept)
 * diğerinin değişkenlerini siliyordu. Artık tek `<style>` bloğu: SSR'ın bastığı blok
 * (`#qx-runtime-theme`) canlı blok yazılınca devre dışı kalır; tek kaynak canlı bloktur.
 */
export function applyRuntimeThemeCss(css: string): void {
  if (typeof document === 'undefined') return;
  let live = document.getElementById(RUNTIME_THEME_LIVE_STYLE_ID) as HTMLStyleElement | null;
  if (!live) {
    live = document.createElement('style');
    live.id = RUNTIME_THEME_LIVE_STYLE_ID;
    document.head.appendChild(live);
  }
  if (live.textContent !== css) live.textContent = css;
  // SSR bloğu React'e aittir (içeriğine dokunulmaz); yalnız stil sayfası devre dışı bırakılır.
  const ssr = document.getElementById(RUNTIME_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (ssr && !ssr.disabled) ssr.disabled = true;
}
