'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { ChangelogOverview } from '@/lib/changelog/types';
import { eraColor, fmtDate } from './meta';
import type { ChangelogSfx } from './use-sfx';
import s from './changelog.module.css';

type Era = NonNullable<NonNullable<ChangelogOverview>['eras']>[number];
type Milestone = NonNullable<NonNullable<ChangelogOverview>['milestones']>[number];

const ts = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).getTime();

/**
 * Yatay dönem şeridi + kilometre taşı takımyıldızı. Zaman ekseni ilk commit → son commit;
 * dönemler renkli bloklar, kilometre taşları parlayan düğümler (üzerine gelince ayrıntı, tıklayınca o haftaya git).
 */
export function EraAxis({
  eras, milestones, from, to, activeEra, onEra, onMilestone, sfx,
}: {
  eras: Era[];
  milestones: Milestone[];
  from: string;
  to: string;
  activeEra: number;
  onEra: (i: number) => void;
  onMilestone: (m: Milestone) => void;
  sfx: ChangelogSfx;
}) {
  const reduce = useReducedMotionPref();
  const [hover, setHover] = useState<number | null>(null);
  const t0 = ts(from);
  const t1 = Math.max(ts(to), t0 + 1);
  const pos = (d: string) => Math.min(100, Math.max(0, ((ts(d) - t0) / (t1 - t0)) * 100));

  // Aynı noktaya düşen taşları dikeyde kaydır.
  const lanes = useMemo(() => {
    const last: number[] = [];
    return milestones.map((m) => {
      const p = pos(m.date);
      let lane = 0;
      while (last[lane] != null && p - last[lane] < 2.2) lane++;
      last[lane] = p;
      return Math.min(lane, 4);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, t0, t1]);

  const hovered = hover != null ? milestones[hover] : null;

  return (
    <section aria-labelledby="cl-eras-title" className="rounded-3xl border border-border bg-surface-1 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cl-eras-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Flag className="h-4 w-4 text-brand" aria-hidden /> Dönemler ve kilometre taşları
        </h2>
        <p className="text-xs text-fg-subtle">{eras.length} dönem, {milestones.length} kilometre taşı</p>
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="relative min-w-[46rem]">
          {/* Dönem blokları */}
          <ol className="relative h-14" aria-label="Dönemler">
            {eras.map((e, i) => {
              const left = pos(e.from);
              const width = Math.max(2.5, pos(e.to) - left + 1.5);
              const active = activeEra === i;
              return (
                <li key={e.name + e.from} className="absolute top-0 h-full" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}>
                  <button
                    type="button"
                    onClick={() => onEra(i)}
                    title={`${e.name} · ${fmtDate(e.from)} – ${fmtDate(e.to)}`}
                    className={cn(
                      'group flex h-full w-full flex-col justify-end overflow-hidden rounded-lg px-1.5 pb-1 text-left transition-[transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      active ? '-translate-y-0.5' : 'hover:-translate-y-0.5',
                    )}
                    style={{
                      background: `linear-gradient(180deg, ${eraColor(i, active ? 0.35 : 0.16)}, ${eraColor(i, active ? 0.6 : 0.3)})`,
                      boxShadow: active ? `0 6px 20px -6px ${eraColor(i, 0.7)}` : undefined,
                      borderBottom: `3px solid ${eraColor(i)}`,
                    }}
                  >
                    <span className="sr-only">{e.name}, {fmtDate(e.from)} – {fmtDate(e.to)} dönemine git</span>
                    <span aria-hidden className="truncate text-[11px] font-semibold leading-tight text-fg">{e.name.replace(/\s*\(.*\)\s*$/, '')}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Zaman çizgisi + kilometre taşları */}
          <div className="relative mt-3 h-24">
            <div className="absolute inset-x-0 top-3 h-px bg-border" aria-hidden />
            <ol aria-label="Kilometre taşları">
              {milestones.map((m, i) => {
                const era = eras.findIndex((e) => m.date >= e.from && m.date <= e.to);
                return (
                  <li key={m.date + m.title} className="absolute" style={{ left: `${pos(m.date)}%`, top: `${lanes[i] * 14}px` }}>
                    <Motion.button
                      type="button"
                      onMouseEnter={() => { setHover(i); sfx.play('tick', 0.35); }}
                      onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover((h) => (h === i ? null : h))}
                      onClick={() => { sfx.play('notify', 0.5); onMilestone(m); }}
                      className="-ml-3 grid h-6 w-6 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      initial={reduce ? false : { scale: 0, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: reduce ? 0 : 0.02 * i, type: 'spring', stiffness: 400, damping: 18 }}
                      aria-label={`${fmtDate(m.date)}: ${m.title}`}
                    >
                      <span
                        className={cn('block h-2.5 w-2.5 rounded-full transition-transform duration-200', s.glowDot, hover === i && 'scale-150')}
                        style={{ background: eraColor(era), ['--dot' as string]: eraColor(era, 0.8) }}
                      />
                    </Motion.button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex justify-between text-[11px] text-fg-subtle qx-num" aria-hidden>
            <span>{fmtDate(from, { month: 'short', year: 'numeric' })}</span>
            <span>{fmtDate(to, { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Ayrıntı paneli (fare/odak) */}
      <div className="mt-3 min-h-[4.5rem]" aria-live="polite">
        <AnimatePresence mode="wait">
          {hovered ? (
            <Motion.div
              key={hovered.date + hovered.title}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl border border-border bg-surface-2 p-3"
            >
              <p className="text-xs text-fg-subtle qx-num">
                {fmtDate(hovered.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                {hovered.commit ? <> · <code className="font-mono">{hovered.commit}</code></> : null}
              </p>
              <p className="font-semibold text-fg">{hovered.title}</p>
              {hovered.detail ? <p className="mt-0.5 text-sm text-fg-muted">{hovered.detail}</p> : null}
            </Motion.div>
          ) : (
            <Motion.p key="hint" initial={false} className="pt-2 text-sm text-fg-subtle">
              Bir dönem bloğuna tıklayıp o döneme atlayın; parlayan noktalar kilometre taşlarıdır.
            </Motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
