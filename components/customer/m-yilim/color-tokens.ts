/**
 * Canvas, CSS değişkenini doğrudan okuyamaz: QDL rol token'larını (`--brand`, `--category-n`)
 * çalışma anında okuyup canvas renk metnine çevirir. Tema (açık/koyu/erişilebilirlik ön ayarı)
 * değişse de canvas aynı paleti kullanır. Okunamazsa marka morlarına düşer.
 */
export type Hsl = { h: number; s: number; l: number };

const FALLBACK: Hsl = { h: 262, s: 83, l: 58 };

/** "262 83% 58%" ya da "262, 83%, 58%" → Hsl. */
export function parseHslTriplet(raw: string | null | undefined): Hsl | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (![h, s, l].every(Number.isFinite)) return null;
  return { h, s, l };
}

export function readHslToken(name: string, fallback: Hsl = FALLBACK): Hsl {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);
    return parseHslTriplet(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

export function hsla(c: Hsl, alpha = 1, lightness?: number): string {
  const l = lightness ?? c.l;
  return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(l)}%, ${alpha})`;
}

/** Kategori token'ı (1..8). */
export function categoryColor(index: number): Hsl {
  const i = Math.min(8, Math.max(1, Math.round(index)));
  return readHslToken(`category-${i}`);
}
