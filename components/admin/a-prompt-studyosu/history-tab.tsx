'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { Timeline } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { fetchHistory, studioKeys } from './api';
import { actorName } from './format';

const ENTITY_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'AIPromptNote', label: 'Prompt notları' },
  { value: 'AISystemLearning', label: 'Öğrenme' },
  { value: 'AITone', label: 'Üsluplar' },
  { value: 'AISettings', label: 'Bayi ayarları' },
  { value: 'AIDealerLearningProfile', label: 'Bayi profilleri' },
  { value: 'AIModelRouting', label: 'Modeller' },
];

/** Stüdyonun birleşik denetim geçmişi (İstanbul saati, imleçli). */
export default function HistoryTab() {
  const [entity, setEntity] = useState('all');
  const q = useInfiniteQuery({
    queryKey: studioKeys.history(entity),
    queryFn: ({ pageParam }) => fetchHistory(entity === 'all' ? '' : entity, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <SectionCard title="Değişiklik geçmişi" description="Prompt notları, öğrenme onayları, üsluplar, bayi AI ayarları ve model seçimi — kim, ne zaman, neden." icon={<History />}>
      <div className="space-y-4">
        <ChoiceChips aria-label="Kayıt türü" options={ENTITY_OPTIONS} value={entity} onChange={(v) => v && setEntity(v)} size="sm" scroll />
        <QueryState
          query={{ ...q, data: q.data ? items : undefined }}
          skeleton="list"
          isEmpty={(d) => d.length === 0}
          empty={{ compact: true, title: 'Kayıt yok', description: 'Bu türde henüz değişiklik yapılmamış.' }}
          error={{ title: 'Geçmiş yüklenemedi' }}
        >
          {() => (
            <>
              <Timeline
                groupByDay
                timeStyle="time"
                ariaLabel="Stüdyo değişiklik geçmişi"
                events={items.map((e) => ({ id: e.id, title: e.summary, at: e.at, actor: actorName(e.actor), meta: e.entityId ? <code className="text-xs">{e.entityId}</code> : undefined }))}
              />
              {q.hasNextPage ? (
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                  {q.isFetchingNextPage ? 'Yükleniyor…' : 'Daha eski kayıtlar'}
                </Button>
              ) : null}
            </>
          )}
        </QueryState>
      </div>
    </SectionCard>
  );
}
