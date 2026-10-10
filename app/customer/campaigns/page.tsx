'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { CalendarClock, Clock, Globe2, Info, Megaphone, QrCode, Share2, Store, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryState, SectionCard, TONE_CALLOUT } from '@/components/states';
import { listContainer, listItem } from '@/lib/motion/variants';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import {
  formatDayLabel,
  formatDuration,
  formatMultiplier,
  formatRecurrence,
  formatWindowRange,
  parseHappyHourFeedWithZone,
  scheduleOffers,
  type FeedLocale,
  type HappyHourOffer,
  type ScheduledOffer,
} from './_lib/happy-hour-feed';

/** Bu sayfaya özgü metinler (paylaşılan i18n kataloğuna dokunmadan iki dilli). */
const COPY = {
  tr: {
    eyebrow: 'Fırsatlar',
    title: 'Kampanyalar',
    description: 'İşletmelerin mutlu saatleri: şu an canlı olanlar ve sıradakiler, senin saatinle.',
    liveNow: 'Şu an canlı',
    liveCount: (n: number) => `${n} canlı kampanya`,
    endsIn: (d: string) => `Bitmesine ${d}`,
    startsIn: (d: string) => `Başlamasına ${d}`,
    allVenues: 'Tüm işletmelerde',
    appliesTo: 'Kartınla kasada kaydedilen harcamalardan kazandığın puana uygulanır.',
    showCard: 'Kartını kasada göster',
    otherLive: 'Diğer canlı kampanyalar',
    next: 'Sıradaki fırsatlar',
    nextHint: 'Bugün ve yarın başlayacak kampanyalar',
    emptyTitle: 'Şu an kampanya yok',
    emptyBody: 'İşletmeler mutlu saat başlattığında burada göreceksin. Bu sırada yakınındaki işletmeleri keşfedebilirsin.',
    explore: 'Yakınımdakileri keşfet',
    note: 'Saatler senin saat diliminde gösterilir ve çarpanın gerçekten uygulandığı zamandır. Çarpan, işletmede kartınla kaydedilen harcamalardan kazanılan puana uygulanır.',
    onlyLater: 'Şu an canlı kampanya yok — sıradaki fırsat:',
    errorTitle: 'Kampanyalar yüklenemedi',
    multiplierLabel: (m: string) => `${m} puan çarpanı`,
  },
  en: {
    eyebrow: 'Offers',
    title: 'Campaigns',
    description: 'Happy hours from businesses: what is live now and what comes next, in your time.',
    liveNow: 'Live now',
    liveCount: (n: number) => `${n} live campaign${n === 1 ? '' : 's'}`,
    endsIn: (d: string) => `Ends in ${d}`,
    startsIn: (d: string) => `Starts in ${d}`,
    allVenues: 'At all businesses',
    appliesTo: 'Applies to points earned from purchases recorded with your card at the counter.',
    showCard: 'Show your card at the counter',
    otherLive: 'Other live campaigns',
    next: 'Coming up',
    nextHint: 'Campaigns starting today and tomorrow',
    emptyTitle: 'No campaigns right now',
    emptyBody: 'When businesses start a happy hour you will see it here. Meanwhile, explore places near you.',
    explore: 'Explore nearby',
    note: 'Times are shown in your time zone and are exactly when the multiplier applies. The multiplier applies to points earned from purchases recorded with your card.',
    onlyLater: 'Nothing is live right now — next up:',
    errorTitle: 'Could not load campaigns',
    multiplierLabel: (m: string) => `${m} points multiplier`,
  },
} as const;

type Copy = (typeof COPY)[FeedLocale];

class FeedError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchFeed(): Promise<{ offers: HappyHourOffer[]; timeZone: string }> {
  const res = await fetch('/api/happy-hour', { cache: 'no-store' });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz yanıt */
  }
  const success = !!body && typeof body === 'object' && (body as { success?: unknown }).success !== false;
  if (!res.ok || !success) {
    const msg = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'happy-hour';
    throw new FeedError(res.status, msg);
  }
  return parseHappyHourFeedWithZone(body);
}

/** Geri sayımlar için dakikalık saat (görünmezken durur). */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') setNow(new Date());
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

function DealerLine({ offer, copy }: { offer: HappyHourOffer; copy: Copy }) {
  if (offer.scope === 'global') {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{copy.allVenues}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{offer.dealer?.businessName ?? '—'}</span>
    </span>
  );
}

function MultiplierChip({ value, locale, copy, size = 'md' }: { value: number; locale: FeedLocale; copy: Copy; size?: 'md' | 'lg' }) {
  const label = formatMultiplier(value, locale);
  return (
    <span
      aria-label={copy.multiplierLabel(label)}
      className={cn(
        'qx-num inline-flex shrink-0 items-center justify-center rounded-control bg-brand-subtle font-bold text-brand ring-1 ring-inset ring-brand-border tabular-nums',
        size === 'lg' ? 'h-16 min-w-16 px-3 text-3xl sm:h-20 sm:min-w-20 sm:text-4xl' : 'h-10 min-w-12 px-2 text-base'
      )}
    >
      {label}
    </span>
  );
}

function LiveSpotlight({ offer, now, locale, copy }: { offer: ScheduledOffer; now: Date; locale: FeedLocale; copy: Copy }) {
  const w = offer.window;
  const total = w ? w.end.getTime() - w.start.getTime() : 0;
  const left = w ? Math.max(0, w.end.getTime() - now.getTime()) : 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;
  return (
    <section
      aria-labelledby="live-spotlight-title"
      className="relative overflow-hidden rounded-sheet border border-brand-border bg-surface-1 p-card qx-elevation-2 sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,hsl(var(--brand)/0.14),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <MultiplierChip value={offer.multiplier} locale={locale} copy={copy} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="qx-overline inline-flex items-center gap-2 text-success">
            <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            {copy.liveNow}
          </p>
          <h2 id="live-spotlight-title" className="qx-h2 text-balance text-fg">
            {offer.name}
          </h2>
          <div className="qx-small flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
            <DealerLine offer={offer} copy={copy} />
            {w && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {formatWindowRange(w, locale)}
              </span>
            )}
          </div>
          {offer.description && <p className="qx-body text-pretty text-fg">{offer.description}</p>}
          {w && (
            <div className="space-y-1.5 pt-1">
              <p className="qx-small font-medium text-fg" aria-live="polite">
                {copy.endsIn(formatDuration(left, locale))}
              </p>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label={copy.endsIn(formatDuration(left, locale))}
              >
                <div className="h-full rounded-full bg-brand transition-[width] duration-slow ease-standard" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
        <Button asChild className="w-full shrink-0 sm:w-auto">
          <Link href="/customer/my-card">
            <QrCode className="h-4 w-4" aria-hidden />
            {copy.showCard}
          </Link>
        </Button>
      </div>
      <p className="qx-caption relative mt-4 text-fg-muted">{copy.appliesTo}</p>
    </section>
  );
}

function OfferRow({ offer, now, locale, copy }: { offer: ScheduledOffer; now: Date; locale: FeedLocale; copy: Copy }) {
  const w = offer.window;
  const isLive = offer.status === 'live';
  return (
    <div className="flex items-start gap-3 rounded-card border bg-surface-1 p-4 transition-colors duration-fast hover:border-brand-border">
      <MultiplierChip value={offer.multiplier} locale={locale} copy={copy} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="qx-body min-w-0 truncate font-semibold text-fg">{offer.name}</h3>
          {isLive && (
            <Badge variant="success" className="shrink-0">
              {copy.liveNow}
            </Badge>
          )}
        </div>
        <div className="qx-small text-fg-muted">
          <DealerLine offer={offer} copy={copy} />
        </div>
        {w && (
          <p className="qx-small flex flex-wrap items-center gap-x-3 gap-y-0.5 text-fg">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
              {isLive ? null : `${formatDayLabel(w.start, now, locale)} · `}
              {formatWindowRange(w, locale)}
            </span>
            <span className="text-fg-muted">
              {isLive
                ? copy.endsIn(formatDuration(w.end.getTime() - now.getTime(), locale))
                : copy.startsIn(formatDuration(w.start.getTime() - now.getTime(), locale))}
            </span>
          </p>
        )}
        <p className="qx-caption text-fg-muted">{formatRecurrence(offer, locale)}</p>
      </div>
    </div>
  );
}

function OfferList({ offers, now, locale, copy }: { offers: ScheduledOffer[]; now: Date; locale: FeedLocale; copy: Copy }) {
  return (
    <Motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-3">
      {offers.map((offer) => (
        <Motion.li key={offer.id} variants={listItem}>
          <OfferRow offer={offer} now={now} locale={locale} copy={copy} />
        </Motion.li>
      ))}
    </Motion.ul>
  );
}

function CampaignsFeed({
  data,
  now,
  locale,
  copy,
}: {
  data: { offers: HappyHourOffer[]; timeZone: string };
  now: Date;
  locale: FeedLocale;
  copy: Copy;
}) {
  const scheduled = useMemo(() => scheduleOffers(data.offers, now, undefined, data.timeZone), [data, now]);
  const live = scheduled.filter((o) => o.status === 'live');
  const later = scheduled.filter((o) => o.status !== 'live');

  if (scheduled.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={Megaphone}
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Button asChild variant="outline">
              <Link href="/customer/nearby">{copy.explore}</Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const [spotlight, ...otherLive] = live;

  return (
    <div className="space-y-6">
      {spotlight ? (
        <LiveSpotlight offer={spotlight} now={now} locale={locale} copy={copy} />
      ) : (
        <p className={cn('qx-small flex items-center gap-2 rounded-card border px-4 py-3', TONE_CALLOUT.info)}>
          <Zap className="h-4 w-4 shrink-0 text-info" aria-hidden />
          {copy.onlyLater}
        </p>
      )}

      {otherLive.length > 0 && (
        <SectionCard title={copy.otherLive} description={copy.liveCount(live.length)} icon={<Zap />} tone="success">
          <OfferList offers={otherLive} now={now} locale={locale} copy={copy} />
        </SectionCard>
      )}

      {later.length > 0 && (
        <SectionCard title={copy.next} description={copy.nextHint} icon={<CalendarClock />} tone="brand">
          <OfferList offers={later} now={now} locale={locale} copy={copy} />
        </SectionCard>
      )}
    </div>
  );
}

export default function CustomerCampaignsPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const feedLocale: FeedLocale = locale === 'en' ? 'en' : 'tr';
  const copy = COPY[feedLocale];
  const now = useNow();

  const query = useQuery({
    queryKey: ['customer', 'campaigns', 'happy-hour'],
    queryFn: fetchFeed,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof FeedError && error.status >= 400 && error.status < 500) && count < 2,
  });

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        variant="hero"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        icon={<Megaphone />}
      />

      <QueryState
        query={query}
        skeleton="cards"
        error={{ title: copy.errorTitle }}
        loadingLabel={t('customerCampaigns.loading')}
      >
        {(data) => <CampaignsFeed data={data} now={now} locale={feedLocale} copy={copy} />}
      </QueryState>

      <p role="note" className={cn('qx-small flex gap-2.5 rounded-card border px-4 py-3', TONE_CALLOUT.neutral)}>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 text-pretty">{copy.note}</span>
      </p>

      <SectionCard
        title={t('customerCampaigns.inviteTitle')}
        description={t('customerCampaigns.inviteDescription')}
        icon={<Share2 />}
        tone="brand"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/customer/referral">{t('customerCampaigns.inviteCta')}</Link>
          </Button>
        }
      >
        <p className="qx-small text-fg-muted">{t('customerCampaigns.inviteSubDescription')}</p>
      </SectionCard>
    </div>
  );
}
