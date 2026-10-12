/**
 * Tema türetme — tohum renklerden (marka/ikincil/vurgu + isteğe bağlı zemin/metin) rol
 * token'larını KONTRAST GARANTİLİ hesaplar. Saf; sunucu (SSR `<style>`), istemci ve Jest ortak.
 *
 * Tasarım raporu Y1 karşılıkları:
 *  - `--primary-foreground` artık her zaman beyaz değil: dolgu üstünde ≥ 4.5:1 olan metin
 *    seçilir (beyaz yetmezse koyu mürekkep; ikisi de yetmezse dolgu koyulaştırılır).
 *    Eskiden Kraliyet Altını 2,10:1, Gece Ormanı / Obsidyen 2,54:1 idi.
 *  - `--secondary-foreground` / `--accent-foreground` moda göre değil dolgunun parlaklığına göre.
 *  - Kart artık zeminle AYNI değil: zemin verildiğinde kart/yükseltilmiş/sönük yüzey ve
 *    kenarlık zeminin tonundan açıklık adımıyla türetilir (koyu: +3 / +6 / +9 L).
 *  - Metin rolleri (`foreground`, `muted-foreground`, `text-3`, `brand-text`, durum `*-text`)
 *    tüm yüzeylere karşı ≥ 4.5:1 olana kadar açıklık ekseninde kaydırılır → özel tema ya da
 *    mod dışı zemin seçilse bile metin okunur kalır.
 *  - `--brand-text` / `--brand-subtle` / `--brand-border` marka tohumundan türetilir
 *    (eskiden sabit mor kalıyor, yeşil temada `text-brand` mor görünüyordu).
 *  - Odak halkası zeminde ≥ 3:1 (WCAG 2.4.11 / 1.4.11); yetmezse `brand-text` kullanılır.
 *
 * Varsayılan değerler `app/globals.css` ile birebir aynıdır (__tests__/design/theme-derive.test.ts
 * eşitliği ve her preset × mod için kontrast sözleşmesini doğrular).
 */
import { contrastRatio, parseHslTriple } from '@/lib/design/contrast';
import { hexToHSL } from '@/lib/hex-to-hsl';

export type ThemeMode = 'light' | 'dark';

/** Tohum renkler (#RRGGBB). Verilmeyen tohumun token'ları yazılmaz (CSS varsayılanı kalır). */
export type ThemeSeeds = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
};

/** CSS değişken adı (`--` olmadan) → "H S% L%". */
export type ThemeVarMap = Record<string, string>;

const STATUS = ['success', 'warning', 'danger', 'info'] as const;

/** `app/globals.css` `:root` / `.dark` değerleri (eşitliği Jest korur). */
export const BASE_THEME_VARS: Record<ThemeMode, ThemeVarMap> = {
  light: {
    background: '264 40% 98%',
    card: '0 0% 100%',
    'surface-2': '0 0% 100%',
    muted: '264 30% 95%',
    foreground: '224 30% 14%',
    'muted-foreground': '220 10% 34%',
    'text-3': '220 9% 44%',
    border: '220 14% 82%',
    primary: '262 83% 58%',
    'brand-text': '262 70% 50%',
    'brand-subtle': '262 83% 96%',
    'success-text': '142 72% 26%',
    'success-subtle': '141 70% 94%',
    'warning-text': '28 90% 30%',
    'warning-subtle': '45 95% 92%',
    'danger-text': '0 72% 42%',
    'danger-subtle': '0 86% 96%',
    'info-text': '201 90% 30%',
    'info-subtle': '199 90% 95%',
  },
  dark: {
    background: '222 47% 5%',
    card: '222 38% 9%',
    'surface-2': '222 32% 12.5%',
    muted: '217 22% 15%',
    foreground: '210 40% 98%',
    'muted-foreground': '215 16% 68%',
    'text-3': '215 12% 57%',
    border: '217 19% 20%',
    primary: '262 83% 58%',
    'brand-text': '262 90% 78%',
    'brand-subtle': '262 45% 18%',
    'success-text': '142 69% 58%',
    'success-subtle': '142 50% 12%',
    'warning-text': '43 96% 58%',
    'warning-subtle': '38 60% 12%',
    'danger-text': '0 91% 71%',
    'danger-subtle': '0 55% 15%',
    'info-text': '199 92% 66%',
    'info-subtle': '201 60% 13%',
  },
};

type Hsl = [number, number, number];

const WHITE = '0 0% 100%';
/** Açık dolgu üstündeki koyu metin (globals'taki `--secondary-foreground` tonu). */
const INK = '240 10% 10%';
const TEXT_MIN = 4.5;
/** Tam sayıya yuvarlama ve tarayıcı farkları için küçük pay. */
const TEXT_TARGET = 4.6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = ([h, s, l]: Hsl): string => `${Math.round(h)} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%`;
const parse = (triple: string): Hsl => parseHslTriple(triple) ?? [0, 0, 0];

function minContrast(fg: string, bgs: readonly string[]): number {
  let min = Infinity;
  for (const bg of bgs) min = Math.min(min, contrastRatio(fg, bg));
  return min;
}

/** Zemin koyu mu? (yön kararı moddan değil gerçek parlaklıktan: mod dışı özel zemin de doğru çalışır) */
function isDarkSurface(bg: string): boolean {
  return contrastRatio(WHITE, bg) >= contrastRatio(INK, bg);
}

/**
 * Metin rengini, tüm zeminlere karşı hedef orana ulaşana dek açıklık ekseninde zeminden
 * uzaklaştırır (tonu/doygunluğu korur). Ulaşamazsa beyaz ya da mürekkebe düşer.
 */
export function ensureTextContrast(fg: string, bgs: readonly string[], darkSurface: boolean, target = TEXT_TARGET): string {
  const [h, s, l0] = parse(fg);
  let cur = fmt([h, s, l0]);
  if (minContrast(cur, bgs) >= target) return cur;
  for (let l = l0; l >= 0 && l <= 100; l += darkSurface ? 1 : -1) {
    cur = fmt([h, s, l]);
    if (minContrast(cur, bgs) >= target) return cur;
  }
  return darkSurface ? WHITE : INK;
}

/** Dolgu + üstündeki metin: beyaz ≥ 4.5 ise beyaz, değilse mürekkep; ikisi de yetmezse dolgu koyulaşır. */
export function onFill(fill: string): { fill: string; fg: string } {
  if (contrastRatio(WHITE, fill) >= TEXT_TARGET) return { fill, fg: WHITE };
  if (contrastRatio(INK, fill) >= TEXT_TARGET) return { fill, fg: INK };
  const [h, s, l0] = parse(fill);
  for (let l = l0; l >= 0; l--) {
    const cur = fmt([h, s, l]);
    if (contrastRatio(WHITE, cur) >= TEXT_TARGET) return { fill: cur, fg: WHITE };
  }
  return { fill, fg: contrastRatio(WHITE, fill) >= contrastRatio(INK, fill) ? WHITE : INK };
}

/**
 * Tohumlardan verilen modda yazılacak CSS değişkenleri. Yalnız etkilenen token'lar döner;
 * boş tohum seti → boş harita (CSS varsayılanları geçerli kalır).
 */
export function deriveThemeVars(seeds: ThemeSeeds, mode: ThemeMode): ThemeVarMap {
  const base = BASE_THEME_VARS[mode];
  const out: ThemeVarMap = {};

  // ── Yüzeyler ──
  let bg = base.background;
  let card = base.card;
  let surface2 = base['surface-2'];
  let muted = base.muted;
  if (seeds.background) {
    const b = parse(hexToHSL(seeds.background));
    bg = fmt(b);
    const dark = isDarkSurface(bg);
    const [h, s, l] = b;
    if (dark) {
      // Yükselti tonları (globals.css .dark ile aynı adımlar): kart +4, yüzey-2 +7.5, muted +10, sınır +15.
      card = fmt([h, s * 0.85, l + 4]);
      surface2 = fmt([h, s * 0.75, l + 7.5]);
      muted = fmt([h, Math.min(s, 25), l + 10]);
      out.border = fmt([h, Math.min(s, 20), l + 15]);
      // Güçlü sınır (form/ayırıcı) aydınlanan kartta da ≥3:1 kalsın.
      out['border-strong'] = fmt([h, Math.min(s, 13), Math.max(48, l + 40)]);
      out['glass-bg'] = card;
      out['glass-border'] = fmt([h, Math.min(s, 19), l + 17]);
    } else {
      // Açık zemin: kart ≥ zemin (beyaza doğru); çok açık zeminde saf beyaz kart.
      card = l >= 96 ? fmt([h, s, 100]) : fmt([h, s * 0.6, Math.min(100, l + 4)]);
      surface2 = card;
      muted = fmt([h, Math.min(s, 30), l - 3]);
      out.border = fmt([h, Math.min(s, 14), l - 16]);
      out['glass-bg'] = WHITE;
      out['glass-border'] = fmt([h, Math.min(s, 16), l - 16]);
    }
    out.input = out.border;
    out.background = bg;
    out.card = card;
    out.popover = dark ? surface2 : card;
    out['surface-2'] = surface2;
    out.muted = muted;
  }

  const surfaces = [bg, card, surface2, muted];
  const darkSurface = isDarkSurface(bg);
  // Mod dışı zemin (ör. eski tek takım özel temada açık modda koyu zemin): metin ve durum
  // rozeti tohumları zeminin gerçek parlaklığına uyan varsayılandan alınır.
  const surfaceBase = BASE_THEME_VARS[darkSurface ? 'dark' : 'light'];

  // ── Metin rolleri (zemin ya da metin tohumu değiştiyse yeniden doğrulanır) ──
  if (seeds.background || seeds.foreground) {
    const fgSeed = seeds.foreground ? hexToHSL(seeds.foreground) : surfaceBase.foreground;
    const fg = ensureTextContrast(fgSeed, surfaces, darkSurface);
    out.foreground = fg;
    out['card-foreground'] = fg;
    out['popover-foreground'] = fg;

    const [fh, fs] = parse(fg);
    const mutedSeed = seeds.foreground ? fmt([fh, Math.min(fs, 16), darkSurface ? 68 : 34]) : surfaceBase['muted-foreground'];
    out['muted-foreground'] = ensureTextContrast(mutedSeed, surfaces, darkSurface);
    const subtleSeed = seeds.foreground ? fmt([fh, Math.min(fs, 12), darkSurface ? 57 : 44]) : surfaceBase['text-3'];
    out['text-3'] = ensureTextContrast(subtleSeed, surfaces, darkSurface);

    if (seeds.background) {
      for (const n of STATUS) {
        const subtle = surfaceBase[`${n}-subtle`];
        if (surfaceBase !== base) out[`${n}-subtle`] = subtle;
        out[`${n}-text`] = ensureTextContrast(surfaceBase[`${n}-text`], [...surfaces, subtle], darkSurface);
      }
    }
  }

  // ── Marka ──
  if (seeds.primary || seeds.background) {
    let brandFill = base.primary;
    if (seeds.primary) {
      const { fill, fg } = onFill(hexToHSL(seeds.primary));
      brandFill = fill;
      out.primary = fill;
      out['primary-foreground'] = fg;
      out['gradient-from'] = fill;
    }
    const [h, s] = parse(brandFill);
    const subtle = darkSurface ? fmt([h, Math.min(s, 45), 18]) : fmt([h, Math.min(s, 83), 96]);
    out['brand-subtle'] = subtle;
    out['brand-border'] = darkSurface ? fmt([h, Math.min(s, 45), 36]) : fmt([h, Math.min(s, 60), 82]);
    const brandText = ensureTextContrast(brandFill, [...surfaces, subtle], darkSurface);
    out['brand-text'] = brandText;
    // Odak halkası: zeminde ≥ 3:1 (arayüz bileşeni eşiği); marka dolgusu yetmezse metin rolü.
    out.ring = contrastRatio(brandFill, bg) >= 3.1 && contrastRatio(brandFill, card) >= 3.1 ? brandFill : brandText;
  }

  if (seeds.secondary) {
    const { fill, fg } = onFill(hexToHSL(seeds.secondary));
    out.secondary = fill;
    out['secondary-foreground'] = fg;
    out['gradient-to'] = fill;
    out['sidebar-accent'] = fill;
  }

  if (seeds.accent) {
    const { fill, fg } = onFill(hexToHSL(seeds.accent));
    out.accent = fill;
    out['accent-foreground'] = fg;
  }

  return out;
}

/** Kontrast taban çizgisi — Jest ve admin raporu için (TEXT_MIN dışa açık). */
export const THEME_TEXT_MIN = TEXT_MIN;
