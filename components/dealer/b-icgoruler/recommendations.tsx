'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ListPlus, ListTodo, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import type { InsightsData, Recommendation, RecPriority } from '@/lib/dealer-insights/types';
import type { RefHandlers } from './refs';
import { AddActionDialog } from './add-action-dialog';
import { useInsightsCopy } from './copy';

const PRIORITY_TONE: Record<RecPriority, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

/**
 * Birleşik öneri listesi (eski sayfada iki ayrı liste vardı, en eyleme dönük olanı en alttaydı).
 * Kaynak: tek tek geri bildirimlerin AI aksiyon önerileri; sıralama deterministik (kayıt sayısı ×
 * öncelik). Her satır: kaç kayıtta geçtiği + kaynak kayıtlar + "Aksiyona ekle" (atama/bitiş).
 */
export function Recommendations({ data, handlers, lang }: { data: InsightsData; handlers: RefHandlers; lang: 'tr' | 'en' }) {
  const { copy } = useInsightsCopy();
  const [target, setTarget] = useState<Recommendation | null>(null);
  const themeLabel = (key: string) => data.themes.find((t) => t.key === key)?.label ?? key;

  return (
    <SectionCard
      id="oneriler"
      title={copy.recs.title}
      description={copy.recs.desc}
      icon={<ListTodo className="h-4 w-4" aria-hidden />}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
          <Link href="/dealer/inbox/assigned">
            {copy.recs.goToList}
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      {data.recommendations.length === 0 ? (
        <p className="qx-small text-fg-muted">{copy.recs.none}</p>
      ) : (
        <ol className="-my-3 divide-y divide-subtle">
          {data.recommendations.map((r) => (
            <li key={r.id} className="py-3 sm:py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={copy.recs.priority[r.priority]} tone={PRIORITY_TONE[r.priority]} size="sm" />
                <span className="qx-caption text-fg-muted">{copy.recs.count(r.count)}</span>
                {r.themeKeys.length > 0 && (
                  <span className="qx-caption text-fg-muted">
                    · {copy.recs.themes}:{' '}
                    {r.themeKeys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && ', '}
                        <button
                          type="button"
                          className="rounded-chip font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          onClick={() => handlers.openTheme(k, themeLabel(k))}
                        >
                          {themeLabel(k)}
                        </button>
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <p className="mt-2 qx-body text-fg">{r.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => handlers.openRec(r.id, r.text)}
                >
                  <Quote className="mr-1.5 h-4 w-4" aria-hidden />
                  {copy.recs.evidence}
                </Button>
                {r.actionItemId ? (
                  <Link
                    href={`/dealer/inbox/assigned?q=${encodeURIComponent(r.text.slice(0, 60))}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-chip px-2 qx-small font-medium text-success underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {copy.recs.inList}
                  </Link>
                ) : (
                  data.canWrite && (
                    <Button type="button" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setTarget(r)}>
                      <ListPlus className="mr-1.5 h-4 w-4" aria-hidden />
                      {copy.recs.add}
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {data.canWrite && <AddActionDialog rec={target} data={data} lang={lang} onOpenChange={(o) => !o && setTarget(null)} />}
    </SectionCard>
  );
}
