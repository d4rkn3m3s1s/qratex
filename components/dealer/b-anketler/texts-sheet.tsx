'use client';

import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, QueryState } from '@/components/states';
import type { SurveyRange } from '@/lib/dealer-surveys/types';
import { fetchSurveyTexts, surveyKeys } from './api';
import { formatDateTime, useSurveyCopy } from './copy';

/**
 * Açık uçlu bir sorunun TÜM yanıtları — imleçli sayfa + arama (denetim results #7: kart
 * "340 yanıt" derken yalnız son 20'yi gösteriyor, gerisine ulaşılamıyordu).
 */
export function TextsSheet({
  surveyId,
  question,
  range,
  onClose,
}: {
  surveyId: string;
  question: { questionId: string; text: string } | null;
  range: SurveyRange;
  onClose: () => void;
}) {
  const { copy, tag } = useSurveyCopy();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const searchId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!question) {
      setQ('');
      setDebounced('');
    }
  }, [question]);

  const qid = question?.questionId ?? '';
  const query = useInfiniteQuery({
    queryKey: surveyKeys.texts(surveyId, qid, range, debounced),
    queryFn: ({ pageParam }) => fetchSurveyTexts(surveyId, qid, range, debounced, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!question,
    staleTime: 30_000,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? null;

  return (
    <Sheet open={!!question} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{copy.textsSheetTitle}</SheetTitle>
          <SheetDescription className="break-words">{question?.text}</SheetDescription>
        </SheetHeader>

        <div className="space-y-1.5">
          <Label htmlFor={searchId}>{copy.textsSearch}</Label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <Input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.textsSearchPlaceholder} className="h-11 pl-9" maxLength={100} />
          </div>
          {total != null && (
            <p className="qx-caption text-fg-muted tabular-nums" aria-live="polite">
              {copy.textsTotal(total)}
            </p>
          )}
        </div>

        <QueryState
          query={{ ...query, data: query.data ? items : undefined }}
          skeleton="list"
          isEmpty={(d) => d.length === 0}
          empty={<EmptyState title={debounced ? copy.textsNoMatch : copy.noTexts} description={null} compact headingLevel="p" />}
        >
          {(rows) => (
            <div className="space-y-3">
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-control border border-subtle bg-surface-2 p-3">
                    <p className="qx-small whitespace-pre-line break-words text-fg">{r.text}</p>
                    <p className="qx-caption mt-1 text-fg-muted">
                      <time dateTime={r.at}>{formatDateTime(r.at, tag)}</time>
                    </p>
                  </li>
                ))}
              </ul>
              {query.hasNextPage && (
                <Button variant="outline" className="min-h-11 w-full" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                  {copy.loadMore}
                </Button>
              )}
            </div>
          )}
        </QueryState>
      </SheetContent>
    </Sheet>
  );
}
