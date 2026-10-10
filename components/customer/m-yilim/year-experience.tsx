'use client';

/**
 * Yılım istemci adası: kapak + dönem seçici + özet ızgarası + zaman dokusu.
 * Tam ekran hikâye (`year-story`) yalnız açıldığında `next/dynamic` ile yüklenir; kapak
 * düğmesinin üzerine gelince/odaklanınca ön yüklenir. Veri sunucudan prop olarak gelir.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Play, ScanLine, Compass, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states';
import { fadeUp } from '@/lib/motion';
import type { YearSummary } from '@/lib/customer-year/contract';
import { getYearCopy, type YearLocale } from './copy';
import { PeriodPicker, YEAR_PATH } from './period-picker';
import { SummaryGrid } from './summary-grid';
import { ActivityBars } from './parts';
import { ShareCardButton } from './share-button';

const loadStory = () => import('./year-story');
const YearStory = dynamic(loadStory, { ssr: false });

export function YearExperience({ summary, locale }: { summary: YearSummary; locale: YearLocale }) {
  const copy = getYearCopy(locale);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const label = copy.periodLabel(summary.period.year, summary.period.month);
  const isMonth = summary.period.month != null;

  const preload = useCallback(() => {
    void loadStory();
  }, []);
  const start = () => {
    setMounted(true);
    setOpen(true);
  };

  const prevYear = summary.availableYears.find((y) => y < summary.period.year);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" data-register="play">
      {/* Kapak */}
      <Motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        aria-labelledby="year-hero-title"
        className="relative isolate overflow-hidden rounded-3xl border border-white/[0.12] bg-[hsl(0_0%_5%)] p-6 text-white [color-scheme:dark] sm:p-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_100%_0%,hsl(var(--category-2)/0.35),transparent_65%),radial-gradient(70%_70%_at_0%_100%,hsl(var(--category-8)/0.32),transparent_65%),linear-gradient(160deg,hsl(var(--brand)/0.55),hsl(0_0%_4%/0.9)_70%)]"
        />
        <p className="qx-overline text-white/85">{copy.overline}</p>
        <h1 id="year-hero-title" className="mt-2 font-display text-[clamp(3.25rem,15vw,7rem)] font-bold leading-[0.9] tracking-tight">
          {label}
        </h1>
        <p className="mt-3 max-w-md qx-body text-white/90">
          {summary.period.isCurrent ? copy.heroSubtitleCurrent(isMonth) : copy.heroSubtitleClosed(isMonth)}
        </p>
        {summary.hasActivity ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
            <Button
              type="button"
              size="lg"
              onClick={start}
              onPointerEnter={preload}
              onFocus={preload}
              aria-haspopup="dialog"
              className="min-h-12 gap-2 px-6 text-base font-semibold"
            >
              <Play className="size-5 fill-current" aria-hidden="true" />
              {copy.start}
            </Button>
            <ShareCardButton summary={summary} copy={copy} variant="outline" onDark />
          </div>
        ) : null}
      </Motion.section>

      {summary.adjusted ? (
        <p role="status" className="rounded-xl border border-info-border bg-info-subtle px-4 py-3 qx-small text-info">
          {copy.adjusted}
        </p>
      ) : null}

      <PeriodPicker summary={summary} copy={copy} />

      {!summary.hasActivity ? (
        <EmptyState
          variant="first-use"
          headingLevel="h2"
          title={copy.empty.title(label)}
          description={copy.empty.body}
          action={
            <Button asChild className="min-h-11 gap-2">
              <Link href="/customer/scan">
                <ScanLine className="size-4" aria-hidden="true" />
                {copy.empty.scan}
              </Link>
            </Button>
          }
          secondaryAction={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" className="min-h-11 gap-2">
                <Link href="/customer/places">
                  <Compass className="size-4" aria-hidden="true" />
                  {copy.empty.places}
                </Link>
              </Button>
              {prevYear ? (
                <Button asChild variant="ghost" className="min-h-11 gap-2">
                  <Link href={`${YEAR_PATH}?year=${prevYear}`}>
                    <History className="size-4" aria-hidden="true" />
                    {copy.empty.tryPrevious(String(prevYear))}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          <section aria-labelledby="year-summary-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="year-summary-title" className="qx-h2 text-foreground">
                {copy.summaryHeading}
              </h2>
              <p className="qx-caption text-muted-foreground">{copy.summaryNote}</p>
            </div>
            <SummaryGrid summary={summary} copy={copy} />
          </section>

          {summary.visits.activeDays > 0 ? (
            <section aria-labelledby="year-activity-title" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <h2 id="year-activity-title" className="qx-h3 text-foreground">
                {copy.activityHeading}
              </h2>
              {summary.rhythm.peak ? (
                <p className="mt-1 qx-small text-muted-foreground">
                  {copy.archetype[summary.rhythm.peak].name} · {copy.archetype[summary.rhythm.peak].range}
                  {summary.rhythm.peakWeekday != null ? ` · ${copy.story.rhythm.weekday(copy.weekdays[summary.rhythm.peakWeekday])}` : ''}
                </p>
              ) : null}
              <ActivityBars summary={summary} copy={copy} className="mt-4" />
            </section>
          ) : null}
        </>
      )}

      {mounted ? <YearStory open={open} onOpenChange={setOpen} summary={summary} copy={copy} /> : null}
    </div>
  );
}
