'use client';

import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { qs } from '../lib/api';
import { API, useCursorList } from '../lib/queries';

type AuditRow = { id: string; at: string; actorName: string; entity: string; target: string | null; action: string };

/** Ekip yönetimi değişiklik geçmişi (kim, kimi, ne zaman) — audit zaten yazılıyordu, görüntüleyicisi yoktu. */
export function AuditPanel() {
  const list = useCursorList<AuditRow>(['team', 'audit'], (cursor) => `${API}/audit${qs({ cursor })}`);
  const items = (list.data?.pages ?? []).flatMap((p) => p.items);
  return (
    <QueryState query={{ ...list, data: list.data ? { items } : undefined }} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Henüz değişiklik yok' }}>
      {() => (
        <div className="space-y-3">
          <Timeline
            groupByDay
            ariaLabel="Ekip değişiklik geçmişi"
            events={items.map((r) => ({
              id: r.id,
              at: r.at,
              title: `${r.entity}${r.target ? ` "${r.target}"` : ''} · ${r.action}`,
              actor: r.actorName,
            }))}
          />
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
              </Button>
            </div>
          )}
        </div>
      )}
    </QueryState>
  );
}
