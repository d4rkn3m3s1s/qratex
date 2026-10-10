'use client';

import { useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states';
import type { CosmeticType, CosmeticsCatalogDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { CatalogToolbar } from './catalog-toolbar';
import { CosmeticCard } from './cosmetic-card';
import { CosmeticSheet } from './cosmetic-sheet';
import { useShallowQuery } from './use-shallow-query';

type Filter = 'all' | 'mine' | CosmeticType;
type SortKey = 'rarity' | 'costAsc' | 'costDesc' | 'new';
const PAGE = 24;
const TYPE_ORDER: CosmeticType[] = ['avatar_frame', 'profile_badge', 'profile_background', 'other'];

export function CosmeticsCatalog({
  catalog,
  balance,
  onBalance,
  onRefresh,
}: {
  catalog: CosmeticsCatalogDTO;
  balance: number;
  onBalance: (n: number) => void;
  onRefresh: () => void;
}) {
  const copy = useWalletCopy();
  const url = useShallowQuery();
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const m = new Map<CosmeticType, number>();
    for (const i of catalog.items) m.set(i.type, (m.get(i.type) ?? 0) + 1);
    return m;
  }, [catalog.items]);
  const ownedCount = catalog.items.filter((i) => i.owned).length;

  // Boş kategori sekmede GÖSTERİLMEZ (eskiden "Arka planlar" hep boş açılıyordu).
  const filters = useMemo(
    () => [
      { value: 'all' as Filter, label: `${copy.filters.all} · ${catalog.items.length}` },
      ...(ownedCount > 0 ? [{ value: 'mine' as Filter, label: `${copy.cosmetics.owned} · ${ownedCount}` }] : []),
      ...TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({ value: t as Filter, label: `${copy.cosmetics.types[t]} · ${counts.get(t)}` })),
    ],
    [catalog.items.length, counts, ownedCount, copy]
  );

  const raw = url.get('ctype');
  const filter: Filter = filters.some((f) => f.value === raw) ? (raw as Filter) : 'all';
  const sortRaw = url.get('csort');
  const sort: SortKey = sortRaw === 'costAsc' || sortRaw === 'costDesc' || sortRaw === 'new' ? sortRaw : 'rarity';
  const affordable = url.get('ccan') === '1';

  const visible = useMemo(() => {
    const list = catalog.items.filter((i) => {
      if (filter === 'mine' && !i.owned) return false;
      if (filter !== 'all' && filter !== 'mine' && i.type !== filter) return false;
      if (affordable && (i.owned || i.price > balance)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === 'costAsc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'costDesc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'new') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // 'rarity' = sunucu sırası (kademe ↓, fiyat ↓)
    return sorted;
  }, [catalog.items, filter, affordable, balance, sort]);

  const open = (id: string) => url.set({ item: id }, 'push');

  if (catalog.items.length === 0) {
    return <EmptyState variant="first-use" icon={Palette} title={copy.cosmetics.emptyTitle} description={copy.cosmetics.emptyBody} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CatalogToolbar<Filter, SortKey>
        kindLabel={copy.filters.label}
        kinds={filters}
        kind={filter}
        onKind={(k) => url.set({ ctype: k === 'all' ? null : k })}
        affordableLabel={copy.filters.affordable}
        affordable={affordable}
        onAffordable={(v) => url.set({ ccan: v ? '1' : null })}
        sortLabel={copy.filters.sort}
        sorts={[
          { value: 'rarity', label: copy.filters.sortRarity },
          { value: 'costAsc', label: copy.filters.sortCostAsc },
          { value: 'costDesc', label: copy.filters.sortCostDesc },
          { value: 'new', label: copy.filters.sortNew },
        ]}
        sort={sort}
        onSort={(s) => url.set({ csort: s === 'rarity' ? null : s })}
        trailing={
          <p className="qx-small ml-auto text-fg-muted" title={copy.cosmetics.pinsHint}>
            {copy.cosmetics.pins(catalog.pinsUsed, catalog.pinLimit)}
          </p>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          variant="filtered"
          title={copy.cosmetics.emptyTypeTitle}
          description={null}
          action={
            <Button variant="outline" onClick={() => url.set({ ctype: null, ccan: null })}>
              {copy.filters.clear}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={copy.tabs.cosmetics}>
            {visible.slice(0, limit).map((item) => (
              <li key={item.id} className="min-w-0">
                <CosmeticCard item={item} balance={balance} preview={catalog.preview} onOpen={open} />
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
                {copy.showMore(Math.min(PAGE, visible.length - limit))}
              </Button>
            </div>
          )}
        </>
      )}

      <CosmeticSheet catalog={catalog} balance={balance} onBalance={onBalance} onRefresh={onRefresh} />
    </div>
  );
}
