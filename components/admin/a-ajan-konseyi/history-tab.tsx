'use client';

import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Loader2, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { useUrlState } from '@/components/ds/page';
import { EmptyState, QueryState } from '@/components/states';
import { STATUS_LABEL, agentLabel, scopeLabel, type SessionPage, type SessionStatus } from '@/lib/council/contract';
import { councilKeys, fetchSessions } from './api';
import { AgentAvatar, RelativeTime, SessionStatusBadge } from './parts';
import { AdminAjanKonseyiText } from './copy';

const FILTERS = ['all', 'running', 'completed', 'failed', 'cancelled', 'archived'] as const;
type Filter = (typeof FILTERS)[number];

/** Geçmiş: arama + durum filtresi (URL'de) + imleçli "daha fazla yükle". */
export function HistoryTab({ initial, onOpenSession }: { initial: SessionPage | null; onOpenSession: (id: string) => void }) {
  const searchId = useId();
  const url = useUrlState();
  const status = (FILTERS as readonly string[]).includes(url.get('durum') ?? '') ? (url.get('durum') as Filter) : 'all';
  const q = url.get('q') ?? '';
  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next = term.trim();
      if (next !== q && (next.length === 0 || next.length >= 2)) url.set({ q: next || null });
    }, 300);
    return () => clearTimeout(t);
  }, [term, q, url]);

  const base = new URLSearchParams({ limit: '20', status, ...(q ? { q } : {}) }).toString();
  const isDefault = status === 'all' && !q;
  const list = useInfiniteQuery({
    queryKey: councilKeys.sessions(base),
    queryFn: ({ pageParam }) => fetchSessions(pageParam ? `${base}&cursor=${encodeURIComponent(pageParam)}` : base),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: isDefault && initial ? { pages: [initial], pageParams: [''] } : undefined,
    staleTime: 15_000,
  });

  const counts = list.data?.pages[0]?.counts;
  const total = counts ? (Object.entries(counts) as Array<[SessionStatus, number]>).filter(([k]) => k !== 'archived').reduce((a, [, v]) => a + v, 0) : undefined;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SectionCard title="Oturum geçmişi" headingLevel="h2" icon={<History aria-hidden />} density="compact" description="Her konsey oturumu kalıcıdır: transkript, karar ve yayınlanan aksiyonlar.">
      <div className="space-y-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Soru metninde ara
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            id={searchId}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Soru metninde ara (en az 2 karakter)"
            className="h-11 w-full rounded-md border border-border bg-surface-1 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
        <ChoiceChips
          aria-label="Durum filtresi"
          size="sm"
          scroll
          options={FILTERS.map((f) => {
            const c = f === 'all' ? total : counts?.[f];
            const label = f === 'all' ? 'Tümü' : STATUS_LABEL[f];
            return { value: f, label: c != null ? `${label} (${c})` : label, textLabel: label };
          })}
          value={status}
          onChange={(v) => url.set({ durum: v && v !== 'all' ? v : null })}
        />

        <QueryState
          query={{ ...list, data: list.data ? { items } : undefined }}
          skeleton="list"
          isEmpty={(d) => d.items.length === 0}
          empty={
            isDefault ? (
              <EmptyState variant="first-use" title="Henüz konsey oturumu yok" description="“Oturum” sekmesinden ilk soruyu sorun; tamamlanan her oturum burada listelenir." />
            ) : (
              <EmptyState
                variant="filtered"
                title="Eşleşen oturum yok"
                action={
                  <Button variant="outline" onClick={() => url.set({ q: null, durum: null })}>
                    Filtreleri temizle
                  </Button>
                }
              />
            )
          }
        >
          {() => (
            <>
              <ol className="divide-y divide-border">
                {items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(s.id)}
                      className="group flex w-full min-h-11 items-start gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {s.winner ? <AgentAvatar agent={s.winner} size="sm" /> : <span aria-hidden className="h-7 w-7 shrink-0 rounded-full bg-surface-muted" />}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-medium text-fg group-hover:underline">{s.topic}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                          <SessionStatusBadge status={s.status} />
                          <span>{scopeLabel(s.scope)}</span>
                          {s.winner ? (
                            <span>
                              Öne çıkan: {agentLabel(s.winner)}
                              {s.confidence != null ? ` · güven %${Math.round(s.confidence * 100)}` : ''}
                            </span>
                          ) : null}
                          {s.publishedCount ? (
                            <span className="inline-flex items-center gap-1">
                              <Send aria-hidden className="h-3 w-3" /> {s.publishedCount} aksiyon yayınlandı
                            </span>
                          ) : null}
                          {s.legacy ? <span><AdminAjanKonseyiText k="legacyFormat" /></span> : null}
                          <span>
                            {s.createdByName ?? 'Bilinmeyen yönetici'} · <RelativeTime iso={s.createdAt} />
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {list.hasNextPage ? (
                <div className="pt-3 text-center">
                  <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                    {list.isFetchingNextPage ? <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
                    Daha fazla yükle
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </QueryState>
      </div>
    </SectionCard>
  );
}
