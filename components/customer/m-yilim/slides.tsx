'use client';

/**
 * Yılım hikâye slaytları. Her slayt TEK büyük gerçek + kısa bağlam anlatır; değerler
 * yalnız sunucu özetinden gelir. Koyu "arena" zemini üstünde beyaz metin (≥ 7:1).
 * Giriş animasyonu bütçeli (listItem, ilk 12 öğe, ≤ 0,6 sn); azaltılmış harekette statik.
 */
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { Star, MessageSquareQuote, Flame, Store, ScanLine, RotateCcw, ArrowLeft } from 'lucide-react';
import { listItem } from '@/lib/motion';
import { LeagueEmblem } from '@/components/ds/play';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';
import type { SlideId } from './slides-model';
import { CountUp } from './count-up';
import { ActivityBars, PlaceLogo, YearBadgeGlyph } from './parts';
import { ShareCardButton } from './share-button';
import { buildShareCardData, renderYearCard } from './share-card';

export type SlideProps = {
  summary: YearSummary;
  copy: YearCopy;
  /** Kapanış slaytı eylemleri. */
  onReplay?: () => void;
  onDone?: () => void;
};

function Item({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <Motion.div variants={listItem} custom={i} initial="hidden" animate="visible" className={className}>
      {children}
    </Motion.div>
  );
}

function Overline({ children }: { children: ReactNode }) {
  return <p className="qx-overline text-white/80">{children}</p>;
}

const BIG = 'font-display font-bold tabular-nums leading-[0.9] tracking-tight text-white';

function periodOf(s: YearSummary, copy: YearCopy) {
  return copy.periodLabel(s.period.year, s.period.month);
}

// ───────────────────────────── slaytlar ─────────────────────────────

function IntroSlide({ summary, copy }: SlideProps) {
  const label = periodOf(summary, copy);
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <Item i={0}>
        <Overline>{copy.overline}</Overline>
      </Item>
      <Item i={1}>
        <h2 className={cn(BIG, 'break-words', summary.period.month ? 'text-[clamp(3rem,14vw,5.5rem)]' : 'text-[clamp(4.5rem,22vw,8.5rem)]')}>
          <span className="bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">{label}</span>
        </h2>
      </Item>
      <Item i={2}>
        <p className="max-w-sm text-2xl font-semibold text-white">{copy.story.intro.line(label)}</p>
      </Item>
      <Item i={3}>
        <p className="max-w-sm qx-body text-white/80">{copy.story.intro.sub}</p>
      </Item>
      <Item i={4}>
        <p className="qx-small text-white/70">{copy.story.hint}</p>
      </Item>
    </div>
  );
}

function VisitsSlide({ summary, copy }: SlideProps) {
  const v = summary.visits;
  const prevLabel = copy.periodLabel(summary.previous.year, summary.previous.month);
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <Item i={0}>
        <Overline>{copy.story.visits.lead}</Overline>
      </Item>
      <Item i={1}>
        <p className={cn(BIG, 'text-[clamp(5rem,30vw,11rem)]')}>
          <CountUp value={v.total} format={copy.fmt} />
        </p>
        <p className="mt-2 text-3xl font-semibold text-white">{copy.story.visits.unit}</p>
      </Item>
      <Item i={2}>
        <p className="qx-body text-white/85">{copy.story.visits.days(v.activeDays, v.places)}</p>
      </Item>
      {v.longestStreak >= 2 ? (
        <Item i={3}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.1] px-4 py-2 font-semibold text-white">
            <Flame className="size-5" aria-hidden="true" />
            {copy.story.visits.streak(v.longestStreak)}
          </p>
        </Item>
      ) : null}
      <Item i={4}>
        <p className="qx-small text-white/75">{copy.story.visits.compare(v.total, v.previousTotal, prevLabel)}</p>
      </Item>
    </div>
  );
}

function FavoriteSlide({ summary, copy }: SlideProps) {
  const [top, ...rest] = summary.favorites;
  if (!top) return null;
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <Item i={0}>
        <Overline>{copy.story.favorite.lead}</Overline>
      </Item>
      <Item i={1} className="flex items-center gap-4">
        <PlaceLogo name={top.name} src={top.logo} size={88} />
        <div className="min-w-0">
          <h2 className="break-words text-[clamp(2rem,9vw,3.5rem)] font-bold leading-tight text-white">{top.name}</h2>
          {top.category ? <p className="qx-small capitalize text-white/75">{top.category}</p> : null}
        </div>
      </Item>
      <Item i={2}>
        <p className="text-xl font-semibold text-white">{copy.story.favorite.counts(top.visits, top.reviews)}</p>
      </Item>
      <Item i={3}>
        <Link
          href={`/customer/places/${encodeURIComponent(top.dealerId)}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-4 font-semibold text-white underline-offset-4 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Store className="size-4" aria-hidden="true" />
          {copy.story.favorite.open(top.name)}
        </Link>
      </Item>
      {rest.length ? (
        <Item i={4}>
          <p className="qx-overline mb-2 text-white/70">{copy.story.favorite.others}</p>
          <ol className="space-y-2" start={2}>
            {rest.map((p, idx) => (
              <li key={p.dealerId} className="flex items-center gap-3 rounded-2xl bg-white/[0.1] p-2 pr-4">
                <span className="w-6 text-center font-display font-bold text-white/80" aria-hidden="true">
                  {idx + 2}
                </span>
                <PlaceLogo name={p.name} src={p.logo} size={40} className="rounded-xl" />
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{p.name}</span>
                <span className="qx-small shrink-0 text-white/75">{copy.story.favorite.counts(p.visits, p.reviews)}</span>
              </li>
            ))}
          </ol>
        </Item>
      ) : null}
    </div>
  );
}

function Stars({ value, size = 'size-7' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn(size, s <= value ? 'fill-white text-white' : 'text-white/35')} />
      ))}
    </span>
  );
}

function RatingsSlide({ summary, copy }: SlideProps) {
  const r = summary.reviews;
  const max = Math.max(1, ...r.distribution);
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <Item i={0}>
        <Overline>{copy.story.ratings.lead(r.total)}</Overline>
      </Item>
      {r.mostGiven != null ? (
        <Item i={1}>
          <p className="qx-body text-white/85">{copy.story.ratings.most}</p>
          <p className="mt-1 flex items-end gap-3">
            <span className={cn(BIG, 'text-[clamp(5rem,30vw,10rem)]')}>{r.mostGiven}</span>
            <Stars value={r.mostGiven} />
            <span className="sr-only">{copy.story.ratings.stars(r.mostGiven)}</span>
          </p>
        </Item>
      ) : null}
      {r.average != null ? (
        <Item i={2}>
          <p className="text-lg font-semibold text-white">{copy.story.ratings.avg(r.average)}</p>
        </Item>
      ) : null}
      <Item i={3}>
        <p className="qx-overline mb-2 text-white/70" id="year-rating-dist">
          {copy.story.ratings.dist}
        </p>
        <ul aria-labelledby="year-rating-dist" className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((s) => {
            const c = r.distribution[s - 1] ?? 0;
            return (
              <li key={s} className="flex items-center gap-3">
                <span className="w-8 font-display font-bold text-white" aria-hidden="true">
                  {s}★
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.15]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-white" style={{ width: `${(c / max) * 100}%` }} />
                </span>
                <span className="w-10 text-right font-display tabular-nums text-white/85" aria-hidden="true">
                  {copy.fmt(c)}
                </span>
                <span className="sr-only">{copy.story.ratings.row(s, c)}</span>
              </li>
            );
          })}
        </ul>
      </Item>
    </div>
  );
}

function ImpactSlide({ summary, copy }: SlideProps) {
  const im = summary.impact;
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <Item i={0}>
        <Overline>{copy.story.impact.lead}</Overline>
      </Item>
      <Item i={1}>
        <p className={cn(BIG, 'text-[clamp(5rem,30vw,10rem)]')}>
          <CountUp value={im.respondingDealers} format={copy.fmt} />
        </p>
        <p className="mt-2 text-2xl font-semibold text-white">{copy.story.impact.dealers(im.respondingDealers)}</p>
      </Item>
      {im.replyRate != null ? (
        <Item i={2}>
          <p className="qx-body text-white/85">{copy.story.impact.rate(im.replyRate, im.repliedReviews)}</p>
        </Item>
      ) : null}
      {im.quote ? (
        <Item i={3}>
          <figure className="rounded-3xl border border-white/20 bg-white/[0.1] p-5">
            <MessageSquareQuote className="mb-2 size-6 text-white/80" aria-hidden="true" />
            <blockquote className="text-lg font-medium leading-snug text-white">“{im.quote.text}”</blockquote>
            <figcaption className="mt-3 qx-small text-white/75">{copy.story.impact.quoteFrom(im.quote.dealerName)}</figcaption>
          </figure>
        </Item>
      ) : null}
    </div>
  );
}

function BadgesSlide({ summary, copy }: SlideProps) {
  const b = summary.badges;
  const shown = b.items.slice(0, 6);
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <Item i={0}>
        <Overline>{copy.story.badges.title}</Overline>
      </Item>
      <Item i={1}>
        <h2 className={cn(BIG, 'text-[clamp(2.5rem,11vw,4.5rem)] leading-tight')}>{copy.story.badges.lead(b.total)}</h2>
      </Item>
      <Item i={2}>
        <ul className="grid grid-cols-3 gap-4">
          {shown.map((badge) => (
            <li key={badge.id} className="flex flex-col items-center gap-2 text-center">
              <YearBadgeGlyph badge={badge} size="lg" />
              <span className="line-clamp-2 qx-small font-semibold text-white">{badge.name}</span>
            </li>
          ))}
        </ul>
      </Item>
      {b.total > shown.length ? (
        <Item i={3}>
          <p className="qx-small text-white/75">{copy.story.badges.more(b.total - shown.length)}</p>
        </Item>
      ) : null}
    </div>
  );
}

function JourneySlide({ summary, copy }: SlideProps) {
  const j = summary.journey;
  const closed = summary.period.isClosed;
  const changed = j.startLeague && j.endLeague && j.startLeague.key !== j.endLeague.key;
  const finalLeague = j.endLeague ?? j.peakLeague;
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <Item i={0}>
        <Overline>{copy.story.journey.lead}</Overline>
      </Item>
      {changed && j.startLeague && j.endLeague ? (
        <Item i={1} className="flex items-center justify-between gap-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <LeagueEmblem leagueKey={j.startLeague.key} name={j.startLeague.name} size="lg" register="play" />
            <span className="qx-caption text-white/75">{copy.story.journey.from}</span>
            <span className="font-semibold text-white">{j.startLeague.name}</span>
          </div>
          <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-white/30 to-white" />
          <div className="flex flex-col items-center gap-2 text-center">
            <LeagueEmblem leagueKey={j.endLeague.key} name={j.endLeague.name} size="xl" register="play" />
            <span className="qx-caption text-white/75">{copy.story.journey.to(closed)}</span>
            <span className="font-semibold text-white">{j.endLeague.name}</span>
          </div>
        </Item>
      ) : finalLeague ? (
        <Item i={1} className="flex items-center gap-4">
          <LeagueEmblem leagueKey={finalLeague.key} name={finalLeague.name} size="xl" register="play" />
          <p className="text-2xl font-bold text-white">{copy.story.journey.stay(finalLeague.name, closed)}</p>
        </Item>
      ) : null}
      {j.leagueUps.length ? (
        <Item i={2}>
          <p className="text-lg font-semibold text-white">{copy.story.journey.ups(j.leagueUps.length)}</p>
          <ol className="mt-2 flex flex-wrap items-center gap-2">
            {j.leagueUps.map((u) => (
              <li key={`${u.toKey}-${u.atIso}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.1] py-1 pl-1 pr-3">
                <LeagueEmblem leagueKey={u.toKey} name={u.toName} size="sm" register="play" />
                <span className="qx-small font-semibold text-white">{u.toName}</span>
              </li>
            ))}
          </ol>
        </Item>
      ) : null}
      {j.peakLeague && (!finalLeague || j.peakLeague.key !== finalLeague.key) ? (
        <Item i={3}>
          <p className="qx-body text-white/85">{copy.story.journey.peak(j.peakLeague.name)}</p>
        </Item>
      ) : null}
      {j.levelTo != null ? (
        <Item i={4}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.1] px-4 py-2 font-semibold text-white">
            {copy.story.journey.level(j.levelFrom, j.levelTo)}
            <span className="qx-caption font-normal text-white/75">· {copy.story.journey.levelUps(j.levelUps)}</span>
          </p>
        </Item>
      ) : null}
    </div>
  );
}

function RhythmSlide({ summary, copy }: SlideProps) {
  const r = summary.rhythm;
  if (!r.peak) return null;
  const arche = copy.archetype[r.peak];
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <Item i={0}>
        <Overline>{copy.story.rhythm.lead}</Overline>
      </Item>
      <Item i={1}>
        <h2 className={cn(BIG, 'text-[clamp(3rem,14vw,5.5rem)] leading-tight')}>{arche.name}</h2>
        <p className="mt-2 font-display text-xl text-white/85">{arche.range}</p>
      </Item>
      {r.peakShare != null ? (
        <Item i={2}>
          <p className="qx-body text-white/85">{copy.story.rhythm.share(r.peakShare)}</p>
        </Item>
      ) : null}
      {r.peakWeekday != null ? (
        <Item i={3}>
          <p className="text-lg font-semibold text-white">{copy.story.rhythm.weekday(copy.weekdays[r.peakWeekday])}</p>
        </Item>
      ) : null}
      <Item i={4}>
        <ActivityBars summary={summary} copy={copy} tone="dark" />
      </Item>
    </div>
  );
}

function OutroSlide({ summary, copy, onReplay, onDone }: SlideProps) {
  const label = periodOf(summary, copy);
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    renderYearCard(buildShareCardData(summary, copy), copy)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPng({ blob, url });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [summary, copy]);

  const suggestion = summary.reviews.total < summary.visits.total ? copy.story.outro.nextReview : copy.story.outro.nextScan;

  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <Item i={0}>
        <Overline>{copy.story.outro.lead}</Overline>
        <p className="mt-1 qx-body text-white/85">{copy.story.outro.sub}</p>
      </Item>
      <Item i={1} className="mx-auto w-full max-w-[13rem]">
        <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/25 bg-white/5 shadow-2xl">
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi
            <img src={png.url} alt={copy.story.outro.cardAlt(label)} className="h-full w-full object-cover" />
          ) : (
            <p role="status" className="flex h-full items-center justify-center p-4 text-center qx-small text-white/80">
              {failed ? copy.story.outro.cardFailed : copy.story.outro.cardPreparing}
            </p>
          )}
        </div>
      </Item>
      <Item i={2} className="flex flex-col gap-2">
        <ShareCardButton summary={summary} copy={copy} blob={png?.blob ?? null} onDark />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" className="min-h-11 gap-2 text-white hover:bg-white/[0.1] hover:text-white" onClick={onReplay}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {copy.story.outro.replay}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 gap-2 text-white hover:bg-white/[0.1] hover:text-white" onClick={onDone}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.story.outro.done}
          </Button>
        </div>
      </Item>
      <Item i={3} className="rounded-2xl border border-white/20 bg-white/5 p-4">
        <p className="qx-overline text-white/70">{copy.story.outro.nextLead}</p>
        <p className="mt-1 qx-small text-white/90">{suggestion}</p>
        <Link
          href="/customer/scan"
          className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-white underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ScanLine className="size-4" aria-hidden="true" />
          {copy.story.outro.scanCta}
        </Link>
      </Item>
    </div>
  );
}

export const SLIDE_COMPONENTS: Record<SlideId, (p: SlideProps) => ReactNode> = {
  intro: IntroSlide,
  visits: VisitsSlide,
  favorite: FavoriteSlide,
  ratings: RatingsSlide,
  impact: ImpactSlide,
  badges: BadgesSlide,
  journey: JourneySlide,
  rhythm: RhythmSlide,
  outro: OutroSlide,
};

export function slideTitle(id: SlideId, copy: YearCopy): string {
  return copy.story[id].title;
}
