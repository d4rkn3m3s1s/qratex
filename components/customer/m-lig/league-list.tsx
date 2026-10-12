'use client';

import { forwardRef } from 'react';
import { ChevronLeft, ChevronRight, EyeOff } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { LeagueEmblem } from '@/components/ds/play';
import { Button } from '@/components/ui/button';
import { listItem } from '@/lib/motion';
import type { LeagueRowDTO } from '@/lib/league-board/types';
import { cn } from '@/lib/utils';
import { LigAvatar } from './lig-avatar';
import { useLigCopy } from './use-lig-copy';
import { useFlipRows } from './use-flip-rows';

/**
 * Sıralama satırları (sade: sıra · avatar · maskeli ad · lig · skor). Satırlar tıklanabilir
 * DEĞİL ve öyle görünmez (eski hover kalkması yanlış affordance'tı). Kendi satırın vurgulu ve
 * `id="lig-me"` taşır (yapışkan "sen" çubuğu ve "Sırama git" onu hedefler).
 */
export const LeagueList = forwardRef<HTMLLIElement, {
  rows: LeagueRowDTO[];
  unit: string;
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  /** Liste anahtarı (dönem/tür/sayfa) — değişince giriş animasyonu bir kez oynar. */
  listKey: string;
  busy: boolean;
  /** Giriş animasyonu yalnız kullanıcı seçimi değiştirince (sunucu render'ı opaklık 0 ile gelmesin). */
  animateEntry: boolean;
}>(function LeagueList({ rows, unit, page, pageCount, onPage, listKey, busy, animateEntry }, meRef) {
  const { copy, fmt } = useLigCopy();
  const flipRef = useFlipRows(rows.map((r) => r.key), listKey);

  return (
    <section aria-labelledby="lig-ranking-title" className="space-y-3" aria-busy={busy || undefined}>
      <h2 id="lig-ranking-title" className="qx-h3 font-semibold text-fg">
        {copy.rankingTitle}
      </h2>
      {rows.length > 0 ? (
        <ol key={listKey} className="divide-y divide-[hsl(var(--border-subtle))] overflow-hidden rounded-2xl border border-subtle bg-surface-1">
          {rows.map((row, i) => (
            <Motion.li
              key={row.key}
              ref={(el: HTMLLIElement | null) => {
                flipRef(row.key)(el);
                if (!row.isMe || !meRef) return;
                if (typeof meRef === 'function') meRef(el);
                else meRef.current = el;
              }}
              id={row.isMe ? 'lig-me' : undefined}
              tabIndex={row.isMe ? -1 : undefined}
              variants={listItem}
              custom={i}
              initial={animateEntry ? 'hidden' : false}
              animate="visible"
              aria-label={copy.rowAria(row.rank, row.name, fmt(row.score), unit, row.isMe)}
              className={cn(
                'flex min-h-14 items-center gap-3 px-3 py-2 outline-none sm:px-4',
                row.isMe && 'bg-brand-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'w-10 shrink-0 text-center font-display font-bold tabular-nums',
                  row.rank <= 10 ? 'qx-body text-brand' : 'qx-small text-fg-muted'
                )}
              >
                {fmt(row.rank)}
              </span>
              <LigAvatar name={row.name} image={row.image} seed={row.key} size={40} />
              <div aria-hidden className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5">
                  <span className="qx-body truncate font-medium text-fg">{row.name}</span>
                  {row.isMe ? (
                    <span className="qx-caption shrink-0 rounded-full bg-brand px-1.5 py-0.5 font-semibold text-brand-fg">
                      {copy.you}
                    </span>
                  ) : null}
                  {row.hiddenFromOthers ? (
                    <span
                      title={copy.hiddenBadgeTitle}
                      className="qx-caption inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface-3 px-1.5 py-0.5 font-medium text-fg-muted"
                    >
                      <EyeOff className="size-3" />
                      {copy.hiddenBadge}
                    </span>
                  ) : null}
                </p>
                <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
                  <LeagueEmblem leagueKey={row.leagueKey} name={row.leagueName} size="sm" className="[&>svg]:size-4" />
                  <span className="truncate">{row.leagueName}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{copy.level(row.level)}</span>
                </p>
              </div>
              <p aria-hidden className="shrink-0 text-right">
                <span className="qx-body block font-semibold tabular-nums text-fg">{fmt(row.score)}</span>
                <span className="qx-caption block text-fg-muted">{unit}</span>
              </p>
            </Motion.li>
          ))}
        </ol>
      ) : null}

      {pageCount > 1 ? (
        <nav aria-label={copy.pageOf(page, pageCount)} className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page <= 1 || busy}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft aria-hidden className="mr-1 size-4" />
            {copy.prev}
          </Button>
          <span className="qx-small tabular-nums text-fg-muted" aria-live="polite">
            {copy.pageOf(page, pageCount)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page >= pageCount || busy}
            onClick={() => onPage(page + 1)}
          >
            {copy.next}
            <ChevronRight aria-hidden className="ml-1 size-4" />
          </Button>
        </nav>
      ) : null}
    </section>
  );
});
