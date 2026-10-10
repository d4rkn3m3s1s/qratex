'use client';

import { useId } from 'react';
import { Bot, ChevronRight, MessageSquareText, QrCode, Receipt, Send, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds/data';
import { TONE_STRIPE } from '@/components/states';
import { awaitingWaitTone } from '@/lib/dealer-queues/remedy-core';
import type { RemedyQueueItem } from '@/lib/dealer-queues/types';
import { Avatar, RatingStars, RelTime } from '../shared/ui';
import { useQueueLocale } from '../shared/copy';
import { useRemedyCopy } from './copy';
import { formatOption } from './options';

const SOURCE_ICON = { qr: QrCode, consumption: Receipt, personal: UserRound } as const;

export function RemedyRow({
  item,
  selectable,
  selected,
  onToggleSelect,
  onOpen,
  onPublish,
  onReject,
  busy,
  readOnly,
}: {
  item: RemedyQueueItem;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onPublish: () => void;
  onReject: () => void;
  busy: 'publish' | 'reject' | null;
  readOnly: boolean;
}) {
  const copy = useRemedyCopy();
  const locale = useQueueLocale();
  const titleId = useId();
  const awaiting = item.view === 'awaiting';
  const tone = awaiting ? awaitingWaitTone(item.createdAt) : 'neutral';
  const SourceIcon = SOURCE_ICON[item.source.kind];
  const name = item.customer.name;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative flex gap-3 overflow-hidden rounded-card border border-subtle bg-surface-1 p-3 sm:p-4 qx-elevation-1',
        selected && 'ring-2 ring-inset ring-brand-border'
      )}
    >
      {awaiting && tone !== 'neutral' ? (
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', TONE_STRIPE[tone === 'danger' ? 'danger' : 'warning'])} />
      ) : null}

      {selectable && !readOnly ? (
        <label className="-m-1 flex h-11 w-11 shrink-0 cursor-pointer items-start justify-center pt-2.5">
          <span className="sr-only">{copy.select(name)}</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="h-5 w-5 cursor-pointer rounded border-strong accent-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ) : (
        <Avatar name={name} />
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className="qx-body min-w-0 truncate font-semibold text-fg">
            <button
              type="button"
              onClick={onOpen}
              className="max-w-full truncate text-left hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copy.openFor(name)}
            >
              {name}
            </button>
          </h3>
          <RatingStars value={item.source.rating} />
          <span className="qx-caption inline-flex min-w-0 items-center gap-1 text-fg-muted">
            <SourceIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {copy.sourceKind[item.source.kind]}
              {item.source.placeLabel ? ` · ${item.source.placeLabel}` : ''}
            </span>
          </span>
        </div>

        {item.source.excerpt ? (
          <p className="qx-small line-clamp-2 text-fg-muted">
            <MessageSquareText aria-hidden className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-fg-subtle" />
            {item.source.excerpt}
          </p>
        ) : null}

        {item.options.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={copy.options}>
            {item.options.map((o) => (
              <li
                key={o.type}
                className={cn(
                  'qx-caption rounded-chip px-2 py-0.5 ring-1 ring-inset',
                  item.selection?.type === o.type ? 'bg-success-subtle text-success ring-success-border' : 'bg-brand-subtle text-brand ring-brand-border'
                )}
              >
                {formatOption(o, locale)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          {item.origin.auto ? (
            <StatusBadge size="sm" tone="info" icon={Bot} label={`${copy.auto}${item.origin.trigger ? ` · ${copy.trigger[item.origin.trigger]}` : ''}`} />
          ) : null}
          {item.view === 'awaiting' && (
            <span className={cn(tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : '')}>
              {copy.views.awaiting} · <RelTime iso={item.createdAt} />
            </span>
          )}
          {item.view === 'sent' && item.publishedAt && (
            <span>
              <Send aria-hidden className="mr-1 inline h-3 w-3" />
              {copy.views.sent} · <RelTime iso={item.publishedAt} />
            </span>
          )}
          {item.view === 'accepted' && (
            <>
              {item.selection ? <StatusBadge size="sm" tone="success" label={copy.selection(item.selection.label)} /> : null}
              {item.creditedPoints != null && item.creditedPoints > 0 ? <span>{copy.credited(item.creditedPoints)}</span> : null}
              {item.acceptedAt ? <RelTime iso={item.acceptedAt} /> : null}
            </>
          )}
          {item.view === 'closed' && (
            <>
              <StatusBadge
                size="sm"
                tone={item.status === 'expired' ? 'neutral' : 'danger'}
                label={item.status === 'expired' ? copy.expired : copy.rejected}
              />
              {item.reject?.reason ? <span>{copy.rejectReason[item.reject.reason]}</span> : null}
              {item.closedAt ? <RelTime iso={item.closedAt} /> : null}
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {awaiting && !readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onReject}
              disabled={busy !== null}
              loading={busy === 'reject'}
              aria-label={copy.rejectFor(name)}
              className="min-w-11 px-3"
            >
              <X aria-hidden className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{copy.reject}</span>
            </Button>
            <Button
              type="button"
              onClick={onPublish}
              disabled={busy !== null}
              loading={busy === 'publish'}
              aria-label={copy.publishFor(name)}
              className="min-w-11 px-3 shadow-none"
            >
              <Send aria-hidden className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{copy.publish}</span>
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="grid h-11 w-11 place-items-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copy.openFor(name)}
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
    </article>
  );
}
