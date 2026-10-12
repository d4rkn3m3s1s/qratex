'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states';
import type { ClaimRewardResult, RewardDTO, RewardKind, RewardState } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { CatalogToolbar } from './catalog-toolbar';
import { RewardCard } from './reward-card';
import { RewardSheet } from './reward-sheet';
import { useShallowQuery } from './use-shallow-query';

type KindFilter = 'all' | RewardKind;
type SortKey = 'recommended' | 'costAsc' | 'costDesc' | 'new';

const PAGE = 24;
/** Önerilen sıra: alınabilir → hedef (puan eksik) → yakında → limit → tükendi → süresi doldu. */
const STATE_ORDER: Record<RewardState, number> = { available: 0, insufficient: 1, upcoming: 2, limitReached: 3, soldOut: 4, expired: 5 };

function isKind(v: string | null): v is RewardKind {
  return v === 'digital' || v === 'physical' || v === 'coupon' || v === 'other';
}
function isSort(v: string | null): v is SortKey {
  return v === 'recommended' || v === 'costAsc' || v === 'costDesc' || v === 'new';
}

export function RewardCatalog({
  rewards,
  balance,
  truncated,
  onClaimed,
  onRefresh,
}: {
  rewards: readonly RewardDTO[];
  balance: number;
  truncated: boolean;
  onClaimed: (r: ClaimRewardResult) => void;
  onRefresh: () => void;
}) {
  const copy = useWalletCopy();
  const url = useShallowQuery();
  const kindParam = url.get('kind');
  const kind: KindFilter = isKind(kindParam) ? kindParam : 'all';
  const sortParam = url.get('sort');
  const sort: SortKey = isSort(sortParam) ? sortParam : 'recommended';
  const affordable = url.get('can') === '1';
  const [q, setQ] = useState(url.get('q') ?? '');
  const query = useDeferredValue(q.trim().toLocaleLowerCase(copy.locale));
  const [limit, setLimit] = useState(PAGE);

  const kinds = useMemo(() => {
    const present = new Set(rewards.map((r) => r.kind));
    const order: RewardKind[] = ['coupon', 'digital', 'physical', 'other'];
    return [
      { value: 'all' as KindFilter, label: copy.filters.all },
      ...order.filter((k) => present.has(k)).map((k) => ({ value: k as KindFilter, label: copy.kind[k] })),
    ];
  }, [rewards, copy]);

  const visible = useMemo(() => {
    const list = rewards.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (affordable && r.state !== 'available') return false;
      if (query && !`${r.name} ${r.description}`.toLocaleLowerCase(copy.locale).includes(query)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === 'costAsc') sorted.sort((a, b) => a.cost - b.cost);
    else if (sort === 'costDesc') sorted.sort((a, b) => b.cost - a.cost);
    else if (sort === 'new') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else sorted.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.cost - b.cost);
    return sorted;
  }, [rewards, kind, affordable, query, sort, copy.locale]);

  const filtered = kind !== 'all' || affordable || !!query;
  const open = (id: string) => url.set({ reward: id }, 'push');

  if (rewards.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        icon={Gift}
        title={copy.emptyCatalogTitle}
        description={copy.emptyCatalogBody}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CatalogToolbar<KindFilter, SortKey>
        kindLabel={copy.filters.label}
        kinds={kinds}
        kind={kind}
        onKind={(k) => url.set({ kind: k === 'all' ? null : k })}
        affordableLabel={copy.filters.affordable}
        affordable={affordable}
        onAffordable={(v) => url.set({ can: v ? '1' : null })}
        sortLabel={copy.filters.sort}
        sorts={[
          { value: 'recommended', label: copy.filters.sortRecommended },
          { value: 'costAsc', label: copy.filters.sortCostAsc },
          { value: 'costDesc', label: copy.filters.sortCostDesc },
          { value: 'new', label: copy.filters.sortNew },
        ]}
        sort={sort}
        onSort={(s) => url.set({ sort: s === 'recommended' ? null : s })}
        searchLabel={copy.filters.search}
        clearSearchLabel={copy.filters.clearSearch}
        search={q}
        onSearch={(v) => {
          setQ(v);
          url.set({ q: v.trim() ? v : null });
        }}
      />

      {visible.length === 0 ? (
        <EmptyState
          variant="filtered"
          title={copy.emptyFilteredTitle}
          description={null}
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  url.set({ kind: null, can: null, q: null });
                }}
              >
                {copy.filters.clear}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="qx-fx-stagger grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={copy.rewardsTitle}>
            {visible.slice(0, limit).map((r) => (
              <li key={r.id} className="min-w-0">
                <RewardCard reward={r} balance={balance} onOpen={open} />
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
      {truncated && <p className="qx-caption text-center text-fg-muted">{copy.truncated}</p>}

      <RewardSheet rewards={rewards} balance={balance} onClaimed={onClaimed} onRefresh={onRefresh} />
    </div>
  );
}
