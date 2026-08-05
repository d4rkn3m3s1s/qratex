const VALID_VARIANTS = [
  'original',
  'aurora',
  'sparkles',
  'beams',
  'gradient',
  'meteors',
  'grid',
  'dots',
  'matrix',
  'particles',
  'waves',
  'starfield',
  'cyberpunk',
  'geometric',
  'fireflies',
  'christmas',
  'valentine',
  'birthday',
  'nebula',
  'northern-lights',
  'holographic',
  'galaxy',
  'summer',
  'winter',
  'autumn',
  'spring',
  'ice-kingdom',
  'none',
] as const;

export type BackgroundEffectValue = (typeof VALID_VARIANTS)[number];

/** Prisma `Json` alanından arka plan anahtarını güvenle oku (string veya `{ value: string }`). */
export function parseBackgroundEffectFromDb(raw: unknown): BackgroundEffectValue {
  const value =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          raw !== null &&
          'value' in raw &&
          typeof (raw as { value: unknown }).value === 'string'
        ? (raw as { value: string }).value
        : null;
  if (value && VALID_VARIANTS.includes(value as BackgroundEffectValue)) {
    return value as BackgroundEffectValue;
  }
  return 'original';
}
