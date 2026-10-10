'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { UserRound, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/components/states';
import { StatusBadge } from '@/components/ds/data';
import type { SurveyRange } from '@/lib/dealer-surveys/types';
import { fetchSurveyResponses, surveyKeys } from './api';
import { formatDateTime, useSurveyCopy } from './copy';

/**
 * Tekil yanıtlar (Google Forms "Bireysel" karşılığı) — imleçli sayfa. Kişisel kimlik
 * gösterilmez; yalnız üye/anonim ayrımı (KVKK).
 */
export function ResponsesList({ surveyId, range }: { surveyId: string; range: SurveyRange }) {
  const { copy, tag } = useSurveyCopy();
  const query = useInfiniteQuery({
    queryKey: surveyKeys.responses(surveyId, range),
    queryFn: ({ pageParam }) => fetchSurveyResponses(surveyId, range, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
  const items = query.data?.pages.flatMap((p) => p.items);

  return (
    <QueryState
      query={{ ...query, data: items }}
      skeleton="list"
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title={copy.responsesEmpty} description={null} compact headingLevel="p" />}
    >
      {(rows) => (
        <div className="space-y-3">
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-2">
                  <p className="qx-small font-semibold text-fg">
                    <time dateTime={r.createdAt}>{formatDateTime(r.createdAt, tag)}</time>
                  </p>
                  <StatusBadge size="sm" tone={r.member ? 'brand' : 'neutral'} icon={r.member ? UserRound : UserX} label={r.member ? copy.member : copy.anonymous} />
                </div>
                {r.answers.length === 0 ? (
                  <p className="qx-small mt-2 text-fg-muted">{copy.noAnswerInResponse}</p>
                ) : (
                  <dl className="mt-2 space-y-2">
                    {r.answers.map((a) => (
                      <div key={a.questionId} className="grid gap-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-3">
                        <dt className="qx-caption break-words text-fg-muted">{a.question}</dt>
                        <dd className="qx-small whitespace-pre-line break-words text-fg">{a.display}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
          {query.hasNextPage && (
            <Button variant="outline" className="min-h-11 w-full" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {copy.loadMore}
            </Button>
          )}
        </div>
      )}
    </QueryState>
  );
}
