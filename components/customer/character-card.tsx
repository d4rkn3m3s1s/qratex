'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Lock, Sparkles, Star, Wand2, Drama } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BadgeGlyph, RarityBadge, RARITY_STYLES } from '@/components/ds/play';
import { EmptyState } from '@/components/states';
import { MysteryBar } from '@/components/customer/mystery-bar';
import { useConfetti } from '@/components/providers/confetti-provider';
import { isReducedMotion } from '@/lib/motion';
import { hexToRgba } from '@/lib/badge-colors';
import { cn } from '@/lib/utils';
import type {
  CharacterBar,
  CharacterCategoryStat,
  CollectionItem,
} from '@/lib/badges/collection-logic';
import { formatEarnedDate, formatPct, useBadgesCopy } from '@/components/customer/m-rozetler/copy';

/**
 * KARAKTER ROZETİ — gizemli bar → küre/maskot reveal → kategori vitrini.
 *
 * Dalga 2 (`/customer/me/badges`): akış ve görsel kimlik KORUNDU; veri artık sayfanın sunucu
 * yüklemesinden (`lib/badges/customer-collection`) gelir (CLS'li geç `return null` yok),
 * reveal ekranı yalnız açılınca yüklenir (`next/dynamic`), seçiciler `aria-pressed`,
 * karakter kartı detay çekmecesini açar (ana karakter + paylaş + vitrin orada, geri bildirimli).
 *
 *  - `CharacterSurprise`: gizemli bar + "Karakterini aç" + küre/maskot seçici + reveal.
 *  - `CharacterShowcase`: kazanılan karakterler kategoriye göre gruplu vitrin.
 */

const CharacterReveal = dynamic(
  () => import('@/components/customer/character-reveal').then((m) => m.CharacterReveal),
  { ssr: false },
);

const CELEBRATED_KEY = 'qx-character-ready-celebrated';

export function CharacterSurprise({ bar, onRevealed }: { bar: CharacterBar; onRevealed: () => void }) {
  const copy = useBadgesCopy();
  const [revealOpen, setRevealOpen] = useState(false);
  const [variant, setVariant] = useState<'orb' | 'mascot'>('orb');
  const { fireStars } = useConfetti();
  const ready = bar.ready;

  // Bar dolduğunda TEK kutlama (oturum başına; her ziyarette konfeti yok). Azaltılmış harekette
  // (OS ya da uygulama ayarı) konfeti ve ses çalmaz.
  useEffect(() => {
    if (!ready) return;
    const key = `${CELEBRATED_KEY}:${bar.threshold}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      /* depolama kapalı: yine tek mount'ta bir kez */
    }
    if (isReducedMotion()) return;
    fireStars();
    import('@/lib/game-sounds').then((m) => m.sfxReveal?.()).catch(() => {});
  }, [ready, bar.threshold, fireStars]);

  return (
    <>
      <div className="flex flex-col gap-3">
        {ready ? (
          <>
            <p className="qx-body text-fg-muted">{copy.charReadyText}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setRevealOpen(true)} className="min-h-11 bg-brand text-brand-fg hover:bg-brand/90">
                <Wand2 className="mr-2 h-4 w-4" aria-hidden />
                {copy.revealCta}
              </Button>
              <div role="group" aria-label={copy.variantLabel} className="flex items-center gap-1 rounded-control bg-surface-muted p-1">
                {(['orb', 'mascot'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={variant === v}
                    onClick={() => setVariant(v)}
                    className={cn(
                      'qx-small min-h-11 rounded-chip px-3 font-medium text-fg-muted transition-colors duration-fast ease-standard sm:min-h-9',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      variant === v && 'bg-surface-1 text-fg qx-elevation-1',
                    )}
                  >
                    {v === 'orb' ? copy.variantOrb : copy.variantMascot}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="qx-body text-fg-muted">
              {copy.charBarText(bar.remaining)} <span className="text-fg-subtle">{copy.charBarHint}</span>
            </p>
            <div
              role="progressbar"
              aria-label={copy.charBarAria(bar.current, bar.threshold)}
              aria-valuemin={0}
              aria-valuemax={bar.threshold}
              aria-valuenow={bar.current}
            >
              <MysteryBar progress={bar.progress} current={bar.current} threshold={bar.threshold} ready={false} />
            </div>
          </>
        )}
      </div>

      {revealOpen && (
        <CharacterReveal
          open={revealOpen}
          onClose={() => setRevealOpen(false)}
          variant={variant}
          fetchOnOpen
          onReveal={() => onRevealed()}
        />
      )}
    </>
  );
}

type Group = { stat: CharacterCategoryStat | null; key: string; name: string; emoji: string; accent: string; items: CollectionItem[] };

export function CharacterShowcase({
  items,
  categoryStats,
  featuredBadgeId,
  onOpen,
}: {
  items: CollectionItem[];
  categoryStats: CharacterCategoryStat[];
  featuredBadgeId: string | null;
  onOpen: (id: string) => void;
}) {
  const copy = useBadgesCopy();

  const groups = useMemo<Group[]>(() => {
    const statByKey = new Map(categoryStats.map((c) => [c.key, c]));
    const map = new Map<string, Group>();
    for (const it of items) {
      const cat = it.characterCategory;
      const key = cat?.key ?? '__none';
      const g = map.get(key);
      if (g) g.items.push(it);
      else
        map.set(key, {
          key,
          name: cat?.name ?? copy.tabs.characters,
          emoji: cat?.emoji ?? '🎭',
          accent: cat?.accent ?? '#7c3aed',
          stat: cat ? statByKey.get(cat.key) ?? null : null,
          items: [it],
        });
    }
    const order = (k: string) => {
      const i = categoryStats.findIndex((s) => s.key === k);
      return i < 0 ? 999 : i;
    };
    return [...map.values()].sort((a, b) => order(a.key) - order(b.key));
  }, [items, categoryStats, copy.tabs.characters]);

  if (items.length === 0) {
    return (
      <EmptyState icon={Drama} title={copy.charEmptyTitle} description={copy.charEmptyBody} headingLevel="h3" />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`karakter-kategori-${g.key}`}>
          <div className="mb-3 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-control text-lg"
              style={{ background: hexToRgba(g.accent, 0.14), boxShadow: `inset 0 0 0 1px ${hexToRgba(g.accent, 0.35)}` }}
            >
              {g.emoji}
            </span>
            <div className="min-w-0">
              <h3 id={`karakter-kategori-${g.key}`} className="qx-h3 truncate text-fg">
                {g.name}
              </h3>
              <p className="qx-caption text-fg-muted">
                {copy.charactersCollected(g.stat?.collected ?? g.items.length)}
                {g.stat?.complete ? ` · ${copy.categoryComplete}` : ''}
              </p>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((c) => (
              <li key={c.id}>
                <CharacterTile item={c} accent={g.accent} featured={featuredBadgeId === c.id} onOpen={onOpen} />
              </li>
            ))}
            {/* Kategori tamamlanmadıysa TEK "?" kartı — kalan sayı sızmaz; tamamlandıysa yalan söylemez. */}
            {!g.stat?.complete && (
              <li>
                <div className="flex h-full min-h-[11rem] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-strong bg-surface-0 p-3 text-center">
                  <span
                    aria-hidden
                    className="grid size-14 place-items-center rounded-full"
                    style={{ background: hexToRgba(g.accent, 0.08) }}
                  >
                    <Lock className="size-5 text-fg-subtle" />
                  </span>
                  <p className="qx-small font-semibold tracking-widest text-fg-muted">???</p>
                  <p className="qx-caption text-fg-muted">{copy.undiscoveredChar}</p>
                  <span className="sr-only">{copy.moreInCategory}</span>
                </div>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CharacterTile({
  item,
  accent,
  featured,
  onOpen,
}: {
  item: CollectionItem;
  accent: string;
  featured: boolean;
  onOpen: (id: string) => void;
}) {
  const copy = useBadgesCopy();
  const rarity = RARITY_STYLES[item.rarity];
  const date = formatEarnedDate(item.earnedAt, copy, { day: 'numeric', month: 'short' });
  const pct = item.holdersPct !== null ? formatPct(item.holdersPct, copy) : null;
  // KATEGORİ RENGİ = KİMLİK; efsanevilik rengi ezmez, formdan (taç + çip) anlaşılır.
  const frame = featured
    ? { boxShadow: `inset 0 0 0 2px ${accent}, 0 0 18px ${hexToRgba(accent, 0.28)}` }
    : { boxShadow: `inset 0 0 0 1px ${hexToRgba(accent, item.rarity === 'common' ? 0.25 : 0.55)}` };

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(item.id)}
      aria-label={
        copy.tileAria(item.name, rarity.label[copy.locale], formatEarnedDate(item.earnedAt, copy)) +
        (featured ? `, ${copy.detailFeatured}` : '')
      }
      className={cn(
        'group relative flex h-full min-h-[11rem] w-full flex-col items-center gap-1.5 overflow-hidden rounded-card bg-surface-1 px-2 pb-3 pt-4 text-center',
        'transition-[transform,box-shadow] duration-fast ease-standard motion-safe:hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      style={frame}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20"
        style={{ background: `radial-gradient(80% 100% at 50% 0%, ${hexToRgba(accent, 0.16)}, transparent 75%)` }}
      />
      {featured && (
        <span
          className="qx-caption absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 font-bold text-white"
          style={{ background: accent }}
        >
          <Star aria-hidden className="size-3 fill-current" />
          {copy.mainBadge}
        </span>
      )}
      {item.isNew && !featured && (
        <span className="qx-caption absolute left-1.5 top-1.5 rounded-chip bg-brand px-1.5 py-0.5 font-semibold text-brand-fg">
          {copy.newBadge}
        </span>
      )}
      <BadgeGlyph label={item.name} imageSrc={item.thumb} color={accent} rarity={item.rarity} size="lg" aria-hidden />
      <span className="qx-small line-clamp-2 font-bold leading-tight text-fg">{item.name}</span>
      {item.rarity !== 'common' && <RarityBadge rarity={item.rarity} locale={copy.locale} />}
      <span className="qx-caption mt-auto flex flex-wrap items-center justify-center gap-x-1.5 text-fg-muted">
        {pct !== null && (
          <span className="inline-flex items-center gap-0.5">
            <Sparkles aria-hidden className="size-3" />%{pct}
          </span>
        )}
        {date && <span>{date}</span>}
      </span>
    </button>
  );
}
