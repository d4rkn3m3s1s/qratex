'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, Loader2, PencilLine, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DetailSheet, StatusBadge } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import type { EvidenceItem, InsightsData, SentimentKey } from '@/lib/dealer-insights/types';
import { formatDateTime, useInsightsCopy } from './copy';
import { useCorrectSentiment, useEvidence, type EvidenceTarget } from './use-insights';

const SENTIMENT_TONE: Record<SentimentKey, 'success' | 'neutral' | 'danger' | 'info'> = {
  positive: 'success',
  neutral: 'neutral',
  negative: 'danger',
  pending: 'info',
};

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={i <= rating ? 'h-3.5 w-3.5 fill-current text-warning' : 'h-3.5 w-3.5 text-fg-subtle'} />
      ))}
    </span>
  );
}

function CorrectPopover({ item, onChanged }: { item: EvidenceItem; onChanged: () => void }) {
  const { copy } = useInsightsCopy();
  const [open, setOpen] = useState(false);
  const correct = useCorrectSentiment();
  const id = item.key.replace(/^qr-/, '');
  const current = item.sentiment === 'pending' ? null : item.sentiment;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
          <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />
          {copy.evidence.correct}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[min(22rem,calc(100vw-2rem))] space-y-3">
        <p id={`correct-${id}`} className="qx-small font-medium text-fg">
          {copy.evidence.correctTitle}
        </p>
        <ChoiceChips<'positive' | 'neutral' | 'negative'>
          aria-labelledby={`correct-${id}`}
          size="sm"
          disabled={correct.isPending}
          value={current}
          onChange={(v) => {
            if (!v || v === current) return;
            correct.mutate(
              { feedbackId: id, sentiment: v },
              {
                onSuccess: () => {
                  toast.success(copy.evidence.correctDone);
                  setOpen(false);
                  onChanged();
                },
                onError: (e) => toast.error(e instanceof Error && e.message ? e.message : copy.evidence.correctFailed),
              }
            );
          }}
          options={[
            { value: 'positive', label: copy.signals.sentimentLabel.positive },
            { value: 'neutral', label: copy.signals.sentimentLabel.neutral },
            { value: 'negative', label: copy.signals.sentimentLabel.negative },
          ]}
        />
        {correct.isPending && (
          <p className="flex items-center gap-1.5 qx-caption text-fg-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            {copy.evidence.loading}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EvidenceList({ data, target, onChanged }: { data: InsightsData; target: EvidenceTarget; onChanged: () => void }) {
  const { copy, tag } = useInsightsCopy();
  const q = useEvidence(data.query, target);
  const pages = q.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const total = pages[0]?.total ?? 0;
  return (
    <QueryState
      query={{ ...q, data: q.data ? items : undefined }}
      skeleton="list"
      empty={{ title: copy.evidence.empty, description: null, compact: true }}
      error={{ title: copy.evidence.error }}
      loadingLabel={copy.evidence.loading}
    >
      {() => (
        <div className="space-y-3">
          <p className="qx-caption text-fg-muted" aria-live="polite">
            {copy.evidence.total(total)}
          </p>
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.key} className="rounded-control border border-subtle bg-surface-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={it.rating} label={copy.evidence.rating(it.rating)} />
                  <StatusBadge
                    size="sm"
                    tone={SENTIMENT_TONE[it.sentiment]}
                    label={`${copy.signals.sentimentLabel[it.sentiment]} · ${copy.evidence.basis[it.sentimentBasis]}`}
                  />
                  {it.corrected && <span className="qx-caption text-brand">{copy.evidence.corrected}</span>}
                </div>
                <p className="mt-2 whitespace-pre-line break-words qx-small text-fg">
                  {it.preview ?? <span className="text-fg-muted">{copy.evidence.noText}</span>}
                </p>
                <p className="mt-1.5 qx-caption text-fg-muted">
                  {formatDateTime(it.createdAt, tag)}
                  {it.qrName ? ` · ${it.qrName}` : ''} · {it.replied ? copy.evidence.replied : copy.evidence.notReplied}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
                    <Link href={`/dealer/inbox?id=${encodeURIComponent(it.key)}`}>
                      <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                      {copy.evidence.openInInbox}
                    </Link>
                  </Button>
                  {data.canWrite && it.canCorrect && it.source === 'qr' && <CorrectPopover item={it} onChanged={onChanged} />}
                </div>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {q.isFetchingNextPage ? copy.evidence.loading : copy.evidence.loadMore}
            </Button>
          )}
        </div>
      )}
    </QueryState>
  );
}

/**
 * Kanıt çekmecesi: bir tema/öneri/varlığın arkasındaki geri bildirimler (sunucuda süzülür,
 * imleçle sayfalanır). Satır içi duygu düzeltme burada (eski geliştirici formunun yerine);
 * düzeltme geçmişi ve öğrenme profili Ayarlar → AI'da.
 */
export function EvidenceSheet({
  data,
  target,
  onClose,
  onChanged,
}: {
  data: InsightsData;
  target: EvidenceTarget | null;
  onClose: () => void;
  /** Düzeltme sonrası ana veriyi tazele (duygu dağılımı değişir). */
  onChanged: () => void;
}) {
  const { copy } = useInsightsCopy();
  const title = !target
    ? ''
    : target.kind === 'theme'
      ? copy.evidence.themeTitle(target.label)
      : target.kind === 'entity'
        ? copy.evidence.entityTitle(target.label)
        : copy.evidence.recTitle;
  return (
    <DetailSheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      id={target ? `${target.kind}:${target.key}` : null}
      title={title}
      description={target?.kind === 'rec' ? `“${target.label}” — ${copy.evidence.desc}` : copy.evidence.desc}
      size="lg"
    >
      {target ? <EvidenceList data={data} target={target} onChanged={onChanged} /> : null}
    </DetailSheet>
  );
}
