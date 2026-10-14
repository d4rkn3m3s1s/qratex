import { RUNTIME_THEME_LIVE_STYLE_ID, RUNTIME_THEME_STYLE_ID } from '@/lib/design-system/theme-runtime-ids';


// --- WCAG kontrast yardımcıları (AA 4.5:1) -------------------------------------------
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function relLum([r, g, b]: [number, number, number]): number {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function parseHsl(hsl: string): [number, number, number] {
  const [h, s, l] = hsl.replace(/%/g, '').split(/\s+/).map(Number);
  return [h || 0, (s || 0) / 100, (l || 0) / 100];
}

function contrast(a: string, b: string): number {
  const la = relLum(hslToRgb(...parseHsl(a)));
  const lb = relLum(hslToRgb(...parseHsl(b)));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Üzerine `fg` metni yazılacak dolgu rengini, ton/doygunluk aynı kalacak şekilde yalnızca
 * açıklığını kaydırarak AA (4.5:1) kontrasta getirir. Zaten yeterliyse aynen döner.
 * Gradyan/vurgu değişkenleri orijinal rengi korur; sadece "metin altı dolgu" değişir.
 */
export function ensureFillContrast(fillHsl: string, fgHsl: string, min = 4.5): string {
  if (contrast(fillHsl, fgHsl) >= min) return fillHsl;
  const [h, s, l0] = parseHsl(fillHsl);
  const fgLight = relLum(hslToRgb(...parseHsl(fgHsl))) > 0.5;
  let l = l0;
  for (let i = 0; i < 100; i++) {
    l = fgLight ? l - 0.01 : l + 0.01;
    if (l <= 0 || l >= 1) break;
    const cand = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    if (contrast(cand, fgHsl) >= min) return cand;
  }
  return fillHsl;
}

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
