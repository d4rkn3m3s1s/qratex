'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { Award, Pin, ScanLine, Search, SearchX } from 'lucide-react';
import { BadgeGlyph, RarityBadge, RARITY_STYLES } from '@/components/ds/play';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { listItem } from '@/lib/motion';
import {
  BADGE_CATEGORY_KEYS,
  matchesQuery,
  sortCollection,
  type CollectionItem,
  type CollectionSort,
} from '@/lib/badges/collection-logic';
import { formatEarnedDate, useBadgesCopy, type BadgesCopy } from './copy';
import { HoloFoil } from './holo-foil';

const PAGE_SIZE = 24;
/** Arama kutusu ancak koleksiyon bu boyuta ulaşınca görünür (az rozette gürültü). */
const SEARCH_MIN = 12;

const SORTS: readonly CollectionSort[] = ['recent', 'rarity', 'category'];

export function isCollectionSort(v: string | null): v is CollectionSort {
  return !!v && (SORTS as readonly string[]).includes(v);
}

type Props = {
  items: CollectionItem[];
  moreToDiscover: boolean;
  sort: CollectionSort;
  onSortChange: (s: CollectionSort) => void;
  category: string | null;
  onCategoryChange: (c: string | null) => void;
  onOpen: (id: string) => void;
  /** Derin linkle açılan rozet: bir kez görünür alana kaydırılır ve vurgulanır. */
  highlightId: string | null;
};

export function BadgeGrid({ items, moreToDiscover, sort, onSortChange, category, onCategoryChange, onOpen, highlightId }: Props) {
  const copy = useBadgesCopy();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categories = useMemo(() => {
    const present = new Set(items.map((i) => i.category));
    return (BADGE_CATEGORY_KEYS as readonly string[]).filter((k) => present.has(k));
  }, [items]);
  const activeCategory = category && categories.includes(category) ? category : null;

  const visible = useMemo(() => {
    const filtered = items.filter((i) => (!activeCategory || i.category === activeCategory) && matchesQuery(i, q));
    return sortCollection(filtered, sort);
  }, [items, activeCategory, q, sort]);

  // Derin link: hedef rozet sayfalama dışındaysa sınırı genişlet.
  useEffect(() => {
    if (!highlightId) return;
    const idx = visible.findIndex((i) => i.id === highlightId);
    if (idx >= limit) setLimit(Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE);
  }, [highlightId, visible, limit]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title={copy.emptyTitle}
        description={copy.emptyBody}
        headingLevel="h3"
        action={
          <Button asChild>
            <Link href="/customer/scan">
              <ScanLine className="mr-2 h-4 w-4" aria-hidden />
              {copy.emptyCta}
            </Link>
          </Button>
        }
      />
    );
  }

  const filtersActive = !!activeCategory || q.trim().length > 0;
  const shown = visible.slice(0, limit);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span id="rozet-siralama" className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">
            {copy.sortLabel}
          </span>
          <ChoiceChips<CollectionSort>
            aria-labelledby="rozet-siralama"
            size="sm"
            options={SORTS.map((s) => ({ value: s, label: copy.sort[s] }))}
            value={sort}
            onChange={(v) => v && onSortChange(v)}
          />
        </div>
        {categories.length > 1 && (
          <ChoiceChips<string>
            aria-label={copy.categoryFilterLabel}
            size="sm"
            scroll
            options={[
              { value: '__all', label: copy.allCategories },
              ...categories.map((c) => ({ value: c, label: copy.categoryLabel(c) })),
            ]}
            value={activeCategory ?? '__all'}
            onChange={(v) => onCategoryChange(!v || v === '__all' ? null : v)}
          />
        )}
        {items.length >= SEARCH_MIN && (
          <div className="relative max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchLabel}
              className="h-11 pl-9"
            />
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {copy.resultCount(visible.length)}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={copy.noResultsTitle(q.trim())}
          description={copy.noResultsBody}
          headingLevel="h3"
          compact
          action={
            filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  onCategoryChange(null);
                }}
              >
                {copy.clearFilters}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6" aria-label={copy.tabs.badges}>
          {shown.map((item, i) => (
            <Motion.li key={item.id} variants={listItem} custom={i < 12 ? i : undefined} initial={i < 12 ? 'hidden' : false} animate="visible">
              <BadgeTile item={item} copy={copy} onOpen={onOpen} highlight={item.id === highlightId} />
            </Motion.li>
          ))}
          {moreToDiscover && !filtersActive && visible.length <= limit && (
            <li>
              <div className="flex h-full min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-strong bg-surface-0 p-3 text-center">
                <BadgeGlyph label={copy.discoverTile} secret size="lg" />
                <p className="qx-caption font-semibold text-fg-muted">{copy.discoverTile}</p>
                <p className="sr-only">{copy.discoverHint}</p>
              </div>
            </li>
          )}
        </ul>
      )}

      {visible.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-11" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            {copy.showMore(visible.length - limit)}
          </Button>
        </div>
      )}
    </div>
  );
}

function BadgeTile({
  item,
  copy,
  onOpen,
  highlight,
}: {
  item: CollectionItem;
  copy: BadgesCopy;
  onOpen: (id: string) => void;
  highlight: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const legendary = item.rarity === 'legendary';
  const epic = item.rarity === 'epic';
  const rarityLabel = RARITY_STYLES[item.rarity].label[copy.locale];
  const date = formatEarnedDate(item.earnedAt, copy, { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!highlight) return;
    const el = ref.current;
    if (!el) return;
    const t = window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const onPointerMove = legendary
    ? (e: PointerEvent<HTMLButtonElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--holo-x', `${((e.clientX - r.left) / r.width) * 100}%`);
        e.currentTarget.style.setProperty('--holo-y', `${((e.clientY - r.top) / r.height) * 100}%`);
      }
    : undefined;

  const edgeStyle: CSSProperties | undefined = epic
    ? { boxShadow: `inset 0 0 0 1px ${RARITY_STYLES.epic.edge}` }
    : legendary
      ? { boxShadow: `inset 0 0 0 1px ${RARITY_STYLES.legendary.edge}, 0 8px 24px -16px ${RARITY_STYLES.legendary.edge}` }
      : undefined;

  return (
    <button
      ref={ref}
      type="button"
      data-badge-id={item.id}
      aria-haspopup="dialog"
      aria-label={copy.tileAria(item.name, rarityLabel, date) + (item.isPinned ? `, ${copy.pinned}` : '') + (item.isNew ? `, ${copy.newBadge}` : '')}
      onClick={() => onOpen(item.id)}
      onPointerMove={onPointerMove}
      className={cn(
        'group relative flex h-full min-h-[9.5rem] w-full flex-col items-center gap-2 overflow-hidden rounded-card border border-subtle bg-surface-1 px-2 pb-3 pt-4 text-center',
        'transition-[transform,box-shadow] duration-fast ease-standard motion-safe:hover:-translate-y-0.5 hover:qx-elevation-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        highlight && 'ring-2 ring-brand ring-offset-2 ring-offset-background',
      )}
      style={edgeStyle}
    >
      {legendary && <HoloFoil />}
      {item.isNew && (
        <span className="qx-caption absolute left-1.5 top-1.5 rounded-chip bg-brand px-1.5 py-0.5 font-semibold text-brand-fg">
          {copy.newBadge}
        </span>
      )}
      {item.isPinned && (
        <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-brand-subtle text-brand" title={copy.pinned}>
          <Pin aria-hidden className="size-3.5" />
        </span>
      )}
      {/* Yeni kazanılan rozet: madalyonda tek seferlik parlama süpürmesi (CSS; azaltılmışta yok). */}
      <span className={cn('rounded-full', item.isNew && 'qx-fx-medal')}>
        <BadgeGlyph label={item.name} imageSrc={item.thumb} rarity={item.rarity} color={item.color ?? undefined} size="lg" aria-hidden />
      </span>
      <span className="qx-small line-clamp-2 min-h-[2.5em] font-semibold leading-tight text-fg">{item.name}</span>
      {item.rarity !== 'common' && <RarityBadge rarity={item.rarity} locale={copy.locale} />}
    </button>
  );
}
