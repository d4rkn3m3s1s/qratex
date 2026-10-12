'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Bot, ChevronDown, Copy, RefreshCw, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { IconButton } from '@/components/ds/a11y';
import { Button } from '@/components/ui/button';
import type { AssistantFact, AssistantMessage, AssistantSource } from '@/lib/dealer-assistant/types';
import { cn } from '@/lib/utils';
import type { AssistantCopy } from './copy';
import { FactCard, dedupeFacts } from './fact-cards';
import { Markdown } from './markdown';

function timeOf(iso: string, tag: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '';
  return d.toLocaleString(tag, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });
}

export function UserBubble({ content, createdAt, copy, failed }: { content: string; createdAt?: string; copy: AssistantCopy; failed?: boolean }) {
  return (
    <li className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[75%]">
        <p className="sr-only">{copy.you}:</p>
        <div className={cn('whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-brand-fg', failed && 'opacity-80')}>
          {content}
        </div>
        <p className="mt-1 text-end qx-caption text-fg-muted">
          {failed ? (
            <span className="inline-flex items-center gap-1 text-danger">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {copy.failed}
            </span>
          ) : createdAt ? (
            <time dateTime={createdAt}>{timeOf(createdAt, copy.tag)}</time>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function SourceList({ sources, messageId, copy, open, onToggle }: { sources: AssistantSource[]; messageId: string; copy: AssistantCopy; open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-start qx-caption font-semibold text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-expanded={open}
        aria-controls={`sources-${messageId}`}
        onClick={() => onToggle(!open)}
      >
        {copy.sources(sources.length)}
        <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ol id={`sources-${messageId}`} className="divide-y divide-border border-t border-border">
          {sources.map((s) => (
            <li key={s.ref} id={`src-${messageId}-${s.ref}`} tabIndex={-1} className="px-3 py-2 qx-caption outline-none focus-visible:bg-surface-2 target:bg-surface-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-muted">
                <span className="rounded bg-brand-subtle px-1.5 font-semibold text-brand">{s.ref}</span>
                {s.rating != null && (
                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                    <Star className="h-3 w-3 fill-current text-warning" aria-hidden />
                    {s.rating}
                  </span>
                )}
                {s.sentiment && <span>{copy.sentiment[s.sentiment] ?? s.sentiment}</span>}
                <span>{copy.channel[s.kind] ?? s.kind}</span>
                <time dateTime={s.createdAt}>{new Date(s.createdAt).toLocaleDateString(copy.tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })}</time>
                <Link href={s.href} className="ms-auto inline-flex min-h-8 items-center font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" aria-label={copy.openSource(s.ref)}>
                  {copy.openInbox}
                </Link>
              </div>
              <p className="mt-1 text-fg">“{s.excerpt}”</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FactsBlock({ facts, copy }: { facts: AssistantFact[]; copy: AssistantCopy }) {
  const list = dedupeFacts(facts);
  if (list.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="qx-caption font-medium text-fg-muted">{copy.basedOn}</p>
      <div className="grid gap-2">
        {list.map((f, i) => (
          <FactCard key={`${f.tool}-${i}`} fact={f} copy={copy} />
        ))}
      </div>
    </div>
  );
}

export interface AssistantBubbleProps {
  message: Pick<AssistantMessage, 'id' | 'content' | 'createdAt' | 'status' | 'facts' | 'sources' | 'rating'>;
  copy: AssistantCopy;
  /** Akış sürüyor: eylemler gizli. */
  streaming?: boolean;
  /** Akış sırasında çalışan araç etiketi. */
  activity?: string | null;
  isLast?: boolean;
  onRate?: (rating: 1 | -1 | null) => void;
  onRegenerate?: () => void;
  busy?: boolean;
}

export function AssistantBubble({ message, copy, streaming, activity, isLast, onRate, onRegenerate, busy }: AssistantBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sources = message.sources ?? [];
  const facts = message.facts ?? [];

  const onCite = useCallback(
    (ref: string) => {
      setSourcesOpen(true);
      requestAnimationFrame(() => {
        const el = document.getElementById(`src-${message.id}-${ref}`);
        if (el) {
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: 'nearest' });
        }
      });
    },
    [message.id],
  );

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.actionFailed);
    }
  };

  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand" aria-hidden>
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="sr-only">{copy.assistant}:</p>
        {message.content ? (
          <Markdown content={message.content} sources={sources} onCite={streaming ? undefined : onCite} />
        ) : null}
        {streaming && (
          <p className="inline-flex items-center gap-2 qx-caption text-fg-muted" role="status">
            <span className="inline-flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand [animation-delay:150ms] motion-reduce:animate-none" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand [animation-delay:300ms] motion-reduce:animate-none" />
            </span>
            {activity ?? copy.thinking}
          </p>
        )}
        {message.status === 'stopped' && <p className="qx-caption text-warning">{copy.stopped}</p>}
        <FactsBlock facts={facts} copy={copy} />
        {sources.length > 0 && <SourceList sources={sources} messageId={message.id} copy={copy} open={sourcesOpen} onToggle={setSourcesOpen} />}
        {!streaming && (
          <div className="flex flex-wrap items-center gap-1 text-fg-muted">
            {message.createdAt && <time dateTime={message.createdAt} className="me-1 qx-caption">{timeOf(message.createdAt, copy.tag)}</time>}
            <IconButton aria-label={copy.copy} icon={<Copy />} size="sm" variant="ghost" onClick={doCopy} />
            {onRate && (
              <>
                <IconButton
                  aria-label={copy.helpful}
                  pressed={message.rating === 1}
                  icon={<ThumbsUp className={cn(message.rating === 1 && 'fill-current text-success')} />}
                  size="sm"
                  variant="ghost"
                  onClick={() => onRate(message.rating === 1 ? null : 1)}
                />
                <IconButton
                  aria-label={copy.notHelpful}
                  pressed={message.rating === -1}
                  icon={<ThumbsDown className={cn(message.rating === -1 && 'fill-current text-danger')} />}
                  size="sm"
                  variant="ghost"
                  onClick={() => onRate(message.rating === -1 ? null : -1)}
                />
              </>
            )}
            {isLast && onRegenerate && (
              <Button type="button" variant="ghost" size="sm" className="min-h-9 gap-1.5 qx-caption" onClick={onRegenerate} disabled={busy}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {copy.regenerate}
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
