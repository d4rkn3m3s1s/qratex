'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { squadApi, squadKeys } from './api';
import { BattleResult } from './battle-card';
import { useKlanCopy } from './copy';

/** Savaş geçmişi — istek yalnız açılınca, imleçli "daha fazla" (10'ar). */
export function BattleHistory() {
  const copy = useKlanCopy();
  const [open, setOpen] = useState(false);
  const q = useInfiniteQuery({
    queryKey: squadKeys.history,
    queryFn: ({ pageParam }) => squadApi.history(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: open,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <SectionCard title={copy.historyTitle} icon={<History className="h-4 w-4" aria-hidden />} density="compact">
      {!open ? (
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)} aria-expanded={false}>
          {copy.historyShow}
        </Button>
      ) : (
        <QueryState
          query={{
            data: q.data ? items : undefined,
            error: q.error,
            isPending: q.isPending,
            isError: q.isError,
            isFetching: q.isFetching && !q.isFetchingNextPage,
            refetch: q.refetch,
          }}
          skeleton="list"
          isEmpty={(d) => d.length === 0}
          empty={{ title: copy.historyEmpty, description: null, compact: true }}
        >
          {(rows) => (
            <div className="space-y-3">
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.id} className="border-b border-subtle pb-3 last:border-0 last:pb-0">
                    <BattleResult result={r} compact />
                  </li>
                ))}
              </ul>
              {q.hasNextPage ? (
                <Button variant="outline" className="w-full" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                  {copy.historyMore}
                </Button>
              ) : null}
            </div>
          )}
        </QueryState>
      )}
    </SectionCard>
  );
}
