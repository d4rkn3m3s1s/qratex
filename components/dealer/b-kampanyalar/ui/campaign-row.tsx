'use client';

import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CalendarClock,
  CalendarX,
  Copy,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { cn } from '@/lib/utils';
import { DELETABLE_STATUSES, EDITABLE_STATUSES, SENDABLE_STATUSES, pct, wasSent } from '../domain';
import type { CampaignListItem } from '../types';
import { useCampaignCopy } from '../client/use-copy';
import { fmtDate, fmtDateTime, fmtNumber, fmtPct } from '../copy';
import { CampaignStatusBadge, SegmentChip } from './badges';

export type RowAction = 'edit' | 'send' | 'schedule' | 'unschedule' | 'duplicate' | 'archive' | 'unarchive' | 'delete';

export type CampaignRowProps = {
  item: CampaignListItem;
  readOnly: boolean;
  /** Bu satırda süren işlem (yalnız bu satır kilitlenir; denetim: tek `isPending` tüm kartları kilitliyordu). */
  busy: boolean;
  performanceHref: string;
  onAction: (action: RowAction, item: CampaignListItem) => void;
};

export function CampaignRow({ item, readOnly, busy, performanceHref, onAction }: CampaignRowProps) {
  const { c, locale } = useCampaignCopy();
  const sent = wasSent(item);
  const editable = EDITABLE_STATUSES.includes(item.status);
  const sendable = SENDABLE_STATUSES.includes(item.status) && item.segment !== null;
  const deletable = DELETABLE_STATUSES.includes(item.status);
  const openRate = item.opened != null && item.inAppDelivered ? pct(item.opened, item.inAppDelivered) : null;

  const when =
    item.status === 'scheduled' && item.sentAt
      ? c.row.scheduledFor(fmtDate(item.sentAt, locale, { day: 'numeric', month: 'long' }))
      : sent && item.sentAt
        ? c.row.sentAt(fmtDateTime(item.sentAt, locale))
        : c.row.updated(fmtDate(item.updatedAt, locale));

  const menuItems: Array<{ action: RowAction; label: string; icon: typeof Pencil; danger?: boolean; show: boolean }> = [
    { action: 'edit', label: c.row.edit, icon: Pencil, show: !readOnly && editable },
    { action: 'schedule', label: c.row.schedule, icon: CalendarClock, show: !readOnly && sendable && item.status !== 'scheduled' },
    { action: 'unschedule', label: c.row.unschedule, icon: CalendarX, show: !readOnly && item.status === 'scheduled' },
    { action: 'duplicate', label: c.row.duplicate, icon: Copy, show: !readOnly },
    { action: 'archive', label: c.row.archive, icon: Archive, show: !readOnly && item.status === 'sent' },
    { action: 'unarchive', label: c.row.unarchive, icon: ArchiveRestore, show: !readOnly && item.status === 'archived' && !!item.sentAt },
    { action: 'delete', label: c.row.delete, icon: Trash2, danger: true, show: !readOnly && deletable },
  ];
  const visibleMenu = menuItems.filter((m) => m.show);

  return (
    <article
      aria-busy={busy || undefined}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4 transition-opacity duration-fast sm:flex-row sm:items-start sm:gap-4',
        busy && 'opacity-70'
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <CampaignStatusBadge status={item.status} />
          <SegmentChip segment={item.segment} />
          {item.fromPlaybook && (
            <StatusBadge
              label={item.playbookTitle ? `${c.row.fromPlaybook}: ${item.playbookTitle}` : c.row.fromPlaybook}
              title={item.playbookTitle ?? undefined}
              tone="neutral"
              icon={null}
              size="sm"
            />
          )}
        </div>
        <h3 className="qx-body break-words font-semibold text-fg">
          {sent ? (
            <Link
              href={performanceHref}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h3>
        <p className="qx-small line-clamp-2 break-words text-fg-muted">{item.message}</p>
        <p className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <span>{when}</span>
          {sent && <span className="qx-num">{c.row.reach(fmtNumber(item.sentCount, locale))}</span>}
          {sent && item.inAppDelivered != null && item.inAppDelivered > 0 && (
            <span className="qx-num" title={c.row.opened(fmtNumber(item.opened ?? 0, locale), fmtNumber(item.inAppDelivered, locale))}>
              {fmtPct(openRate, locale)} {c.row.openRate}
            </span>
          )}
        </p>
        {item.status === 'failed' && item.failureReason && (
          <p className="qx-caption text-danger">
            <span className="font-medium">{c.row.failedReason}</span> {item.failureReason}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {sent ? (
          <Button asChild variant="outline" size="sm" className="h-11 flex-1 gap-1.5 sm:flex-none">
            <Link href={performanceHref}>
              <BarChart3 aria-hidden className="h-4 w-4" />
              {c.row.performance}
            </Link>
          </Button>
        ) : !readOnly && sendable && item.status !== 'scheduled' ? (
          <Button
            size="sm"
            className="h-11 flex-1 gap-1.5 shadow-none sm:flex-none"
            onClick={() => onAction('send', item)}
            disabled={busy}
          >
            <Send aria-hidden className="h-4 w-4" />
            {c.row.send}
          </Button>
        ) : !readOnly && editable ? (
          <Button variant="outline" size="sm" className="h-11 flex-1 gap-1.5 sm:flex-none" onClick={() => onAction('edit', item)} disabled={busy}>
            <Pencil aria-hidden className="h-4 w-4" />
            {c.row.edit}
          </Button>
        ) : null}

        {visibleMenu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label={`${c.row.actions}: ${item.title}`}
                icon={<MoreHorizontal />}
                variant="outline"
                size="sm"
                loading={busy}
                disabled={busy}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {visibleMenu.map((m, i) => (
                <div key={m.action}>
                  {m.danger && i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onSelect={() => onAction(m.action, item)}
                    className={cn('min-h-[44px] gap-2 sm:min-h-0', m.danger && 'text-danger focus:text-danger')}
                  >
                    <m.icon aria-hidden className="h-4 w-4" />
                    {m.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}
