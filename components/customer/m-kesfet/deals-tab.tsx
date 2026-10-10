'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CreditCard, Globe2, Mail, MapPin, Tag, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { SectionCard } from '@/components/ds/page';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { EmptyState, QueryState, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  formatDayLabel,
  formatDuration,
  formatRecurrence,
  formatWindowRange,
  parseOffer,
  scheduleOffers,
  type HappyHourOffer,
  type ScheduledOffer,
} from '@/lib/places/happy-hour-schedule';
import type { DealsResponse, FlashOfferDto, HappyHourDto } from '@/lib/places/types';
import { fetchDeals, placesKeys, venueHref, type Coords } from './api';
import { usePlacesCopy } from './copy';
import { formatDate, formatMultiplierLabel, formatRelative } from './format';
import { EventCard } from './event-card';
import { usePlacesUrl } from './use-places-url';
import { VenueAvatar } from './venue-parts';

type Scope = 'all' | 'near' | 'saved';
const NEAR_KM = 10;

/** Dakikalık saat — görünmezken durur (geri sayımlar arka planda kaymaz: görünür olunca anında tazelenir). */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
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

function inScope(dealerId: string | null, distanceKm: number | null, scope: Scope, saved: Set<string>): boolean {
  if (scope === 'all' || dealerId === null) return true; // platform geneli her yerde geçerli
  if (scope === 'saved') return saved.has(dealerId);
  return distanceKm !== null && distanceKm <= NEAR_KM;
}

export function DealsTab({
  coords,
  initial,
  onRequestLocation,
}: {
  coords: Coords;
  initial: DealsResponse | null;
  onRequestLocation: () => void;
}) {
  const { copy, locale } = usePlacesCopy();
  const url = usePlacesUrl();
  const scopeRaw = url.get('deal');
  const scope: Scope = scopeRaw === 'near' || scopeRaw === 'saved' ? scopeRaw : 'all';
  const proposal = url.get('proposal');
  const now = useNow();
  const userTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }, []);

  const query = useQuery({
    queryKey: placesKeys.deals(coords),
    queryFn: ({ signal }) => fetchDeals(coords, signal),
    initialData: coords ? undefined : initial ?? undefined,
    placeholderData: coords && initial ? initial : undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const view = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    const saved = new Set(d.savedDealerIds);
    const byId = new Map<string, HappyHourDto>(d.happyHours.map((h) => [h.id, h]));
    const offers = d.happyHours
      .filter((h) => inScope(h.dealerId, h.distanceKm, scope, saved))
      .map((h) => parseOffer(h))
      .filter((o): o is HappyHourOffer => o !== null);
    const scheduled = scheduleOffers(offers, now, userTz, d.timeZone);
    const flash = d.flash.filter((f) => inScope(f.dealerId, f.distanceKm, scope, saved));
    return {
      byId,
      live: scheduled.filter((s) => s.status === 'live'),
      today: scheduled.filter((s) => s.status === 'today'),
      upcoming: scheduled.filter((s) => s.status === 'upcoming'),
      flash,
    };
  }, [query.data, scope, now, userTz]);

  const best = view?.live[0] ?? null;
  const next = !best ? view?.today[0] ?? view?.upcoming[0] ?? null : null;

  return (
    <QueryState
      query={query}
      skeleton="cards"
      isEmpty={(d) => d.happyHours.length === 0 && d.events.length === 0 && d.upcomingEvents.length === 0 && d.flash.length === 0 && d.personal.length === 0}
      empty={<EmptyState icon={Zap} title={copy.dealsEmptyTitle} description={copy.dealsEmptyBody} />}
    >
      {(data) => (
        <div className="flex flex-col gap-6">
          <NowHero best={best} next={next} now={now} userTz={userTz} />

          <div className="flex flex-wrap items-center gap-2">
            <ChoiceChips
              aria-label={copy.dealsFilterLabel}
              size="sm"
              scroll
              options={[
                { value: 'all', label: copy.dealsFilterAll },
                { value: 'near', label: copy.dealsFilterNear },
                { value: 'saved', label: copy.dealsFilterSaved },
              ]}
              value={scope}
              onChange={(v) => url.set({ deal: v && v !== 'all' ? v : null })}
            />
            {scope === 'near' && !coords && (
              <Button type="button" variant="link" className="min-h-11 px-1" onClick={onRequestLocation}>
                <MapPin aria-hidden className="mr-1 h-4 w-4" />
                {copy.needLocationForNear}
              </Button>
            )}
          </div>

          {view && (view.live.length > 0 || view.today.length > 0 || view.upcoming.length > 0) ? (
            <SectionCard title={copy.happyHoursTitle} description={copy.appliesHappyHour} icon={<Zap aria-hidden className="h-4 w-4" />}>
              <div className="flex flex-col gap-5">
                <HappyGroup title={copy.happyLive} items={view.live} byId={view.byId} now={now} userTz={userTz} />
                <HappyGroup title={copy.happyToday} items={view.today} byId={view.byId} now={now} userTz={userTz} />
                <HappyGroup title={copy.happyUpcoming} items={view.upcoming} byId={view.byId} now={now} userTz={userTz} />
              </div>
            </SectionCard>
          ) : scope !== 'all' ? (
            <p className="qx-small text-fg-muted">{copy.dealsFilterEmpty}</p>
          ) : null}

          {data.events.length > 0 && (
            <section aria-labelledby="deals-events" className="flex flex-col gap-3">
              <h2 id="deals-events" className="qx-h3 text-fg">
                {copy.eventsTitle}
              </h2>
              {data.events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </section>
          )}

          {data.upcomingEvents.length > 0 && (
            <section aria-labelledby="deals-upcoming" className="flex flex-col gap-2">
              <h2 id="deals-upcoming" className="qx-h3 text-fg">
                {copy.upcomingEvents}
              </h2>
              <ul className="flex flex-col gap-2">
                {data.upcomingEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-card border border-subtle bg-surface-1 p-3">
                    <CalendarDays aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="qx-body font-semibold text-fg">{e.name}</p>
                      <p className="qx-caption text-fg-muted">
                        {copy.startsOn(formatDate(e.startDate, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}
                        {e.multiplier > 1 && ` · ${copy.eventMultiplier(formatMultiplierLabel(e.multiplier, locale))}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view && view.flash.length > 0 && (
            <section aria-labelledby="deals-flash" className="flex flex-col gap-3">
              <div>
                <h2 id="deals-flash" className="qx-h3 text-fg">
                  {copy.flashTitle}
                </h2>
                <p className="qx-caption text-fg-muted">{copy.flashHint}</p>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {view.flash.map((f) => (
                  <FlashCard key={f.id} offer={f} />
                ))}
              </ul>
            </section>
          )}

          {data.personal.length > 0 && (
            <section aria-labelledby="deals-personal" className="flex flex-col gap-3">
              <div>
                <h2 id="deals-personal" className="qx-h3 text-fg">
                  {copy.personalTitle}
                </h2>
                <p className="qx-caption text-fg-muted">{copy.personalHint}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {data.personal.map((p) => {
                  const hl = !!proposal && p.proposalId === proposal;
                  return (
                    <li
                      key={p.id}
                      className={cn('flex items-start gap-3 rounded-card border bg-surface-1 p-3', hl ? 'border-brand-border ring-2 ring-brand-border' : 'border-subtle')}
                      aria-current={hl ? 'true' : undefined}
                    >
                      <Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <p className="qx-body font-semibold text-fg">{p.title}</p>
                        <p className="qx-small whitespace-pre-line break-words text-fg-muted">{p.message}</p>
                        <p className="qx-caption mt-1 text-fg-subtle">
                          {p.venueName ? `${p.venueName} · ` : ''}
                          {formatRelative(p.createdAt, locale)}
                        </p>
                      </div>
                      {p.dealerId && (
                        <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
<Link href={venueHref(p.dealerId as string)} prefetch={false} >
                          {copy.seeVenue}
                        </Link>
</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </QueryState>
  );
}

function NowHero({
  best,
  next,
  now,
  userTz,
}: {
  best: ScheduledOffer | null;
  next: ScheduledOffer | null;
  now: Date;
  userTz: string | undefined;
}) {
  const { copy, locale } = usePlacesCopy();
  if (!best) {
    return (
      <GlowCard register="play" accent="info" className="flex flex-col gap-1">
        <p className="qx-overline text-fg-muted">{copy.dealsNowTitle}</p>
        <p className="qx-body text-fg">{copy.dealsNowEmpty}</p>
        {next?.window && (
          <p className="qx-small text-fg-muted">
            {copy.dealsNext(
              `${formatDayLabel(next.window.start, now, locale, userTz)} ${formatWindowRange(next.window, locale, userTz)} · ${next.dealer?.businessName ?? copy.dealsNowAll}`,
            )}
          </p>
        )}
      </GlowCard>
    );
  }
  const left = best.window ? formatDuration(best.window.end.getTime() - now.getTime(), locale) : null;
  return (
    <GlowCard register="play" accent="brand" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span className="qx-display qx-num font-bold text-brand" aria-hidden>
          {formatMultiplierLabel(best.multiplier, locale)}
        </span>
        <div className="min-w-0">
          <p className="qx-overline text-fg-muted">{copy.dealsNowTitle}</p>
          <p className="qx-body font-semibold text-fg">
            <span className="sr-only">{copy.boostChip(formatMultiplierLabel(best.multiplier, locale))} · </span>
            {best.name}
          </p>
          <p className="qx-small text-fg-muted">
            {best.scope === 'global' ? copy.dealsNowAll : best.dealer?.businessName}
            {left && ` · ${copy.dealsNowEnds(left)}`}
          </p>
        </div>
      </div>
      <div className="flex gap-2 sm:ml-auto">
        {best.scope === 'dealer' && best.dealer?.id ? (
          <Button asChild className="min-h-11">
<Link href={venueHref(best.dealer!.id)} prefetch={false} >
            {copy.seeVenue}
          </Link>
</Button>
        ) : null}
        <Button asChild variant={best.scope === 'dealer' ? 'outline' : 'default'} className="min-h-11">
          <Link href="/customer/my-card">
            <CreditCard aria-hidden className="mr-2 h-4 w-4" />
            {copy.showCard}
          </Link>
        </Button>
      </div>
    </GlowCard>
  );
}

function HappyGroup({
  title,
  items,
  byId,
  now,
  userTz,
}: {
  title: string;
  items: ScheduledOffer[];
  byId: Map<string, HappyHourDto>;
  now: Date;
  userTz: string | undefined;
}) {
  const { copy, locale } = usePlacesCopy();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="qx-small font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((o) => {
          const dto = byId.get(o.id);
          const w = o.window;
          const timing = w
            ? o.status === 'live'
              ? copy.endsIn(formatDuration(w.end.getTime() - now.getTime(), locale))
              : `${formatDayLabel(w.start, now, locale, userTz)} ${formatWindowRange(w, locale, userTz)}`
            : null;
          return (
            <li key={o.id} className="flex items-center gap-3 rounded-control border border-subtle p-3">
              {o.scope === 'global' ? (
                <span aria-hidden className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-control', TONE_CHIP.brand)}>
                  <Globe2 className="h-5 w-5" />
                </span>
              ) : (
                <VenueAvatar name={o.dealer?.businessName ?? o.name} src={o.dealer?.image ?? null} size={44} />
              )}
              <div className="min-w-0 flex-1">
                <p className="qx-body truncate font-semibold text-fg">{o.scope === 'global' ? copy.dealsNowAll : o.dealer?.businessName}</p>
                <p className="qx-small truncate text-fg-muted">
                  {o.name} · {formatRecurrence(o, locale, userTz)}
                </p>
                <p className={cn('qx-caption', o.status === 'live' ? 'font-semibold text-success' : 'text-fg-muted')}>
                  {timing}
                  {dto?.distanceKm != null && ` · ${dto.distanceKm.toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR')} km`}
                </p>
              </div>
              <span className={cn('qx-small shrink-0 rounded-chip px-2 py-1 font-bold', TONE_CHIP.brand)}>{formatMultiplierLabel(o.multiplier, locale)}</span>
              {o.scope === 'dealer' && o.dealer?.id && (
                <Button asChild variant="ghost" size="sm" className="min-h-11 shrink-0">
<Link href={venueHref(o.dealer!.id)} prefetch={false} aria-label={`${copy.seeVenue}: ${o.dealer.businessName ?? ''}`}>
                  <MapPin aria-hidden className="h-4 w-4" />
                </Link>
</Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FlashCard({ offer }: { offer: FlashOfferDto }) {
  const { copy, locale } = usePlacesCopy();
  return (
    <li className="flex flex-col gap-2 rounded-card border border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={cn('qx-small inline-flex items-center gap-1 rounded-chip px-2 py-1 font-bold', TONE_CHIP.warning)}>
          <Tag aria-hidden className="h-3.5 w-3.5" />
          {copy.flashValue(offer.offerType, offer.value, locale)}
        </span>
        <CountdownChip target={offer.validTo} size="sm" />
      </div>
      <p className="qx-body font-semibold text-fg">{offer.title}</p>
      {offer.body && <p className="qx-small text-fg-muted">{offer.body}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="qx-caption truncate text-fg-muted">
          {offer.venueName}
          {offer.distanceKm != null && ` · ${offer.distanceKm.toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR')} km`}
        </span>
        <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
<Link href={venueHref(offer.dealerId)} prefetch={false} >
          {copy.seeVenue}
        </Link>
</Button>
      </div>
    </li>
  );
}
