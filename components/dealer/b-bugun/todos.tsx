'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ArrowRight, Check, ListTodo, Plus, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { listItem, useMotionPolicy } from '@/lib/motion';
import type { SuggestionItem, TodoItem, TodoPriority, TodosSection } from '@/lib/dealer-today/types';
import { TODAY_LINKS } from '@/lib/dealer-today/core';
import { useTodayCopy } from './copy';
import { TodayFetchError, useAddSuggestion, useSetTodoStatus } from './use-today';

const PRIORITY_TONE: Record<TodoPriority, 'danger' | 'warning' | 'neutral'> = { high: 'danger', medium: 'warning', low: 'neutral' };

/**
 * Yapılacaklar — açık aksiyon kalemleri (tamamla/geri al GERÇEK yazma) ve AI'ın geri
 * bildirimlere iliştirdiği, henüz takipte olmayan öneriler ("Listeye ekle" gerçekten kayıt
 * açar; eski copilot'taki "Ekle" yalnız sayfa değiştiriyordu — copilot B2).
 */
export function Todos({ todos }: { todos: TodosSection }) {
  const { copy } = useTodayCopy();
  return (
    <SectionCard
      title={copy.todos.title}
      description={copy.todos.desc(todos.openTotal)}
      density="compact"
      actions={
        <Link href={TODAY_LINKS.todos} prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          {copy.todos.seeAll}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      }
    >
      <OpenTodos items={todos.open} />
      {todos.suggestions.length > 0 && <Suggestions items={todos.suggestions} />}
    </SectionCard>
  );
}

function OpenTodos({ items }: { items: TodoItem[] }) {
  const { copy, tag } = useTodayCopy();
  const policy = useMotionPolicy();
  const setStatus = useSetTodoStatus();
  const dateFmt = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });

  const complete = (item: TodoItem) => {
    setStatus.mutate(
      { id: item.id, status: 'done' },
      {
        onSuccess: () => {
          toast.success(copy.todos.completed, {
            action: { label: copy.todos.undo, onClick: () => setStatus.mutate({ id: item.id, status: 'pending' }, { onSuccess: () => toast(copy.todos.reopened) }) },
          });
        },
        onError: () => toast.error(copy.todos.failed),
      }
    );
  };

  if (items.length === 0) {
    return (
      <div role="status" className="flex items-start gap-3 py-2">
        <ListTodo aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-fg-subtle" />
        <div>
          <p className="text-sm font-medium text-fg">{copy.todos.empty}</p>
          <p className="text-xs text-fg-muted">{copy.todos.emptyDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-subtle">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <Motion.li
            key={item.id}
            layout={!policy.reduce}
            variants={policy.variants(listItem)}
            initial="visible"
            animate="visible"
            exit="exit"
            className="flex items-start gap-2 py-2.5"
          >
            <button
              type="button"
              onClick={() => complete(item)}
              disabled={setStatus.isPending && setStatus.variables?.id === item.id}
              className="group relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:h-9 sm:w-9"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-strong text-transparent transition-colors duration-fast group-hover:border-success group-hover:text-success">
                <Check aria-hidden className="h-3 w-3" />
              </span>
              <span className="sr-only">
                {copy.todos.complete}: {item.text}
              </span>
            </button>
            <div className="min-w-0 flex-1 pt-1">
              <p className="line-clamp-2 text-sm text-fg">{item.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                <StatusBadge label={copy.todos.priority[item.priority]} tone={PRIORITY_TONE[item.priority]} size="sm" icon={null} />
                {item.dueAt && (
                  <span className={cn(item.overdue && 'font-medium text-danger')}>
                    {item.overdue ? `${copy.todos.overdue} · ` : ''}
                    {copy.todos.due(dateFmt.format(new Date(item.dueAt)))}
                  </span>
                )}
                {item.assigneeName && <span>{copy.todos.assignee(item.assigneeName)}</span>}
              </div>
            </div>
          </Motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function Suggestions({ items }: { items: SuggestionItem[] }) {
  const { copy } = useTodayCopy();
  const add = useAddSuggestion();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const act = (s: SuggestionItem, dismiss: boolean) => {
    setBusyKey(s.key);
    add.mutate(
      { feedbackId: s.feedbackId, text: s.text, priority: s.priority, dismiss },
      {
        onSuccess: () => {
          const msg = dismiss ? copy.todos.dismissed : copy.todos.added;
          toast.success(msg);
        },
        onError: (e) => toast.error(e instanceof TodayFetchError && e.status === 409 ? copy.todos.duplicate : copy.todos.failed),
        onSettled: () => setBusyKey(null),
      }
    );
  };

  return (
    <div className="mt-3 border-t border-subtle pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Sparkles aria-hidden className="h-4 w-4 text-brand" />
        {copy.todos.suggestionsTitle}
      </h3>
      <p className="mt-0.5 text-xs text-fg-muted">{copy.todos.suggestionsDesc}</p>
      <ul className="mt-2 space-y-2">
        {items.map((s) => {
          const busy = busyKey === s.key;
          return (
            <li key={s.key} className="rounded-control border border-subtle bg-surface-2 p-2.5">
              <p className="text-sm text-fg">{s.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge label={copy.todos.priority[s.priority]} tone={PRIORITY_TONE[s.priority]} size="sm" icon={null} />
                <span className="text-xs text-fg-muted">{copy.todos.fromRating(s.rating)}</span>
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => act(s, true)}
                    disabled={busy}
                    className="inline-flex min-h-11 items-center gap-1 rounded-control px-2.5 text-xs font-medium text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 sm:min-h-9"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                    {copy.todos.dismiss}
                    <span className="sr-only">: {s.text}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => act(s, false)}
                    disabled={busy}
                    aria-busy={busy}
                    className="inline-flex min-h-11 items-center gap-1 rounded-control bg-brand px-2.5 text-xs font-medium text-brand-fg hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50 sm:min-h-9"
                  >
                    <Plus aria-hidden className="h-3.5 w-3.5" />
                    {copy.todos.add}
                    <span className="sr-only">: {s.text}</span>
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
