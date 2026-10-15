'use client';

import { useMemo, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { ExternalLink, Radio } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { LiveCommit } from '@/lib/changelog/types';
import { fmtDate } from './meta';
import s from './changelog.module.css';

const PREVIEW = 6;

/** Günlük derlendikten sonra main'e gelen, henüz özetlenmemiş commitler (ISO haftasına göre). */
export function LiveFeed({ commits }: { commits: LiveCommit[] }) {
  const reduce = useReducedMotionPref();
  const [all, setAll] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, LiveCommit[]>();
    for (const c of [...commits].sort((a, b) => b.date.localeCompare(a.date))) {
      if (!m.has(c.week)) m.set(c.week, []);
      m.get(c.week)!.push(c);
    }
    return [...m.entries()];
  }, [commits]);
  if (commits.length === 0) return null;
  let shown = 0;

  return (
    <Motion.section
      aria-labelledby="cl-live-title"
      className={s.liveBorder}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="rounded-[calc(1.25rem-1px)] bg-surface-1 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cl-live-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-brand-subtle text-brand">
              <Radio className="h-4 w-4" aria-hidden />
              <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success', s.pulse)} aria-hidden />
            </span>
            Yeni, henüz özetlenmedi
          </h2>
          <p className="text-xs text-fg-subtle">{commits.length} commit, GitHub main dalından</p>
        </div>
        <div className="mt-4 space-y-4">
          {groups.map(([week, cs]) => {
            const visible = all ? cs : cs.slice(0, Math.max(0, PREVIEW - shown));
            shown += visible.length;
            if (visible.length === 0) return null;
            return (
              <div key={week}>
                <p className="text-xs font-semibold text-fg-subtle">{week}</p>
                <ul className="mt-1.5 divide-y divide-border">
                  {visible.map((c) => (
                    <li key={c.sha} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-brand hover:underline">
                        {c.short}<ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                      <span className="min-w-0 flex-1 break-words text-fg">{c.subject}</span>
                      <span className="text-xs text-fg-subtle qx-num">{fmtDate(c.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {commits.length > PREVIEW ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 min-h-10 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {all ? 'Daha az göster' : `Tümünü göster (${commits.length})`}
          </button>
        ) : null}
      </div>
    </Motion.section>
  );
}
