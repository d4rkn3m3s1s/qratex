'use client';

/**
 * "Anlamca ara (AI)": arama kutusundaki ifadeye anlamca benzeyen QR geri bildirimleri
 * (embedding benzerliği). Anahtar kelime aramasının yanında isteğe bağlı; sonuçlar benzerlik
 * yüzdesiyle listelenir, basınca detay çekmecesi açılır.
 */
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/states';
import { formatPercent, formatRelative, postSemantic } from './api';
import { useInboxCopy, useInboxLocale } from './copy';
import { RatingStars, SentimentChip } from './parts';

export function SemanticSearch({ query, onOpen }: { query: string; onOpen: (key: string) => void }) {
  const copy = useInboxCopy();
  const locale = useInboxLocale();
  const run = useMutation({ mutationFn: () => postSemantic(query) });

  return (
    <div className="space-y-2 rounded-card border border-dashed border-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-9 sm:min-h-9" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden className="h-4 w-4" />}
          {copy.semanticRun(query)}
        </Button>
        <span className="qx-caption text-fg-muted">{copy.semanticHint}</span>
      </div>
      {run.isError ? <InlineError>{run.error instanceof Error ? run.error.message : copy.actionFailed}</InlineError> : null}
      {run.data ? (
        run.data.results.length === 0 ? (
          <p className="qx-small text-fg-muted" aria-live="polite">
            {copy.semanticEmpty}
          </p>
        ) : (
          <ul aria-label={copy.semanticResults} aria-live="polite" className="space-y-1">
            {run.data.results.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onOpen(r.key)}
                  className="flex min-h-11 w-full items-start gap-3 rounded-control px-2 py-1.5 text-left transition-colors duration-fast hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="qx-caption qx-num mt-0.5 w-12 shrink-0 rounded-chip bg-brand-subtle px-1.5 py-0.5 text-center font-semibold text-brand">
                    {formatPercent(r.score, locale)}
                    <span className="sr-only"> {copy.semanticScore}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <RatingStars rating={r.rating} />
                      <SentimentChip sentiment={r.sentiment} />
                      <span suppressHydrationWarning className="qx-caption text-fg-muted">
                        {formatRelative(r.createdAt, locale)}
                      </span>
                    </span>
                    <span className="qx-small line-clamp-2 text-fg">{r.textPreview ?? copy.noText}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
