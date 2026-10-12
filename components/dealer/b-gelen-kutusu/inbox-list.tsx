'use client';

/**
 * Gelen Kutusu listesi — kompakt kartlar: öncelik şeridi, puan, iki satır metin, en fazla birkaç
 * sinyal rozeti, kaynak, zaman. Satır seçimi (toplu işlem), klavye odağı (J/K), satıra basınca
 * detay çekmecesi. Hareket: yalnız durum değişimi (kayıt listeden çıkınca) — stagger yok.
 */
import { forwardRef } from 'react';
import { Camera, Eye, UserCheck } from 'lucide-react';
import { SelectionCheckbox } from '@/components/ds/data';
import { CollapseItem, CollapseList } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { InboxListItem } from '@/lib/dealer-inbox/types';
import { formatDateTime, formatRelative } from './api';
import { useInboxCopy, useInboxLocale } from './copy';
import { Chip, Initials, PRIORITY_STRIPE, RatingStars, SentimentChip, SignalChip, SlaChip, SourceIcon } from './parts';

type RowProps = {
  item: InboxListItem;
  selected: boolean;
  active: boolean;
  focused: boolean;
  selectable: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onOpen: (key: string) => void;
  onFocusRow: (key: string) => void;
};

const InboxRow = forwardRef<HTMLLIElement, RowProps>(function InboxRow(
  { item, selected, active, focused, selectable, onToggle, onOpen, onFocusRow },
  ref
) {
  const copy = useInboxCopy();
  const locale = useInboxLocale();
  const name = item.anonymous ? copy.anonymous : item.customerName ?? copy.unnamed;
  const unread = item.source === 'qr' && !item.viewedAt && item.status === 'new';
  // Sinyal rozetleri en fazla 2 görünür; fazlası "+N" (tümü title'da) — satır rozet duvarına dönmesin.
  const signals = [
    item.urgent && copy.badge.urgent,
    item.churnHigh && copy.badge.churn,
    item.trustFlagged && copy.badge.trust,
    item.toxic && copy.badge.toxic,
  ].filter((x): x is string => typeof x === 'string');

  return (
    <CollapseItem as="li" ref={ref} className="list-none">
      <div
        data-inbox-row={item.key}
        className={cn(
          'group relative mb-1.5 flex gap-3 rounded-card border bg-surface-1 py-3 pl-4 pr-3 transition-colors duration-fast ease-standard',
          active ? 'border-brand ring-1 ring-brand-border' : 'border-subtle hover:bg-surface-muted',
          focused && !active && 'ring-2 ring-ring',
          selected && 'bg-brand-subtle'
        )}
      >
        <span aria-hidden className={cn('absolute inset-y-2 left-1 w-1 rounded-full', PRIORITY_STRIPE[item.priority])} />
        {selectable ? (
          <div className="relative z-[1] flex items-start pt-2.5">
            <SelectionCheckbox checked={selected} onCheckedChange={(c) => onToggle(item.key, c)} aria-label={copy.selectRow(name)} />
          </div>
        ) : null}
        <Initials name={item.customerName} anonymous={item.anonymous} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onOpen(item.key)}
              onFocus={() => onFocusRow(item.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'qx-small min-w-0 truncate text-left font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-none',
                "after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
              )}
            >
              {name}
              <span className="sr-only">
                {' — '}
                {copy.openDetail}
              </span>
            </button>
            <RatingStars rating={item.rating} />
            {item.npsScore != null ? <span className="qx-caption qx-num text-fg-muted">{copy.nps(item.npsScore)}</span> : null}
            {unread ? (
              <span className="qx-caption inline-flex items-center gap-1 font-medium text-brand">
                <Eye aria-hidden className="h-3 w-3" />
                {copy.badge.unread}
              </span>
            ) : null}
            <time
              suppressHydrationWarning
              dateTime={item.createdAt}
              title={formatDateTime(item.createdAt, locale)}
              className="qx-caption ml-auto shrink-0 text-fg-muted"
            >
              {formatRelative(item.createdAt, locale)}
            </time>
          </div>

          <p className="qx-caption mt-0.5 flex min-w-0 items-center gap-1.5 text-fg-muted">
            <SourceIcon source={item.source} />
            <span className="truncate">
              {item.source === 'qr' ? copy.sourceQr : copy.sourceConsumption}
              {item.contextLabel ? ` · ${item.contextLabel}` : ''}
            </span>
          </p>

          <p className={cn('qx-small mt-1.5 line-clamp-2 break-words', item.textPreview ? 'text-fg' : 'italic text-fg-muted')}>
            {item.textPreview ?? copy.noText}
          </p>

          <div className="relative z-[1] mt-2 flex flex-wrap items-center gap-1.5">
            <SentimentChip sentiment={item.sentiment} />
            {item.status !== 'new' ? (
              <Chip tone={item.status === 'resolved' ? 'success' : 'info'}>{copy.status[item.status]}</Chip>
            ) : null}
            <SlaChip sla={item.sla} title={copy.slaDue(formatDateTime(item.sla.dueAt, locale))} />
            {signals.slice(0, 2).map((label) => (
              <SignalChip key={label}>{label}</SignalChip>
            ))}
            {signals.length > 2 ? <Chip title={signals.slice(2).join(', ')}>+{signals.length - 2}</Chip> : null}
            {item.hasMedia ? <Chip icon={<Camera aria-hidden className="h-3 w-3" />}>{copy.badge.media}</Chip> : null}
            {item.remedyStatus ? (
              <Chip tone={item.remedyStatus === 'accepted' ? 'success' : item.remedyStatus === 'awaiting_dealer_approval' ? 'warning' : 'neutral'}>
                {copy.remedyStatus[item.remedyStatus]}
              </Chip>
            ) : null}
            {item.case?.assignee && item.status !== 'resolved' ? (
              <Chip tone="brand" icon={<UserCheck aria-hidden className="h-3 w-3" />}>
                {copy.assignedTo(item.case.assignee.name)}
              </Chip>
            ) : null}
            {item.topics.slice(0, signals.length > 1 ? 0 : 2).map((t) => (
              <Chip key={t}>#{t}</Chip>
            ))}
          </div>
        </div>
      </div>
    </CollapseItem>
  );
});

export function InboxList({
  items,
  selected,
  activeKey,
  focusKey,
  selectable,
  onToggle,
  onOpen,
  onFocusRow,
}: {
  items: InboxListItem[];
  selected: ReadonlySet<string>;
  activeKey: string | null;
  focusKey: string | null;
  selectable: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onOpen: (key: string) => void;
  onFocusRow: (key: string) => void;
}) {
  const copy = useInboxCopy();
  return (
    <ul aria-label={copy.listLabel} className="flex flex-col">
      <CollapseList>
        {items.map((item) => (
          <InboxRow
            key={item.key}
            item={item}
            selected={selected.has(item.key)}
            active={activeKey === item.key}
            focused={focusKey === item.key}
            selectable={selectable}
            onToggle={onToggle}
            onOpen={onOpen}
            onFocusRow={onFocusRow}
          />
        ))}
      </CollapseList>
    </ul>
  );
}
