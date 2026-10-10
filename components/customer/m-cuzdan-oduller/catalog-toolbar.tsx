'use client';

import { useId, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { ChoiceChips, type ChoiceOption } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';

/**
 * Katalog araç çubuğu: tür çipleri + "alabileceklerim" anahtarı + sıralama + arama.
 * Durum URL'de (sayfa paylaşılır, yenilemede kalır) — çağıran `useUrlState` ile bağlar.
 */
export function CatalogToolbar<K extends string, S extends string>({
  kindLabel,
  kinds,
  kind,
  onKind,
  affordableLabel,
  affordable,
  onAffordable,
  sortLabel,
  sorts,
  sort,
  onSort,
  searchLabel,
  clearSearchLabel,
  search,
  onSearch,
  trailing,
}: {
  kindLabel: string;
  kinds: ReadonlyArray<ChoiceOption<K>>;
  kind: K;
  onKind: (k: K) => void;
  affordableLabel: string;
  affordable: boolean;
  onAffordable: (v: boolean) => void;
  sortLabel: string;
  sorts: ReadonlyArray<{ value: S; label: string }>;
  sort: S;
  onSort: (s: S) => void;
  searchLabel?: string;
  clearSearchLabel?: string;
  search?: string;
  onSearch?: (q: string) => void;
  trailing?: ReactNode;
}) {
  const sortId = useId();
  const searchId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChoiceChips<K>
        aria-label={kindLabel}
        options={kinds}
        value={kind}
        onChange={(v) => onKind((v ?? kinds[0]!.value) as K)}
        size="sm"
        scroll
        register="ops"
      />
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <div className="relative min-w-0 flex-1 basis-48">
            <label htmlFor={searchId} className="sr-only">
              {searchLabel}
            </label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              id={searchId}
              type="search"
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchLabel}
              className="qx-small h-11 w-full rounded-control border border-subtle bg-surface-1 pl-9 pr-9 text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearch('')}
                aria-label={clearSearchLabel ?? searchLabel}
                className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-control text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        )}
        <button
          type="button"
          aria-pressed={affordable}
          onClick={() => onAffordable(!affordable)}
          className={cn(
            'qx-small inline-flex min-h-11 items-center gap-2 rounded-control border px-3 font-medium transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            affordable ? 'border-brand-border bg-brand-subtle text-brand' : 'border-subtle bg-surface-1 text-fg hover:border-strong'
          )}
        >
          <span
            aria-hidden
            className={cn(
              'relative inline-block h-4 w-7 rounded-full transition-colors duration-fast',
              affordable ? 'bg-brand' : 'bg-surface-muted ring-1 ring-inset ring-border'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3 rounded-full bg-surface-1 shadow transition-[left] duration-fast',
                affordable ? 'left-3.5' : 'left-0.5'
              )}
            />
          </span>
          {affordableLabel}
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="qx-small text-fg-muted">
            {sortLabel}
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => onSort(e.target.value as S)}
            className="qx-small h-11 rounded-control border border-subtle bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {trailing}
      </div>
    </div>
  );
}
