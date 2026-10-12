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
 * 2026-10 profesyonelleştirme (docs/design/iyilestirme/TEMALAR.md):
 *  - Dolgular OKLCH'de evcilleştirilir: koyu modda kroma ≤ 0.20 (neon/göz yoran parlama yok),
 *    açıkta ≤ 0.26 (yalnız aşırı özel renkler).
 *  - Dolgu üstü metin önce BEYAZ denenir (dolgu ≤ 0.10 OKLCH L koyulaşabilir); orta tonlu
 *    mavi/pembe/turuncu düğmelerde siyah yazı biter, yalnız gerçekten açık dolgular mürekkep alır.
 *  - Seçili yüzey (`brand-subtle`) kartta ≥ 1,2:1 (koyu) / 1,1:1 (açık), `brand-border` ≥ 1,8:1;
 *    odak halkası zemin + kart + yüzey-2'nin hepsinde ≥ 3:1; açık modda kart/zemin ≥ 1,06:1.
 *
 * Varsayılan değerler `app/globals.css` ile birebir aynıdır (__tests__/design/theme-derive.test.ts
 * eşitliği ve her preset × mod için kontrast sözleşmesini doğrular).
 */
import { contrastRatio, hslToRgb, parseHslTriple } from '@/lib/design/contrast';
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

// ───────────────────────────── OKLCH (algısal ton/kroma) ─────────────────────────────
// HSL'de "doygunluk %83" mor ile sarıda bambaşka görünür; kroma sınırı ve açıklık adımları
// algısal uzayda (OKLCH) yapılır, çıktı yine "H S% L%" üçlüsüdür (CSS sözleşmesi değişmez).

export type Oklch = { l: number; c: number; h: number };

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055);

/** "H S% L%" → OKLCH (l 0–1, c ~0–0.37, h derece). */
export function hslToOklch(triple: string): Oklch {
  const [h0, s0, l0] = parse(triple);
  const [r, g, b] = hslToRgb(h0, s0, l0).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707695193 * s,
  ].map(fromLin) as [number, number, number];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.001 && v <= 1.001);

/** OKLCH → "H S% L%" (gamut dışıysa kroma ton korunarak düşürülür). */
export function oklchToHsl(o: Oklch): string {
  let c = o.c;
  let rgb = oklchToRgb({ ...o, c });
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.005);
    rgb = oklchToRgb({ ...o, c });
  }
  const [r, g, b] = rgb.map((v) => clamp(v, 0, 1));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  }
  return fmt([h, s * 100, l * 100]);
}

/**
 * Marka/ikincil/vurgu dolgusu için kroma tavanı (OKLCH C). Açıkta yalnız aşırı neon özel
 * renkleri keser (hazır paletlerin en doygunu 0.25); koyu zeminde doygun dolgu "ışıldar" ve
 * göz yorar → tavan düşük (Radix/Material koyu ölçekleri gibi).
 */
export const FILL_CHROMA_MAX: Record<ThemeMode, number> = { light: 0.26, dark: 0.2 };

/** Dolguyu moda göre evcilleştirir: kroma tavanı (ton ve açıklık korunur). */
export function tameFill(fill: string, mode: ThemeMode): string {
  const o = hslToOklch(fill);
  if (o.c <= FILL_CHROMA_MAX[mode]) return fill;
  return oklchToHsl({ ...o, c: FILL_CHROMA_MAX[mode] });
}

/** Beyaz metni korumak için dolgunun koyulaştırılabileceği en fazla OKLCH açıklık adımı. */
const WHITE_DARKEN_MAX = 0.1;

/**
 * Dolgu + üstündeki metin. Öncelik: beyaz (dolgu düğmesinin olağan görünümü) → dolgu ≤ 0.10 L
 * koyulaştırılarak beyaz → koyu mürekkep (sarı/altın/açık yeşil gibi açık dolgular) → son çare
 * dolgu beyaz yetene dek koyulaşır. Koyulaştırma OKLCH'de: ton kaymaz, çamurlaşmaz.
 * (Eski: orta tonlu mavi/pembe dolgularda siyah yazı — ucuz/neon görünüyordu.)
 */
export function onFill(fill: string): { fill: string; fg: string } {
  if (contrastRatio(WHITE, fill) >= TEXT_TARGET) return { fill, fg: WHITE };
  const o = hslToOklch(fill);
  for (let d = 0.01; d <= WHITE_DARKEN_MAX + 1e-9; d += 0.01) {
    const cur = oklchToHsl({ ...o, l: o.l - d });
    if (contrastRatio(WHITE, cur) >= TEXT_TARGET) return { fill: cur, fg: WHITE };
  }
  if (contrastRatio(INK, fill) >= TEXT_TARGET) return { fill, fg: INK };
  for (let l = o.l; l >= 0; l -= 0.01) {
    const cur = oklchToHsl({ ...o, l });
    if (contrastRatio(WHITE, cur) >= TEXT_TARGET) return { fill: cur, fg: WHITE };
  }
  return { fill, fg: contrastRatio(WHITE, fill) >= contrastRatio(INK, fill) ? WHITE : INK };
}

/** Yüzeyi `ref`'ten en az `ratio` kadar ayrışana dek açıklık ekseninde uzaklaştırır. */
function separateFrom(color: string, ref: string, ratio: number, lighter: boolean): string {
  const [h, s, l0] = parse(color);
  for (let l = l0; l >= 0 && l <= 100; l += lighter ? 1 : -1) {
    const cur = fmt([h, s, l]);
    if (contrastRatio(cur, ref) >= ratio) return cur;
  }
  return color;
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
      // Yüzey merdiveni: beyaz kart zeminden en az 1,06:1 ayrışsın (eski: Kraliyet Altını /
      // Aurora / Gece Ormanı açıkta 1,04 — kartlar zemine eriyordu); gerekirse zemin koyulaşır.
      if (contrastRatio(card, bg) < 1.06) bg = separateFrom(bg, card, 1.06, false);
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
      const { fill, fg } = onFill(tameFill(hexToHSL(seeds.primary), mode));
      brandFill = fill;
      out.primary = fill;
      out['primary-foreground'] = fg;
      out['gradient-from'] = fill;
    }
    const [h, s] = parse(brandFill);
    // Seçili/hover yüzeyi kartta GÖRÜNÜR olmalı (eski: Çiçek koyu 1,03:1 — seçim fark edilmiyordu).
    const subtle = separateFrom(
      darkSurface ? fmt([h, Math.min(s, 45), 18]) : fmt([h, Math.min(s, 83), 96]),
      card,
      darkSurface ? 1.2 : 1.1,
      darkSurface,
    );
    out['brand-subtle'] = subtle;
    out['brand-border'] = separateFrom(
      darkSurface ? fmt([h, Math.min(s, 45), 36]) : fmt([h, Math.min(s, 60), 82]),
      card,
      1.8,
      darkSurface,
    );
    const brandText = ensureTextContrast(brandFill, [...surfaces, subtle], darkSurface);
    out['brand-text'] = brandText;
    // Odak halkası: tüm yüzeylerde ≥ 3:1 (arayüz bileşeni eşiği); marka dolgusu yetmezse metin rolü.
    out.ring = minContrast(brandFill, [bg, card, surface2]) >= 3.1 ? brandFill : brandText;
  }

  if (seeds.secondary) {
    const { fill, fg } = onFill(tameFill(hexToHSL(seeds.secondary), mode));
    out.secondary = fill;
    out['secondary-foreground'] = fg;
    out['gradient-to'] = fill;
    out['sidebar-accent'] = fill;
  }

  if (seeds.accent) {
    const { fill, fg } = onFill(tameFill(hexToHSL(seeds.accent), mode));
    out.accent = fill;
    out['accent-foreground'] = fg;
  }

  return out;
}

/** Kontrast taban çizgisi — Jest ve admin raporu için (TEXT_MIN dışa açık). */
export const THEME_TEXT_MIN = TEXT_MIN;
