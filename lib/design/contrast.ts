/**
 * WCAG 2.2 kontrast hesabı — saf fonksiyonlar (sunucu, istemci ve Jest ortak).
 * QDL token'ları "H S% L%" üçlüsü olarak saklanır (shadcn kalıbı).
 */

export type Rgb = [number, number, number];

/** "262 83% 58%" | "262, 83%, 58%" | "hsl(262 83% 58%)" → [h, s, l] (s,l 0–100). */
export function parseHslTriple(input: string): [number, number, number] | null {
  const cleaned = input
    .trim()
    .replace(/^hsla?\(/i, '')
    .replace(/\)$/, '')
    .split('/')[0]
    .replace(/,/g, ' ')
    .replace(/%/g, '')
    .trim();
  const parts = cleaned.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** HSL (h derece, s/l 0–100) → sRGB 0–1. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** "#rrggbb" | "#rgb" → sRGB 0–1. */
export function hexToRgb(hex: string): Rgb | null {
  const m = hex.trim().replace(/^#/, '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

/** "rgb(12, 34, 56)" | "rgba(…)" | "rgb(12 34 56 / .5)" → sRGB 0–1 (alfa yok sayılır). */
export function cssRgbToRgb(input: string): Rgb | null {
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const nums = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
  if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) return null;
  return [nums[0] / 255, nums[1] / 255, nums[2] / 255];
}

/** Herhangi bir renk girdisini sRGB'ye çevirir (HSL üçlüsü, hsl(), #hex, rgb()). */
export function toRgb(color: string): Rgb | null {
  const c = color.trim();
  if (c.startsWith('#')) return hexToRgb(c);
  if (/^rgba?\(/i.test(c)) return cssRgbToRgb(c);
  const hsl = parseHslTriple(c);
  return hsl ? hslToRgb(hsl[0], hsl[1], hsl[2]) : null;
}

/** WCAG göreli parlaklık. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** İki renk arasındaki kontrast oranı (1–21). Çözümlenemezse NaN. */
export function contrastRatio(a: string, b: string): number {
  const A = toRgb(a);
  const B = toRgb(b);
  if (!A || !B) return Number.NaN;
  const la = relativeLuminance(A);
  const lb = relativeLuminance(B);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA-large' | 'fail';

/** Normal metin eşiklerine göre derece (AA 4.5, AAA 7; büyük metin/arayüz 3). */
export function gradeContrast(ratio: number): ContrastGrade {
  if (!Number.isFinite(ratio)) return 'fail';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

export function formatRatio(ratio: number): string {
  return Number.isFinite(ratio) ? `${ratio.toFixed(2).replace('.', ',')}:1` : '—';
}
