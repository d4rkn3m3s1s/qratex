'use client';

/**
 * Sohbet listesi: arama, sabitlenenler, tarih grupları (Bugün / Bu hafta / Daha eski, İstanbul
 * takvimi), imleçli "daha fazla", yeniden adlandır / sabitle / sil (arşiv + geri al).
 * Yükleniyor iskelet, hata görünür (ai-chat Bulgu: hata "Henüz sohbet yok" olarak gizleniyordu).
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Pin, PinOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, InlineError, SkeletonList } from '@/components/states';
import { IconButton } from '@/components/ds/a11y';
import { istanbulDay, addDays } from '@/components/ds/page/date-range';
import type { ConversationSummary } from '@/lib/dealer-assistant/types';
import { cn } from '@/lib/utils';
import { useAssistantCopy, type AssistantCopy } from './copy';
import { flattenPages, useConversationActions, useConversationList } from './use-assistant';

export interface ConversationListProps {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  className?: string;
}

function groupOf(c: ConversationSummary, today: string): 'today' | 'week' | 'older' {
  const day = istanbulDay(c.updatedAt);
  if (day === today) return 'today';
  if (day > addDays(today, -7)) return 'week';
  return 'older';
}

export function ConversationList({ activeId, onSelect, onNew, className }: ConversationListProps) {
  const copy = useAssistantCopy();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = useConversationList(q);
  const { pinned, items } = flattenPages(list.data);
  const today = istanbulDay();
  const groups = useMemo(() => {
    const out: Record<'today' | 'week' | 'older', ConversationSummary[]> = { today: [], week: [], older: [] };
    for (const c of items) out[groupOf(c, today)].push(c);
    return out;
  }, [items, today]);

  return (
    <nav aria-label={copy.conversations} className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-2 border-b border-border p-3">
        <Button type="button" onClick={onNew} className="min-h-11 w-full justify-start gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          {copy.newChat}
        </Button>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {copy.searchLabel}
          </label>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value.slice(0, 100))}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 w-full rounded-md border border-border bg-surface-0 ps-9 pe-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:text-sm"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {list.isPending ? (
          <SkeletonList rows={4} className="border-0 bg-transparent" />
        ) : list.isError ? (
          <InlineError variant="banner" onRetry={() => list.refetch()}>{copy.listError}</InlineError>
        ) : pinned.length === 0 && items.length === 0 ? (
          <EmptyState compact variant={q ? 'no-results' : 'first-use'} title={q ? copy.noSearchResults : copy.noConversations} description={q ? null : copy.noConversationsDesc} />
        ) : (
          <div className="space-y-4">
            <Group title={copy.pinned} items={pinned} activeId={activeId} onSelect={onSelect} copy={copy} />
            <Group title={copy.today} items={groups.today} activeId={activeId} onSelect={onSelect} copy={copy} />
            <Group title={copy.thisWeek} items={groups.week} activeId={activeId} onSelect={onSelect} copy={copy} />
            <Group title={copy.older} items={groups.older} activeId={activeId} onSelect={onSelect} copy={copy} />
            {list.hasNextPage && (
              <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {copy.loadMore}
              </Button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

function Group({
  title,
  items,
  activeId,
  onSelect,
  copy,
}: {
  title: string;
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  copy: AssistantCopy;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="px-2 pb-1 qx-overline text-fg-muted">{title}</h3>
      <ul className="space-y-0.5">
        {items.map((c) => (
          <Row key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} copy={copy} />
        ))}
      </ul>
    </section>
  );
}

function Row({ c, active, onSelect, copy }: { c: ConversationSummary; active: boolean; onSelect: (id: string | null) => void; copy: AssistantCopy }) {
  const { update, archive, restore } = useConversationActions();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const inputId = useId();
  const label = c.title || copy.untitled;

  const saveTitle = () => {
    const t = title.trim();
    setEditing(false);
    if (!t || t === c.title) return;
    update.mutate({ id: c.id, patch: { title: t } }, { onError: () => toast.error(copy.actionFailed) });
  };

  const remove = () => {
    archive.mutate(c.id, {
      onSuccess: () => {
        if (active) onSelect(null);
        toast.success(copy.removed, {
          action: { label: copy.undo, onClick: () => restore.mutate(c.id, { onSuccess: () => toast.success(copy.restored), onError: () => toast.error(copy.actionFailed) }) },
        });
      },
      onError: () => toast.error(copy.actionFailed),
    });
  };

  if (editing) {
    return (
      <li className="px-1 py-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTitle();
          }}
          className="flex items-center gap-1"
        >
          <label htmlFor={inputId} className="sr-only">
            {copy.renameLabel}
          </label>
          <input
            id={inputId}
            autoFocus
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setTitle(c.title);
                setEditing(false);
              }
            }}
            className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface-0 px-2 qx-small text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <Button type="submit" size="sm" className="min-h-10">
            {copy.save}
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className={cn('group flex items-center rounded-md', active ? 'bg-brand-subtle' : 'hover:bg-surface-2')}>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md px-2 py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          active ? 'text-brand' : 'text-fg',
        )}
      >
        <span className="flex w-full items-center gap-1.5 truncate qx-small font-medium">
          {c.pinned && <Pin className="h-3 w-3 shrink-0" aria-hidden />}
          <span className="truncate">{label}</span>
        </span>
        <time dateTime={c.updatedAt} className="qx-caption text-fg-muted">
          {new Date(c.updatedAt).toLocaleString(copy.tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}
        </time>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label={copy.conversationActions(label)} icon={<MoreHorizontal />} size="sm" variant="ghost" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setTitle(c.title);
              setEditing(true);
            }}
          >
            <Pencil className="me-2 h-4 w-4" aria-hidden />
            {copy.rename}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => update.mutate({ id: c.id, patch: { pinned: !c.pinned } }, { onError: () => toast.error(copy.actionFailed) })}>
            {c.pinned ? <PinOff className="me-2 h-4 w-4" aria-hidden /> : <Pin className="me-2 h-4 w-4" aria-hidden />}
            {c.pinned ? copy.unpin : copy.pin}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove} className="text-danger focus:text-danger">
            <Trash2 className="me-2 h-4 w-4" aria-hidden />
            {copy.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
