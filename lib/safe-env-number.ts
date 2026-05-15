/** Pozitif tam sayı; boş / geçersiz / ≤0 → fallback. */
export function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Negatif olmayan tam sayı; NaN → fallback (0 geçerli). */
export function parseNonNegativeIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** (0, 1] aralığında oran; ör. sampling — geçersiz → fallback. */
export function parseOpenUnitFloatEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return fallback;
  return n;
}
