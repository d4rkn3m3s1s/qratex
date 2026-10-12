'use client';

import { useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, EyeOff, Eye, MapPin, MessageSquareReply, Pin, PinOff, ShieldAlert, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { SectionCard } from '@/components/ds/page';
import { QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { DURATION, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { BlockReason, CurationFilter, CurationItemDto, WallStatus, WallVerdict } from '@/lib/dealer/voc-wall/config';
import { VOC_ROOT, curationKey, fetchCuration, setItemStatus, WallApiError } from './api';
import { relativeTime } from './wall-display';
import { useVocCopy, type VocCopy } from './copy';

const FILTERS: CurationFilter[] = ['all', 'live', 'pinned', 'hidden', 'blocked'];

function verdictChip(v: WallVerdict, c: VocCopy['curation']): { label: string; tone: Tone } {
  switch (v.state) {
    case 'pinned':
      return { label: c.pinnedLive, tone: 'brand' };
    case 'live':
      return { label: c.live, tone: 'success' };
    case 'hidden':
      return { label: c.hidden, tone: 'neutral' };
    default:
      return { label: c.reason[v.reason as BlockReason], tone: v.safety ? 'danger' : 'warning' };
  }
}

export function CurationList({ qrCodeId, canModerate }: { qrCodeId: string | null; canModerate: boolean }) {
  const [filter, setFilter] = useState<CurationFilter>('all');
  const [page, setPage] = useState(1);
  const copy = useVocCopy();
  const c = copy.curation;
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const query = useQuery({
    queryKey: curationKey(filter, page, qrCodeId),
    queryFn: () => fetchCuration(filter, page, qrCodeId),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WallStatus }) => setItemStatus(id, status),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'pinned' ? c.pinnedToast : v.status === 'hidden' ? c.hiddenToast : c.autoToast);
      void qc.invalidateQueries({ queryKey: VOC_ROOT });
    },
    onError: (e) => toast.error(e instanceof WallApiError ? e.message : copy.common.actionFailed),
  });

  return (
    <SectionCard
      title={c.title}
      description={c.hint}
      actions={
        <ChoiceChips
          aria-label={copy.common.statusFilter}
          size="sm"
          scroll
          options={FILTERS.map((f) => ({ value: f, label: c.filter[f] }))}
          value={filter}
          onChange={(v) => {
            setFilter(v ?? 'all');
            setPage(1);
          }}
        />
      }
    >
      <QueryState
        query={query}
        skeleton="list"
        isEmpty={(d) => d.items.length === 0}
        empty={{
          variant: filter === 'all' ? 'default' : 'filtered',
          title: filter === 'all' ? c.emptyAll : c.emptyFiltered,
          description:
            filter === 'all'
              ? c.emptyAllHint
              : c.emptyFilteredHint,
        }}
        showRefreshing
      >
        {(data) => (
          <>
            <ul className="divide-y divide-subtle" aria-busy={query.isFetching}>
              <AnimatePresence initial={false}>
                {data.items.map((item) => (
                  <m.li
                    key={item.id}
                    layout={!policy.reduce}
                    initial={false}
                    exit={policy.reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={policy.transition({ duration: DURATION.base })}
                  >
                    <CurationRow
                      item={item}
                      canModerate={canModerate}
                      busy={mutation.isPending && mutation.variables?.id === item.id}
                      onSet={(status) => mutation.mutate({ id: item.id, status })}
                    />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            {(page > 1 || data.hasMore) && (
              <nav className="mt-4 flex items-center justify-between gap-2" aria-label={copy.common.pagination}>
                <Button variant="outline" size="sm" className="min-h-11" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft aria-hidden className="mr-1 h-4 w-4" /> {copy.common.prev}
                </Button>
                <span className="qx-caption text-fg-muted">{copy.common.page(page)}</span>
                <Button variant="outline" size="sm" className="min-h-11" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
                  {copy.common.next} <ChevronRight aria-hidden className="ml-1 h-4 w-4" />
                </Button>
              </nav>
            )}
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}

function CurationRow({
  item,
  canModerate,
  busy,
  onSet,
}: {
  item: CurationItemDto;
  canModerate: boolean;
  busy: boolean;
  onSet: (s: WallStatus) => void;
}) {
  const copy = useVocCopy();
  const c = copy.curation;
  const chip = verdictChip(item.verdict, c);
  const safety = item.verdict.state === 'blocked' && item.verdict.safety;
  const pinned = item.verdict.state === 'pinned';
  const hidden = item.verdict.state === 'hidden';
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-0.5" role="img" aria-label={c.stars(item.rating)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} aria-hidden className={cn('h-3.5 w-3.5', i <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-fg-subtle')} />
            ))}
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[chip.tone])}>
            {safety && <ShieldAlert aria-hidden className="h-3 w-3" />}
            {chip.label}
          </span>
          {item.intent && c.intent[item.intent] && (
            <span className="rounded-full border border-subtle px-2 py-0.5 text-xs text-fg-muted">{c.intent[item.intent]}</span>
          )}
          {item.themes.map((t) => (
            <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">
              {t}
            </span>
          ))}
        </div>
        <p className={cn('qx-body break-words', item.text ? 'text-fg' : 'italic text-fg-muted')}>{item.text ?? c.ratingOnly}</p>
        <p className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <span>{item.name ?? c.anonymous}</span>
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3 w-3" /> {item.location}
            </span>
          )}
          <time dateTime={item.createdAt}>{relativeTime(item.createdAt, Date.now(), copy)}</time>
          {item.replied && (
            <span className="inline-flex items-center gap-1 text-success">
              <MessageSquareReply aria-hidden className="h-3 w-3" /> {c.replied}
            </span>
          )}
        </p>
      </div>
      {canModerate && (
        <div className="flex shrink-0 gap-2">
          {safety ? (
            <p className="qx-caption max-w-[14rem] text-fg-muted">{c.safetyBlocked}</p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy || hidden}
                onClick={() => onSet(pinned ? 'auto' : 'pinned')}
                aria-label={pinned ? c.unpin : c.pinAria}
              >
                {pinned ? <PinOff aria-hidden className="h-4 w-4 sm:mr-1" /> : <Pin aria-hidden className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{pinned ? c.unpin : c.pin}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy}
                onClick={() => onSet(hidden ? 'auto' : 'hidden')}
                aria-label={hidden ? c.showAria : c.hideAria}
              >
                {hidden ? <Eye aria-hidden className="h-4 w-4 sm:mr-1" /> : <EyeOff aria-hidden className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{hidden ? c.show : c.hide}</span>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
