/**
 * Çalışma zamanı tema denetleyicisi (ThemeController) — saf; sunucu ve istemci ortak.
 *
 * Tek öncelik sırası: `globals.css varsayılanı < yönetici teması < dönemsel konsept < erişilebilirlik`.
 *  - Tema, `html`/`body` üzerine satır içi stil olarak DEĞİL, tek bir `<style>` bloğu olarak
 *    yazılır. Seçiciler (`:root:not(.dark)` / `:root.dark`, özgüllük 0,2,0) globals.css
 *    varsayılanlarını (0,1,0 / 0,1,1) ezer ama erişilebilirlik modlarını (0,2,1+) ezmez —
 *    eskiden satır içi stil yüksek kontrast ve renk körü değerlerini eziyordu.
 *  - İki modun bloğu birlikte üretilir → açık/koyu geçişinde yeniden boyama yok.
 *  - Sunucu aynı CSS'i ilk HTML'e basar (app/layout.tsx) → ilk boyamada palet hazır (FOUC yok);
 *    istemci yalnız değişiklikte (yayın, dönemsel konsept) aynı fonksiyonla yeniden yazar.
 *  - Değerler `deriveThemeVars` çıktısıdır (yalnız sayısal HSL üçlüleri; tohumlar #RRGGBB
 *    doğrulamasından geçer) → `<style>` içine güvenle basılır.
 */
import { deriveThemeVars, type ThemeMode } from '@/lib/design/theme-derive';
import { findFamily, isValidActiveTheme, paletteFor, snapshotFromRows, type CustomColors, type Palette } from './theme-model';

export type RuntimeThemeState = {
  activeTheme: string | null;
  customColors: CustomColors | null;
  /** Aktif dönemsel konseptin paleti (aile id'si; `…Light` soneki kabul edilir). */
  seasonalThemeId?: string | null;
};

/** Bu öğelerin içeriği tema CSS'idir (SSR + canlı). */
export { RUNTIME_THEME_STYLE_ID, RUNTIME_THEME_LIVE_STYLE_ID } from './theme-runtime-ids';

export const RUNTIME_THEME_SELECTORS: Record<ThemeMode, string> = {
  light: ':root:not(.dark)',
  dark: ':root.dark',
};

export function runtimeThemeStateFromRows(rows: ReadonlyArray<{ key: string; value: unknown }> | null | undefined): RuntimeThemeState {
  const snap = snapshotFromRows(rows ?? []);
  return { activeTheme: snap.activeTheme, customColors: snap.customColors };
}

/** Verilen moddaki etkin palet; tema ayarlanmamış/geçersizse null (CSS varsayılanı). */
export function runtimePalette(state: RuntimeThemeState, mode: ThemeMode): Palette | null {
  const seasonal = state.seasonalThemeId ? findFamily(state.seasonalThemeId.replace(/Light$/, '')) : null;
  if (seasonal) return seasonal.variants[mode];
  const snap = { activeTheme: state.activeTheme, customColors: state.customColors, defaultMode: 'system' as const };
  if (!isValidActiveTheme(snap) || !snap.activeTheme) return null;
  return paletteFor({ activeTheme: snap.activeTheme, customColors: snap.customColors }, mode);
}

/** İki modun tema bloğu; tema yoksa boş metin. */
export function buildRuntimeThemeCss(state: RuntimeThemeState): string {
  const blocks: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const palette = runtimePalette(state, mode);
    if (!palette) continue;
    const decls = Object.entries(deriveThemeVars(palette, mode))
      .map(([name, value]) => `--${name}:${value}`)
      .join(';');
    if (decls) blocks.push(`${RUNTIME_THEME_SELECTORS[mode]}{${decls}}`);
  }
  return blocks.join('\n');
}
