'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y/choice-chips';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { CommandEvent, EventActor } from '@/lib/admin-command/types';
import { useCommandEvents } from './use-command';
import { formatDateTime } from './format';
import { AdminKomutaText, relativeFor, useAdminKomutaCopy } from './copy';

const ACTOR_VALUES: EventActor[] = ['all', 'admin', 'dealer', 'customer', 'system'];

const KIND_DOT: Record<CommandEvent['actorKind'], string> = {
  admin: 'bg-brand',
  dealer: 'bg-info',
  customer: 'bg-success',
  system: 'bg-fg-muted',
};


/**
 * Son olaylar: denetim kayıtları insan diliyle ("Ayşe ayarları güncelledi"), aktör
 * filtreli (yönetimsel değişiklik müşteri eylemlerinden ayrılır — platform-pulse B5),
 * imleçli sayfalama. Ham kod ipucunda; tam kayıt ve fark görünümü denetim günlüğünde.
 */
export function EventsFeed() {
  const c = useAdminKomutaCopy();
  const ACTOR_OPTIONS = ACTOR_VALUES.map((value) => ({ value, label: c.actorOptions[value] }));
  const [actor, setActor] = useState<EventActor>('all');
  const q = useCommandEvents(actor);
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];

  return (
    <div className="space-y-3">
      <ChoiceChips
        aria-label={c.filterActors}
        size="sm"
        scroll
        options={ACTOR_OPTIONS}
        value={actor}
        onChange={(v) => setActor((v as EventActor | null) ?? 'all')}
      />
      <QueryState
        query={{ data: q.data ? events : undefined, error: q.error, isLoading: q.isLoading, isFetching: q.isFetching, refetch: q.refetch }}
        skeleton="list"
        isEmpty={(d) => d.length === 0}
        empty={{ title: c.noEventsTitle, description: c.noEventsDesc, compact: true }}
        onRetry={() => void q.refetch()}
      >
        <ol className="divide-y divide-border" aria-label={c.events}>
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 py-2.5">
              <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.actorKind])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg" title={`${e.rawAction} · ${e.rawEntity}${e.entityId ? ` · ${e.entityId}` : ''}`}>
                  <span className="font-medium">{e.actorName}</span> <span className="text-fg-muted">{e.verb}:</span>{' '}
                  <span>{e.entityLabel}</span>
                </p>
                <p className="text-xs text-fg-muted">
                  <span className="sr-only"><AdminKomutaText k="actorType" /> </span>
                  {c.actorKind[e.actorKind]} ·{' '}
                  <time dateTime={e.at} title={formatDateTime(e.at)}>
                    {relativeFor(e.at, c.locale)}
                  </time>
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {q.hasNextPage ? (
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? c.loading : c.showMore}
            </Button>
          ) : (
            <span className="text-xs text-fg-muted">{c.endOfList}</span>
          )}
          <Link
            href="/admin/audit"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {c.auditLog} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </QueryState>
    </div>
  );
}
