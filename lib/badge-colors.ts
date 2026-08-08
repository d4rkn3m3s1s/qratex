/**
 * Rozet renk yardımcıları. Admin rozet-başına renk (Badge.color / Badge.bgColor) verirse
 * bunlar rarity paletini EZER. Güvenlik: yalnız geçerli hex kabul edilir (CSS injection
 * yüzeyi kapalı — bu değerler doğrudan style'a girer).
 */

/** #RGB / #RRGGBB / #RRGGBBAA biçimlerini kabul eder; değilse null (temizlik). */
export function sanitizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : null;
}

/** Bir hex + alpha (0-1) → rgba(). Geçersiz hex'te şeffaf döner. */
export function hexToRgba(hex: string, alpha: number): string {
  const s = sanitizeHexColor(hex);
  if (!s) return `rgba(0,0,0,${alpha})`;
  let r = 0, g = 0, b = 0;
  const h = s.slice(1);
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Admin renkli rozet için inline stil üretir (kart zemini + çerçeve + parıltı).
 * color yoksa null döner → çağıran rarity varsayılan paletini kullanır.
 */
export function badgeColorStyle(color?: string | null, bgColor?: string | null): {
  background: string;
  borderColor: string;
  boxShadow: string;
  color: string;
} | null {
  const c = sanitizeHexColor(color);
  if (!c) return null;
  const bg = sanitizeHexColor(bgColor) ?? c;
  return {
    background: `linear-gradient(135deg, ${hexToRgba(c, 0.18)}, ${hexToRgba(bg, 0.28)})`,
    borderColor: hexToRgba(c, 0.6),
    boxShadow: `0 0 22px ${hexToRgba(c, 0.35)}`,
    color: c,
  };
}
