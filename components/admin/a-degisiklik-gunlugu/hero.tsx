'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { m as Motion, useInView } from 'framer-motion';
import { ExternalLink, GitBranch, Volume2, VolumeX } from 'lucide-react';
import { useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { ChangelogSummaryData } from '@/lib/changelog/types';
import { eraColor, fmtDate, fmtInt } from './meta';
import type { ChangelogSfx } from './use-sfx';
import s from './changelog.module.css';

const DAY = 86400000;

function CountUp({ value, start, onDone, className }: { value: number; start: boolean; onDone?: () => void; className?: string }) {
  const reduce = useReducedMotionPref();
  const shown = useNumberTicker(reduce || start ? value : 0, { animateOnMount: true, durationMs: 1600 });
  const fired = useRef(false);
  useEffect(() => {
    if (!fired.current && start && value > 0 && Math.round(shown) === value) {
      fired.current = true;
      onDone?.();
    }
  }, [shown, start, value, onDone]);
  return <span className={cn('qx-num tabular-nums', className)}>{fmtInt(Math.round(shown))}</span>;
}

export function ChangelogHero({ data, sfx, liveCount }: { data: ChangelogSummaryData; sfx: ChangelogSfx; liveCount: number }) {
  const reduce = useReducedMotionPref();
  const t = data.totals;
  const ov = data.overview;
  const statsRef = useRef<HTMLDListElement>(null);
  const inView = useInView(statsRef, { once: true, margin: '0px 0px -10% 0px' });
  const [more, setMore] = useState(false);
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => setToday(Date.now()), []);
  const days = t.firstDate && today ? Math.max(0, Math.floor((today - new Date(`${t.firstDate}T00:00:00`).getTime()) / DAY)) : 0;
  const repos = t.repos ?? [];
  const eras = useMemo(() => ov?.eras ?? [], [ov?.eras]);

  const stats: { label: string; value: number; tone?: string; prefix?: string }[] = [
    { label: 'commit', value: t.commits + liveCount },
    { label: 'hafta', value: t.weeks },
    { label: 'gündür yolda', value: days },
    { label: 'satır eklendi', value: t.additions, tone: 'text-success', prefix: '+' },
    { label: 'satır silindi', value: t.deletions, tone: 'text-danger', prefix: '−' },
    { label: repos.length === 1 ? 'depo' : 'depo', value: repos.length || 1 },
  ];

  const enter = (i: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 18, filter: 'blur(6px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <section className={cn(s.hero, 'px-5 pb-0 pt-8 sm:px-10 sm:pt-12')} aria-labelledby="cl-hero-title">
      <div className={s.aurora} aria-hidden />
      <div className={s.grain} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Motion.p {...enter(0)} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/70 px-3 py-1 text-xs text-fg-muted backdrop-blur">
          <span className={cn('h-1.5 w-1.5 rounded-full bg-success', s.pulse)} aria-hidden />
          {fmtDate(t.firstDate, { month: 'long', year: 'numeric' })} – bugün
        </Motion.p>
        <button
          type="button"
          onClick={sfx.toggle}
          aria-pressed={sfx.enabled}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface-1/70 px-3 text-sm text-fg-muted backdrop-blur transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {sfx.enabled ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          {sfx.enabled ? 'Sesler açık' : 'Sesleri aç'}
        </button>
      </div>

      <Motion.h1 {...enter(1)} id="cl-hero-title" className={cn(s.title, 'mt-6 text-balance font-display text-4xl font-bold leading-[1.05] sm:text-6xl lg:text-7xl')}>
        Qratex&apos;in hikâyesi
      </Motion.h1>
      {ov?.headline ? (
        <Motion.p {...enter(2)} className="mt-4 max-w-3xl text-pretty text-lg font-medium text-fg sm:text-xl">
          {ov.headline}
        </Motion.p>
      ) : null}
      {ov?.summary ? (
        <Motion.div {...enter(3)} className="mt-3 max-w-[68ch]">
          <p id="cl-hero-summary" className={cn('text-pretty text-sm leading-relaxed text-fg-muted sm:text-base', !more && 'line-clamp-4')}>{ov.summary}</p>
          <button
            type="button"
            aria-expanded={more}
            aria-controls="cl-hero-summary"
            onClick={() => { sfx.play(more ? 'close-sheet' : 'open-sheet', 0.5); setMore(!more); }}
            className="mt-1 min-h-10 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {more ? 'Kısalt' : 'Hikâyenin tamamını oku'}
          </button>
        </Motion.div>
      ) : null}

      <dl ref={statsRef} className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((st, i) => (
          <Motion.div key={st.label} {...enter(4 + i * 0.5)} className="min-w-0 border-l-2 pl-3" style={{ borderColor: eraColor(i) }}>
            <dt className="text-xs text-fg-subtle">{st.label}</dt>
            <dd className={cn('mt-0.5 break-words font-display text-xl font-semibold text-fg sm:text-2xl', st.tone)}>
              {st.prefix}
              <CountUp value={st.value} start={inView} onDone={i === 0 ? () => sfx.play('coin', 0.5) : undefined} />
            </dd>
          </Motion.div>
        ))}
      </dl>

      {repos.length > 0 ? (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Depolar">
          {repos.map((r) => (
            <li key={r.name}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface-1/70 px-3 text-sm text-fg backdrop-blur transition-colors hover:border-brand-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <GitBranch className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                <span className="font-medium">{r.name}</span>
                <span className="qx-num text-xs text-fg-subtle">{fmtInt(r.commits)} commit</span>
                <ExternalLink className="h-3 w-3 text-fg-subtle" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Dönem katmanları: her şerit bir dönemin süre payı — sayfanın imza öğesi. */}
      {eras.length > 0 ? (
        <div className="-mx-5 mt-8 flex h-3 overflow-hidden sm:-mx-10" aria-hidden>
          {eras.map((e, i) => {
            const span = Math.max(1, (new Date(e.to).getTime() - new Date(e.from).getTime()) / DAY + 7);
            return (
              <Motion.span
                key={e.name}
                className="h-full"
                style={{ flexGrow: span, background: eraColor(i), transformOrigin: 'left' }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.6 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
