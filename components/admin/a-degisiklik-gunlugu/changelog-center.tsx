'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { m as Motion, useScroll, useSpring } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import { PanelPage } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState } from '@/components/states';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ChangelogShot, ChangelogSummaryData, LiveCommit } from '@/lib/changelog/types';
import { AREA_META, TYPE_META, areaMeta, eraColor, fmtDate, typeMeta } from './meta';
import { useChangelogSfx } from './use-sfx';
import { ChangelogHero } from './hero';
import { EraAxis } from './era-axis';
import { LiveFeed } from './live-feed';
import { Lightbox } from './lightbox';
import { WeekCard } from './week-card';

const ALL = 'all';
const MAIN_REPO = 'qratex';

let searchIndex: Promise<Record<string, string>> | null = null;
/** Madde başlıkları + commit mesajlarından oluşan tam metin dizini; ilk aramada yüklenir. */
function loadSearchIndex() {
  if (!searchIndex) {
    searchIndex = fetch('/changelog/search.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
      .catch(() => {
        searchIndex = null;
        return {};
      });
  }
  return searchIndex;
}

export function ChangelogCenter({ data, live = [] }: { data: ChangelogSummaryData; live?: LiveCommit[] }) {
  const reduce = useReducedMotionPref();
  const sfx = useChangelogSfx();
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [repo, setRepo] = useState<string>(ALL);
  const [index, setIndex] = useState<Record<string, string> | null>(null);
  const [lightbox, setLightbox] = useState<{ shots: ChangelogShot[]; i: number } | null>(null);
  const [activeEra, setActiveEra] = useState(-1);
  const q = useDeferredValue(query.trim().toLocaleLowerCase('tr'));
  const weeks = useMemo(() => data.weeks ?? [], [data.weeks]);
  const ov = data.overview;
  const eras = useMemo(() => ov?.eras ?? [], [ov?.eras]);

  useEffect(() => {
    if (q && !index) void loadSearchIndex().then(setIndex);
  }, [q, index]);

  const baseText = useMemo(
    () => new Map(weeks.map((w) => [w.week, [w.week, w.title, w.summary, ...w.highlights].join(' ').toLocaleLowerCase('tr')])),
    [weeks],
  );

  const presentAreas = useMemo(() => {
    const st = new Set(weeks.flatMap((w) => w.areas));
    return Object.keys(AREA_META).filter((a) => st.has(a));
  }, [weeks]);
  const presentTypes = useMemo(() => {
    const st = new Set(weeks.flatMap((w) => w.types));
    return Object.keys(TYPE_META).filter((t) => st.has(t));
  }, [weeks]);
  const presentRepos = useMemo(() => {
    const st = new Set(weeks.map((w) => w.repo || MAIN_REPO));
    const ordered = (data.totals.repos ?? []).map((r) => r.name).filter((n) => st.has(n));
    return [...ordered, ...[...st].filter((n) => !ordered.includes(n))];
  }, [weeks, data.totals.repos]);

  const filtered = useMemo(
    () =>
      weeks.filter((w) => {
        if (repo !== ALL && (w.repo || MAIN_REPO) !== repo) return false;
        if (area !== ALL && !w.areas.includes(area)) return false;
        if (type !== ALL && !w.types.includes(type)) return false;
        if (q && !baseText.get(w.week)?.includes(q) && !index?.[w.week]?.includes(q)) return false;
        return true;
      }),
    [weeks, repo, area, type, q, baseText, index],
  );
  const filtering = Boolean(q) || area !== ALL || type !== ALL || repo !== ALL;

  const changeFilter = useCallback((set: (v: string) => void) => (v: string | null) => {
    sfx.play('tick', 0.55);
    set(v ?? ALL);
  }, [sfx]);

  const clearFilters = useCallback(() => {
    setQuery(''); setArea(ALL); setType(ALL); setRepo(ALL);
  }, []);

  const jumpTo = useCallback((weekId: string) => {
    const go = () => document.getElementById(`hafta-${weekId}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (!document.getElementById(`hafta-${weekId}`)) {
      clearFilters();
      requestAnimationFrame(() => requestAnimationFrame(go));
    } else go();
  }, [reduce, clearFilters]);

  const onEra = (i: number) => {
    sfx.play('swipe', 0.6);
    setActiveEra(i);
    const target = weeks.find((w) => w.era === i) ?? weeks.find((w) => eras[i]?.weeks?.includes(w.week));
    if (target) jumpTo(target.week);
  };

  const onMilestone = (date: string) => {
    const target = weeks.find((w) => w.from && w.to && date >= w.from && date <= w.to)
      ?? [...weeks].sort((a, b) => Math.abs(new Date(a.from ?? 0).getTime() - new Date(date).getTime()) - Math.abs(new Date(b.from ?? 0).getTime() - new Date(date).getTime()))[0];
    if (target) jumpTo(target.week);
  };

  // Kendi kendini çizen zaman çizgisi (kaydırmaya bağlı ilerleme).
  const railRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: railRef, offset: ['start 75%', 'end 60%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  // Görünürdeki haftanın dönemi → dönem şeridinde etkin blok.
  useEffect(() => {
    const els = filtered.map((w) => document.getElementById(`hafta-${w.week}`)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!hit) return;
        const w = weeks.find((x) => `hafta-${x.week}` === hit.target.id);
        if (w) setActiveEra(w.era);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [filtered, weeks]);

  const t = data.totals;

  return (
    <PanelPage>
      <div className="min-w-0 space-y-8 overflow-x-clip">
        <ChangelogHero data={data} sfx={sfx} liveCount={live.length} />

        <LiveFeed commits={live} />

        {(eras.length > 0 || (ov?.milestones?.length ?? 0) > 0) && t.firstDate && t.lastDate ? (
          <EraAxis
            eras={eras}
            milestones={ov?.milestones ?? []}
            from={t.firstDate}
            to={t.lastDate}
            activeEra={activeEra}
            onEra={onEra}
            onMilestone={(m) => onMilestone(m.date)}
            sfx={sfx}
          />
        ) : null}

        {/* Filtreler — yapışık, cam görünüm */}
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[var(--z-sticky)] space-y-3 rounded-2xl border border-border bg-surface-1/85 p-3 shadow-sm backdrop-blur-xl sm:p-4">
          <label className="relative block min-w-0">
            <span className="sr-only">Günlükte ara</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Başlık, madde veya commit mesajı ara"
              className="min-h-11 pl-9"
            />
          </label>
          <details className="group">
            <summary className="cursor-pointer select-none text-sm text-fg-muted marker:text-fg-subtle">Filtreler{filtering ? ' (etkin)' : ''}</summary>
            <div className="mt-3 space-y-2">
              {presentRepos.length > 1 ? (
                <ChoiceChips aria-label="Depo filtresi" size="sm" scroll value={repo} onChange={changeFilter(setRepo)}
                  options={[{ value: ALL, label: 'Tüm depolar' }, ...presentRepos.map((r) => ({ value: r, label: r === MAIN_REPO ? r : `İlk sürüm · ${r}` }))]} />
              ) : null}
              {presentAreas.length > 0 ? (
                <ChoiceChips aria-label="Alan filtresi" size="sm" scroll value={area} onChange={changeFilter(setArea)}
                  options={[{ value: ALL, label: 'Tüm alanlar' }, ...presentAreas.map((a) => ({ value: a, label: areaMeta(a).label }))]} />
              ) : null}
              {presentTypes.length > 0 ? (
                <ChoiceChips aria-label="Tür filtresi" size="sm" scroll value={type} onChange={changeFilter(setType)}
                  options={[{ value: ALL, label: 'Tüm türler' }, ...presentTypes.map((x) => ({ value: x, label: typeMeta(x).label }))]} />
              ) : null}
            </div>
          </details>
          {filtering ? (
            <div className="flex items-center justify-between gap-2 text-sm text-fg-muted" aria-live="polite">
              <span>{filtered.length} hafta eşleşti</span>
              <Button variant="ghost" size="sm" onClick={() => { sfx.play('tick', 0.5); clearFilters(); }}>
                <X className="mr-1 h-4 w-4" aria-hidden /> Temizle
              </Button>
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Eşleşen hafta yok" description="Aramayı kısaltın veya filtreleri temizleyin." />
        ) : (
          <div className="relative">
            {/* Ray: soluk iz + kaydırdıkça çizilen dönem renkli çizgi */}
            <div className="absolute bottom-0 left-[13px] top-0 w-0.5 rounded-full bg-border sm:left-[25px]" aria-hidden />
            <Motion.div
              aria-hidden
              className="absolute bottom-0 left-[13px] top-0 w-0.5 rounded-full sm:left-[25px]"
              style={{
                scaleY: reduce ? 1 : progress,
                transformOrigin: 'top',
                background: `linear-gradient(180deg, ${(eras.length ? [...eras].reverse().map((_, k) => eraColor(eras.length - 1 - k)) : [eraColor(0), eraColor(1)]).join(', ')})`,
                boxShadow: '0 0 12px hsl(var(--primary) / 0.45)',
              }}
            />
            <ol ref={railRef} className="relative space-y-8" aria-label="Haftalık zaman çizelgesi">
              {filtered.map((w, i) => {
                const prev = filtered[i - 1];
                const firstOfEra = w.era >= 0 && (!prev || prev.era !== w.era);
                return (
                  <WeekCard
                    key={w.week}
                    week={w}
                    index={i}
                    area={area}
                    type={type}
                    sfx={sfx}
                    firstOfEra={firstOfEra}
                    eraName={eras[w.era]?.name}
                    onShot={(shots, si) => setLightbox({ shots, i: si })}
                  />
                );
              })}
            </ol>
            <p className="mt-8 pl-8 text-sm text-fg-subtle sm:pl-14">
              İlk commit: {fmtDate(t.firstDate, { day: 'numeric', month: 'long', year: 'numeric' })}. Son derleme {fmtDate(data.generatedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
            </p>
          </div>
        )}
      </div>

      <Lightbox
        shots={lightbox?.shots ?? []}
        index={lightbox?.i ?? null}
        onIndex={(i) => { sfx.play('swipe', 0.4); setLightbox((l) => (l ? { ...l, i } : l)); }}
        onClose={() => { sfx.play('close-sheet', 0.5); setLightbox(null); }}
      />
    </PanelPage>
  );
}
