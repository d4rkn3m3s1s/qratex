/**
 * Nadirlik tablosu — TEK kaynak (RarityBadge, BadgeGlyph kenarı, An Motoru rozet sahnesi).
 *
 * Renk YALNIZ rol/kimlik token'larından gelir; metin her zaman `*-text` rolüyle
 * (≥ 4,5:1). Renk tek başına anlam taşımaz: her kademenin ayrı ikonu ve metni var
 * (renk körü modunda `warning` mora kaydığında efsanevi yine taç + "Efsanevi" ile okunur).
 */
import type { PlayLocale } from './shared';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export type RarityStyle = {
  label: Record<PlayLocale, string>;
  /** Çip: açık zemin + AA metin + iç kenarlık. */
  chip: string;
  /** Yalnız metin rengi. */
  text: string;
  /** Kenar/halka için CSS rengi (dekoratif). */
  edge: string;
  /** İkinci kenar rengi (gradient kenar için). */
  edgeTo: string;
  /** Kademe sırası (0 = en yaygın). */
  rank: number;
};

export const RARITY_STYLES: Record<Rarity, RarityStyle> = {
  common: {
    label: { tr: 'Yaygın', en: 'Common' },
    chip: 'bg-surface-muted text-fg-muted ring-1 ring-inset ring-border',
    text: 'text-fg-muted',
    edge: 'hsl(var(--border-strong))',
    edgeTo: 'hsl(var(--text-3))',
    rank: 0,
  },
  rare: {
    label: { tr: 'Nadir', en: 'Rare' },
    chip: 'bg-info-subtle text-info ring-1 ring-inset ring-info-border',
    text: 'text-info',
    edge: 'hsl(var(--category-2))',
    edgeTo: 'hsl(var(--category-6))',
    rank: 1,
  },
  epic: {
    label: { tr: 'Destansı', en: 'Epic' },
    chip: 'bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border',
    text: 'text-brand',
    edge: 'hsl(var(--category-1))',
    edgeTo: 'hsl(var(--category-8))',
    rank: 2,
  },
  legendary: {
    label: { tr: 'Efsanevi', en: 'Legendary' },
    chip: 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border',
    text: 'text-warning',
    edge: 'hsl(var(--category-4))',
    edgeTo: 'hsl(var(--category-7))',
    rank: 3,
  },
};

/** Bilinmeyen/boş değeri `common`'a indirger (DB'den gelen serbest metin için). */
export function normalizeRarity(value: unknown): Rarity {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (RARITIES as readonly string[]).includes(v) ? (v as Rarity) : 'common';
}
