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
import { useSourceT } from '@/components/ds/page/source-dict';
import { PROMPT_STUDIO_DICT, usePromptStudioCopy } from './copy';

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
  const L = useSourceT(PROMPT_STUDIO_DICT);
  const ux = usePromptStudioCopy().ui;
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
    <SectionCard title={ux.degisiklikGecmisi} description={ux.promptNotlariOgrenmeOnaylari} icon={<History />}>
      <div className="space-y-4">
        <ChoiceChips aria-label={ux.kayitTuru} options={ENTITY_OPTIONS.map((o) => ({ ...o, label: L(o.label) }))} value={entity} onChange={(v) => v && setEntity(v)} size="sm" scroll />
        <QueryState
          query={{ ...q, data: q.data ? items : undefined }}
          skeleton="list"
          isEmpty={(d) => d.length === 0}
          empty={{ compact: true, title: ux.kayitYok, description: ux.buTurdeHenuzDegisiklik }}
          error={{ title: ux.gecmisYuklenemedi }}
        >
          {() => (
            <>
              <Timeline
                groupByDay
                timeStyle="time"
                ariaLabel={ux.studyoDegisiklikGecmisi}
                events={items.map((e) => ({ id: e.id, title: e.summary, at: e.at, actor: actorName(e.actor), meta: e.entityId ? <code className="text-xs">{e.entityId}</code> : undefined }))}
              />
              {q.hasNextPage ? (
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                  {q.isFetchingNextPage ? ux.yukleniyor : ux.dahaEskiKayitlar}
                </Button>
              ) : null}
            </>
          )}
        </QueryState>
      </div>
    </SectionCard>
  );
}
