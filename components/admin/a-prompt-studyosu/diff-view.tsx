'use client';

import { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { diffStats, lineDiff, type ListDiff } from '@/lib/ai-studio/contract';
import { cn } from '@/lib/utils';
import { usePromptStudioCopy } from './copy';

/** Satır bazlı metin farkı — ekleme/silme işaretle ve metinle (yalnız renge dayanmaz). */
export function TextDiff({ before, after, label }: { before: string | null; after: string | null; label: string }) {
  const fz = usePromptStudioCopy().fx;
  const px = usePromptStudioCopy();
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  const stats = diffStats(lines);
  if (!lines.length) return <p className="qx-small text-fg-muted">{px.bothEmpty}</p>;
  return (
    <figure className="space-y-1">
      <figcaption className="qx-small text-fg-muted">
        {label}: <span className="text-success">{fz.linesAdded(stats.added)}</span> · <span className="text-danger">{fz.linesRemoved(stats.removed)}</span>
      </figcaption>
      <pre
        className="max-h-80 overflow-auto rounded-md border border-border bg-surface-muted p-2 font-mono text-xs leading-relaxed"
        aria-label={fz.diffOf(label)}
        tabIndex={0}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              'flex gap-2 whitespace-pre-wrap break-words px-1',
              l.type === 'add' && 'bg-success-subtle text-success',
              l.type === 'del' && 'bg-danger-subtle text-danger line-through decoration-1'
            )}
          >
            <span aria-hidden className="w-3 shrink-0 select-none">
              {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
            </span>
            <span>
              <span className="sr-only">{l.type === 'add' ? 'Eklendi: ' : l.type === 'del' ? 'Silindi: ' : ''}</span>
              {l.text || ' '}
            </span>
          </div>
        ))}
      </pre>
    </figure>
  );
}

/** Liste farkı: eklenen / çıkarılan / değişmeyen öğeler. */
export function ListDiffView({ title, diff }: { title: string; diff: ListDiff }) {
  const fz = usePromptStudioCopy().fx;
  const px = usePromptStudioCopy();
  const empty = !diff.added.length && !diff.removed.length && !diff.unchanged.length;
  return (
    <section className="space-y-1.5">
      <h4 className="qx-small font-medium text-fg">
        {title}{' '}
        <span className="text-fg-muted">
          (+{diff.added.length} · −{diff.removed.length} · {fz.sameN(diff.unchanged.length)})
        </span>
      </h4>
      {empty ? (
        <p className="qx-small text-fg-muted">{px.noItems}</p>
      ) : (
        <ul className="space-y-1">
          {diff.added.map((x) => (
            <li key={`a-${x}`} className="flex items-start gap-2 rounded-md bg-success-subtle px-2 py-1 text-sm text-success">
              <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">Eklenecek: </span>
                {x}
              </span>
            </li>
          ))}
          {diff.removed.map((x) => (
            <li key={`r-${x}`} className="flex items-start gap-2 rounded-md bg-danger-subtle px-2 py-1 text-sm text-danger">
              <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="line-through decoration-1">
                <span className="sr-only">{px.toRemove}</span>
                {x}
              </span>
            </li>
          ))}
          {diff.unchanged.map((x) => (
            <li key={`u-${x}`} className="px-2 py-0.5 text-sm text-fg-muted">
              {x}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
