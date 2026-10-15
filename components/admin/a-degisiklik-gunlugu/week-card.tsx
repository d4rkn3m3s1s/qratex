'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { AlertTriangle, CalendarDays, ChevronDown, ExternalLink, GitCommitHorizontal, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import { StatusBadge } from '@/components/ds/data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChangelogShot, ChangelogWeekDetail, ChangelogWeekSummary } from '@/lib/changelog/types';
import { WEEKDAYS, areaMeta, eraColor, fmtDate, fmtInt, typeMeta } from './meta';
import type { ChangelogSfx } from './use-sfx';
import s from './changelog.module.css';

const MAIN_REPO = 'qratex';
const detailCache = new Map<string, Promise<ChangelogWeekDetail>>();

/** Hafta ayrıntısını /changelog/weeks/<hafta>.json'dan bir kez yükler (bellekte önbellek). */
export function loadWeekDetail(week: string): Promise<ChangelogWeekDetail> {
  let p = detailCache.get(week);
  if (!p) {
    p = fetch(`/changelog/weeks/${encodeURIComponent(week)}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<ChangelogWeekDetail>;
    });
    p.catch(() => detailCache.delete(week));
    detailCache.set(week, p);
  }
  return p;
}

function ActivityBar({ daily, color, from }: { daily: number[]; color: string; from: string | null }) {
  const max = Math.max(1, ...daily);
  const total = daily.reduce((a, b) => a + b, 0);
  return (
    <figure className="flex items-end gap-1" aria-label={`Günlük commit dağılımı, toplam ${total}`}>
      {daily.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5" title={`${WEEKDAYS[i]}: ${n} commit`}>
          <div className="flex h-8 w-3 items-end overflow-hidden rounded-sm bg-surface-3 sm:w-3.5">
            <div className="w-full rounded-sm transition-[height] duration-700" style={{ height: `${n ? Math.max(12, (n / max) * 100) : 0}%`, background: color }} />
          </div>
          <span className="text-[9px] leading-none text-fg-subtle" aria-hidden>{WEEKDAYS[i].slice(0, 1)}</span>
        </div>
      ))}
      <figcaption className="sr-only">{from ? fmtDate(from) : ''}</figcaption>
    </figure>
  );
}

export function WeekCard({
  week: w, index, area, type, sfx, onShot, firstOfEra, eraName,
}: {
  week: ChangelogWeekSummary;
  index: number;
  area: string;
  type: string;
  sfx: ChangelogSfx;
  onShot: (shots: ChangelogShot[], i: number) => void;
  firstOfEra: boolean;
  eraName?: string;
}) {
  const reduce = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ChangelogWeekDetail | null>(null);
  const [err, setErr] = useState(false);
  const [showCommits, setShowCommits] = useState(false);
  const [retry, setRetry] = useState(0);
  const color = eraColor(w.era);
  const early = (w.repo || MAIN_REPO) !== MAIN_REPO;
  const repoUrl = `https://github.com/d4rkn3m3s1s/${w.repo || MAIN_REPO}`;
  const detailId = `hafta-detay-${w.week}`;

  useEffect(() => {
    if (!open || detail) return;
    let alive = true;
    setErr(false);
    loadWeekDetail(w.week).then((d) => { if (alive) setDetail(d); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [open, detail, w.week, retry]);

  const toggle = () => {
    sfx.play(open ? 'close-sheet' : 'open-sheet', 0.6);
    setOpen(!open);
  };

  const sections = (detail?.sections ?? [])
    .filter((x) => area === 'all' || (x.area ?? 'diger') === area)
    .map((x) => ({ ...x, items: (x.items ?? []).filter((i) => type === 'all' || i.type === type) }))
    .filter((x) => x.items.length > 0);

  return (
    <li id={`hafta-${w.week}`} className="relative scroll-mt-24 pl-8 sm:pl-14">
      {firstOfEra && eraName ? (
        <Motion.p
          className="mb-3 flex items-center gap-2 text-sm font-semibold"
          style={{ color }}
          initial={reduce ? false : { opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
        >
          <span className="h-px w-6" style={{ background: color }} aria-hidden />
          {eraName}
        </Motion.p>
      ) : null}

      {/* Raydaki düğüm */}
      <span
        aria-hidden
        className={cn('absolute left-[7px] top-6 h-3.5 w-3.5 rounded-full border-2 bg-surface-0 sm:left-[19px]', s.glowDot, firstOfEra && eraName && 'top-[3.4rem]')}
        style={{ borderColor: color, ['--dot' as string]: eraColor(w.era, 0.55) }}
      />

      <Motion.article
        initial={reduce ? false : { opacity: 0, y: 28, scale: 0.985 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '0px 0px -8% 0px' }}
        transition={{ duration: 0.55, delay: (index % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'group relative overflow-hidden rounded-2xl border bg-surface-1 p-4 qx-elevation-1 transition-shadow duration-300 sm:p-6',
          early ? cn('border-dashed border-border-strong', s.early) : 'border-border',
        )}
        style={{ boxShadow: open ? `0 18px 50px -24px ${eraColor(w.era, 0.6)}` : undefined }}
      >
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} aria-hidden />

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              <span className="qx-num">{fmtDate(w.from)} – {fmtDate(w.to)}</span>
              <span className="rounded-full px-2 py-0.5 font-mono text-[11px]" style={{ background: eraColor(w.era, 0.14), color: 'hsl(var(--foreground))' }}>{w.week}</span>
              {early ? <StatusBadge label={`İlk sürüm · ${w.repo}`} tone="info" icon={null} size="sm" /> : null}
            </p>
            <h3 className="mt-2 text-pretty text-lg font-semibold leading-snug text-fg sm:text-xl">{w.title}</h3>
          </div>
          <div className="flex items-end gap-4">
            <ActivityBar daily={w.daily} color={color} from={w.from} />
            <div className="text-right text-sm qx-num">
              <p className="flex items-center justify-end gap-1 font-semibold text-fg"><GitCommitHorizontal className="h-4 w-4" aria-hidden />{fmtInt(w.stats.commits)}</p>
              <p className="text-xs"><span className="text-success">+{fmtInt(w.stats.additions)}</span> <span className="text-danger">−{fmtInt(w.stats.deletions)}</span></p>
            </div>
          </div>
        </header>

        {w.summary ? <p className="mt-3 max-w-[72ch] text-pretty text-sm leading-relaxed text-fg-muted">{w.summary}</p> : null}

        {w.areas.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Alanlar">
            {w.areas.map((a) => {
              const am = areaMeta(a);
              const Icon = am.icon;
              return (
                <li key={a} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', a === area ? 'border-brand-border bg-brand-subtle text-fg' : 'border-border text-fg-muted')}>
                  <Icon className="h-3 w-3" aria-hidden /> {am.label}
                </li>
              );
            })}
          </ul>
        ) : null}

        {w.highlights.length > 0 ? (
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {w.highlights.slice(0, open ? undefined : 4).map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-fg">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden />
                <span className="min-w-0">{h}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {(w.shots?.length ?? 0) > 0 ? (
          <ul className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Ekran görüntüleri">
            {w.shots!.map((sh, i) => (
              <li key={sh.src} className="shrink-0">
                <button
                  type="button"
                  onClick={() => { sfx.play('flip', 0.6); onShot(w.shots!, i); }}
                  className={cn(s.shine, 'block w-40 overflow-hidden rounded-lg border border-border bg-surface-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-48')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sh.src} alt="" loading="lazy" className="aspect-video w-full max-w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" />
                  <span className="line-clamp-1 px-2 py-1 text-[11px] text-fg-muted"><ImageIcon className="mr-1 inline h-3 w-3" aria-hidden />{sh.caption || 'Ekran görüntüsü'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Button variant="ghost" size="sm" className="mt-3 min-h-10 px-2" aria-expanded={open} aria-controls={detailId} onClick={toggle}>
          <ChevronDown className={cn('mr-1 h-4 w-4 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
          {open ? 'Ayrıntıyı gizle' : 'Ayrıntıyı göster'}
        </Button>

        <AnimatePresence initial={false}>
          {open ? (
            <Motion.div
              key="detail"
              id={detailId}
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-6 border-t border-border pt-5">
                {!detail && !err ? (
                  <p className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Ayrıntı yükleniyor…</p>
                ) : null}
                {err ? (
                  <p className="text-sm text-danger">
                    Ayrıntı yüklenemedi.{' '}
                    <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>Yeniden dene</button>
                  </p>
                ) : null}

                {detail ? (
                  <>
                    {(detail.parts?.length ?? 0) > 1 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {detail.parts!.map((p, i) => (
                          <div key={i} className="rounded-lg bg-surface-2 p-3">
                            <p className="text-xs text-fg-subtle">Bölüm {p.part ?? i + 1}: {fmtDate(p.from)} – {fmtDate(p.to)}</p>
                            {p.title ? <p className="text-sm font-medium text-fg">{p.title}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {sections.length === 0 && (area !== 'all' || type !== 'all') ? (
                      <p className="text-sm text-fg-muted">Bu haftada seçili filtreye uyan madde yok.</p>
                    ) : null}

                    {sections.map((sec, si) => {
                      const am = areaMeta(sec.area);
                      const Icon = am.icon;
                      return (
                        <Motion.section
                          key={si}
                          aria-label={sec.title || am.label}
                          initial={reduce ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: reduce ? 0 : Math.min(si, 8) * 0.05, duration: 0.3 }}
                        >
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
                            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: eraColor(w.era, 0.14), color }}><Icon className="h-4 w-4" aria-hidden /></span>
                            <span className="min-w-0">{sec.title || am.label}</span>
                            <span className="text-xs font-normal text-fg-subtle">{am.label}</span>
                          </h4>
                          <ul className="mt-2 space-y-2">
                            {sec.items.map((it, ii) => {
                              const tm = typeMeta(it.type);
                              return (
                                <li key={ii} className="rounded-lg border border-border bg-surface-2 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge label={tm.label} tone={tm.tone} icon={null} size="sm" />
                                    <span className="min-w-0 font-medium text-fg">{it.title}</span>
                                  </div>
                                  {it.detail ? <p className="mt-1 text-sm text-fg-muted">{it.detail}</p> : null}
                                  {it.commits?.length ? (
                                    <p className="mt-1.5 flex flex-wrap gap-1">
                                      {it.commits.map((c) => (
                                        <a key={c} href={`${repoUrl}/commit/${c}`} target="_blank" rel="noopener noreferrer" className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-fg-muted hover:text-brand">
                                          {c}
                                        </a>
                                      ))}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </Motion.section>
                      );
                    })}

                    {detail.days.length > 0 ? (
                      <section aria-label="Gün gün">
                        <h4 className="text-sm font-semibold text-fg">Gün gün</h4>
                        <ol className="mt-2 space-y-2 border-l-2 pl-4" style={{ borderColor: eraColor(w.era, 0.4) }}>
                          {detail.days.map((d) => (
                            <li key={d.date} className="text-sm">
                              <p className="text-xs font-medium text-fg-subtle qx-num">{fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}{d.commits ? `, ${d.commits} commit` : ''}</p>
                              <p className="text-fg-muted">{d.summary}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ) : null}

                    {detail.risks.length > 0 ? (
                      <section aria-label="Riskler ve takip" className="rounded-lg border border-warning-border bg-warning-subtle p-3">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-fg"><AlertTriangle className="h-4 w-4" aria-hidden /> Riskler ve takip</h4>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
                          {detail.risks.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </section>
                    ) : null}

                    {detail.commits.length > 0 ? (
                      <section aria-label="Commit listesi">
                        <Button variant="outline" size="sm" className="min-h-10" aria-expanded={showCommits} onClick={() => { sfx.play('tap', 0.5); setShowCommits((v) => !v); }}>
                          <GitCommitHorizontal className="mr-1 h-4 w-4" aria-hidden />
                          {showCommits ? 'Commitleri gizle' : `Tüm commitler (${detail.commits.length})`}
                        </Button>
                        {showCommits ? (
                          <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-border">
                            <table className="w-full min-w-[34rem] text-sm">
                              <thead className="sticky top-0 bg-surface-2 text-left text-fg-subtle">
                                <tr>
                                  <th scope="col" className="px-3 py-2 font-medium">Hash</th>
                                  <th scope="col" className="px-3 py-2 font-medium">Tarih</th>
                                  <th scope="col" className="px-3 py-2 font-medium">Mesaj</th>
                                  <th scope="col" className="px-3 py-2 text-right font-medium">+/−</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.commits.map((c) => (
                                  <tr key={c.short + c.date} className={cn('border-t border-border', detail.keyCommits.includes(c.short) && 'bg-brand-subtle')}>
                                    <td className="px-3 py-1.5">
                                      <a href={`https://github.com/d4rkn3m3s1s/${c.repo || MAIN_REPO}/commit/${c.short}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-fg-muted hover:text-brand">
                                        {c.short}<ExternalLink className="h-3 w-3" aria-hidden />
                                      </a>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-fg-subtle qx-num">{fmtDate(c.date, { day: 'numeric', month: 'short' })}</td>
                                    <td className="px-3 py-1.5 text-fg">{c.subject}</td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-right qx-num">
                                      <span className="text-success">+{fmtInt(c.additions)}</span> <span className="text-danger">−{fmtInt(c.deletions)}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Motion.div>
          ) : null}
        </AnimatePresence>
      </Motion.article>
    </li>
  );
}
