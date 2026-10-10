'use client';

import { Gift, Pin } from 'lucide-react';
import { BadgeGlyph, GlowCard, RarityBadge } from '@/components/ds/play';
import { InlineError } from '@/components/states';
import type { CollectionItem, CollectionOverview } from '@/lib/badges/collection-logic';
import { CharacterSurprise } from '@/components/customer/character-card';
import { formatInt, formatPct, useBadgesCopy } from './copy';

/**
 * Üst şerit: ana karakter + paydasız koleksiyon metrikleri (toplanan, rozetlerden GERÇEK puan,
 * bu ay, en nadir). Eski hero'daki "X/X · %100 · Sıradaki %0" yapısal olarak yok.
 */
export function CollectionHero({ data, featured, onOpen }: { data: CollectionOverview; featured: CollectionItem | null; onOpen: (id: string) => void }) {
  const copy = useBadgesCopy();
  const s = data.stats;
  const rarestPct = s.rarest?.holdersPct != null ? formatPct(s.rarest.holdersPct, copy) : null;

  return (
    <GlowCard role="region" aria-labelledby="koleksiyon-ozeti">
      <h2 id="koleksiyon-ozeti" className="sr-only">
        {copy.heroEyebrow}
      </h2>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:w-64 sm:shrink-0">
          {featured ? (
            <button
              type="button"
              onClick={() => onOpen(featured.id)}
              aria-haspopup="dialog"
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <BadgeGlyph
                label={featured.name}
                imageSrc={featured.thumb}
                color={featured.characterCategory?.accent ?? undefined}
                rarity={featured.rarity}
                size="xl"
              />
            </button>
          ) : (
            <BadgeGlyph label={copy.noFeatured} secret size="xl" />
          )}
          <div className="min-w-0">
            <p className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">{copy.featuredLabel}</p>
            <p className="qx-h3 truncate text-fg">{featured ? featured.name : copy.noFeatured}</p>
            <p className="qx-caption mt-1 inline-flex items-center gap-1 rounded-chip bg-surface-muted px-2 py-0.5 font-medium text-fg-muted">
              <Pin aria-hidden className="size-3" />
              {copy.showcaseLabel(s.pinnedTotal, s.pinLimit)}
            </p>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={copy.statCollected} value={formatInt(s.total, copy)} />
          <Metric label={copy.statPoints} value={formatInt(s.pointsFromBadges, copy)} />
          <Metric label={copy.statThisMonth} value={formatInt(s.earnedThisMonth, copy)} />
          <div className="min-w-0 rounded-control bg-surface-0/60 p-3">
            <dt className="qx-caption font-medium text-fg-muted">{copy.statRarest}</dt>
            {s.rarest ? (
              <dd className="mt-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(s.rarest!.id)}
                  aria-haspopup="dialog"
                  className="qx-small block w-full truncate text-left font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {s.rarest.name}
                </button>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <RarityBadge rarity={s.rarest.rarity} locale={copy.locale} />
                  {rarestPct !== null && <span className="qx-caption text-fg-muted">{copy.rarestOf(rarestPct)}</span>}
                </span>
              </dd>
            ) : (
              <dd className="qx-display mt-1 text-fg-subtle">—</dd>
            )}
          </div>
        </dl>
      </div>
    </GlowCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-0/60 p-3">
      <dt className="qx-caption font-medium text-fg-muted">{label}</dt>
      <dd className="qx-h2 qx-num mt-1 font-display text-fg">{value}</dd>
    </div>
  );
}

/** "Sıradaki sürpriz": karakter barı (+ reveal) ve yorum kilometre taşı sinyali — ad sızdırmadan. */
export function SurprisePanel({ data, onRevealed }: { data: CollectionOverview; onRevealed: () => void }) {
  const copy = useBadgesCopy();
  const bar = data.character.bar;
  const next = data.nextSurprise;
  const nextPct = next ? Math.min(100, Math.round((next.current / Math.max(1, next.target)) * 100)) : 0;

  return (
    <section aria-labelledby="siradaki-surpriz" className="rounded-card border border-subtle bg-surface-1 p-card qx-elevation-1">
      <h2 id="siradaki-surpriz" className="qx-h3 mb-3 flex items-center gap-2 text-fg">
        <Gift aria-hidden className="size-5 text-brand" />
        {copy.surpriseTitle}
      </h2>
      <div className="flex flex-col gap-5">
        {bar ? <CharacterSurprise bar={bar} onRevealed={onRevealed} /> : <InlineError variant="banner" tone="warning">{copy.barUnavailable}</InlineError>}
        {next && (
          <div className="flex flex-col gap-2 border-t border-subtle pt-4">
            <p className="qx-small text-fg-muted">{copy.nextSurpriseText(next.remaining)}</p>
            <div
              role="progressbar"
              aria-label={copy.nextSurpriseAria(next.current, next.target)}
              aria-valuemin={0}
              aria-valuemax={next.target}
              aria-valuenow={next.current}
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--gradient-from))] to-[hsl(var(--gradient-to))] transition-[width] duration-slow ease-standard"
                style={{ width: `${nextPct}%` }}
              />
            </div>
            <p className="qx-caption qx-num text-right text-fg-muted">
              {next.current}/{next.target}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
