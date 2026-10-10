/**
 * Mekân detayı — sunucuda çizilen (etkileşimsiz) bölümler: durum çipi, hızlı aksiyonlar,
 * teklifler ve mekân bilgisi. Hook yok; istemci JS'i taşımaz (SectionCard istemci sınırıdır).
 */
import Link from 'next/link';
import { Clock, MapPin, Navigation, ScanLine, Sparkles, Tag, Zap } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { TONE_CHIP, type Tone } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getZonedClock } from '@/lib/happy-hour-live';
import type { OpenState } from '@/lib/places/business-hours';
import type { VenueDetail, VenueHappyHour, VenueOffer } from '@/lib/venue-detail/types';
import { directionsUrl, type VenueCopy } from './copy';

export function openStateLabel(state: OpenState | null, copy: VenueCopy): { text: string; tone: Tone } | null {
  if (!state) return null;
  if (state.status === 'holiday') return { text: copy.holiday, tone: 'warning' };
  if (state.status === 'open') {
    if (!state.closesAt) return { text: copy.openAllDay, tone: 'success' };
    if (state.closingSoon) return { text: copy.closingSoon(state.closesAt), tone: 'warning' };
    return { text: copy.openUntil(state.closesAt), tone: 'success' };
  }
  const next = state.nextOpen;
  if (!next) return { text: copy.closed, tone: 'neutral' };
  if (next.inDays === 0) return { text: copy.closedOpensToday(next.time), tone: 'neutral' };
  if (next.inDays === 1) return { text: copy.closedOpensTomorrow(next.time), tone: 'neutral' };
  return { text: copy.closedOpensOn(copy.weekday(next.weekday), next.time), tone: 'neutral' };
}

export function OpenStatusChip({ state, copy }: { state: OpenState | null; copy: VenueCopy }) {
  const label = openStateLabel(state, copy);
  if (!label) return null;
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium', TONE_CHIP[label.tone])}>
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          label.tone === 'success' ? 'bg-success' : label.tone === 'warning' ? 'bg-warning' : 'bg-fg-subtle'
        )}
      />
      {label.text}
    </span>
  );
}

export function LiveBoostChip({ happyHours, copy }: { happyHours: VenueHappyHour[]; copy: VenueCopy }) {
  const live = happyHours.find((h) => h.live);
  if (!live) return null;
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium', TONE_CHIP.brand)}>
      <Zap aria-hidden className="h-3.5 w-3.5" />
      {copy.boostLive(copy.multiplier(live.multiplier))}
    </span>
  );
}

/** Yol tarifi + QR okut — mobilde başlığın hemen altında, tek dokunuş. */
export function QuickActions({ detail, copy }: { detail: VenueDetail; copy: VenueCopy }) {
  const directions = directionsUrl(detail.dealer);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3 rounded-card border border-brand-border bg-brand-subtle p-3 sm:p-4">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand text-brand-fg">
          <ScanLine className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">{copy.scanTitle}</p>
          <p className="qx-small text-fg-muted">{copy.scanBody}</p>
        </div>
        <Button asChild className="hidden shrink-0 gap-2 sm:inline-flex">
          <Link href="/customer/scan">
            <ScanLine aria-hidden className="h-4 w-4" />
            {copy.scanCta}
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
        <Button asChild className="gap-2 sm:hidden">
          <Link href="/customer/scan">
            <ScanLine aria-hidden className="h-4 w-4" />
            {copy.scanCta}
          </Link>
        </Button>
        {directions ? (
          <Button asChild variant="outline" className="gap-2">
            <a href={directions} target="_blank" rel="noopener noreferrer" aria-label={copy.directionsTo(detail.dealer.name)}>
              <Navigation aria-hidden className="h-4 w-4" />
              {copy.directions}
            </a>
          </Button>
        ) : (
          <p className="qx-caption self-center text-fg-muted">{copy.noLocation}</p>
        )}
      </div>
    </div>
  );
}

function offerValue(o: VenueOffer, copy: VenueCopy): string | null {
  const v = o.value;
  if (o.offerType === 'COMPLIMENTARY') return copy.offerComplimentary;
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (o.offerType === 'PERCENT') return copy.offerPercent(String(Math.round(v)));
  if (o.offerType === 'FIXED_TRY') return copy.offerFixed(copy.money(v));
  return null;
}

export function OffersSection({ detail, copy }: { detail: VenueDetail; copy: VenueCopy }) {
  if (detail.offers.length === 0 && detail.happyHours.length === 0) return null;
  return (
    <SectionCard title={copy.offersTitle} description={copy.offersDesc} icon={<Tag />} tone="brand">
      <ul className="grid gap-3 sm:grid-cols-2">
        {detail.happyHours.map((h) => (
          <li key={`hh-${h.id}`} className="rounded-control border border-border bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-fg">{h.name}</p>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', TONE_CHIP.brand)}>
                {copy.happyHourPoints(copy.multiplier(h.multiplier))}
              </span>
            </div>
            <p className="qx-small mt-1 flex items-center gap-1.5 text-fg-muted">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              <span className="tabular-nums">
                {h.startTime}–{h.endTime}
              </span>
              <span aria-hidden>·</span>
              <span className={h.live ? 'font-medium text-success' : undefined}>
                {h.live ? copy.happyHourLive : copy.happyHourToday(h.startTime)}
              </span>
            </p>
            {h.global && <p className="qx-caption mt-1 text-fg-muted">{copy.happyHourGlobal}</p>}
          </li>
        ))}
        {detail.offers.map((o) => {
          const value = offerValue(o, copy);
          return (
            <li key={`fo-${o.id}`} className="rounded-control border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-fg">{o.title}</p>
                {value && (
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', TONE_CHIP.success)}>{value}</span>
                )}
              </div>
              {o.body && <p className="qx-small mt-1 text-fg">{o.body}</p>}
              <p className="qx-caption mt-1 flex items-center gap-1.5 text-fg-muted">
                <Sparkles aria-hidden className="h-3.5 w-3.5" />
                {copy.offerUntil(copy.dateTime(new Date(o.validTo)))}
              </p>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

export function AboutCard({ detail, copy, now }: { detail: VenueDetail; copy: VenueCopy; now: Date }) {
  const today = getZonedClock(now, 'Europe/Istanbul').day;
  const mainDirections = directionsUrl(detail.dealer);
  return (
    <SectionCard title={copy.aboutTitle} icon={<MapPin />} density="compact">
      <div className="space-y-4">
        {detail.dealer.description && <p className="qx-small text-fg">{detail.dealer.description}</p>}

        <div>
          <h3 className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">{copy.address}</h3>
          {detail.dealer.address ? (
            <p className="qx-small mt-1 text-fg">{detail.dealer.address}</p>
          ) : (
            <p className="qx-small mt-1 text-fg-muted">{copy.noLocation}</p>
          )}
          {mainDirections && (
            <a
              href={mainDirections}
              target="_blank"
              rel="noopener noreferrer"
              className="qx-small mt-1 inline-flex min-h-11 items-center gap-1.5 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
              aria-label={copy.directionsTo(detail.dealer.name)}
            >
              <Navigation aria-hidden className="h-4 w-4" />
              {copy.directions}
            </a>
          )}
        </div>

        {detail.branches.length > 0 && (
          <div>
            <h3 className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">{copy.branches}</h3>
            <ul className="mt-1 space-y-2">
              {detail.branches.map((b) => {
                const url = directionsUrl(b);
                return (
                  <li key={b.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{b.name}</p>
                      {b.address && <p className="qx-caption text-fg-muted">{b.address}</p>}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={copy.directionsTo(`${detail.dealer.name} · ${b.name}`)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-brand hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Navigation aria-hidden className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <h3 className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">{copy.hoursTitle}</h3>
          {detail.hours.rows ? (
            <table className="mt-1 w-full text-sm">
              <caption className="sr-only">{copy.hoursTitle}</caption>
              <tbody>
                {detail.hours.rows.map((row) => {
                  const isToday = row.day === today;
                  return (
                    <tr key={row.day} className={cn(isToday && 'font-semibold text-fg')} aria-current={isToday ? 'date' : undefined}>
                      <th scope="row" className={cn('py-1 pr-3 text-left font-normal', isToday ? 'font-semibold text-fg' : 'text-fg-muted')}>
                        {copy.weekday(row.day)}
                        {isToday && <span className="sr-only"> ({copy.hoursToday})</span>}
                      </th>
                      <td className="py-1 text-right tabular-nums text-fg">
                        {row.ranges.length === 0
                          ? copy.hoursClosed
                          : row.ranges.map((r) => `${r.open}–${r.close}`).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="qx-small mt-1 text-fg-muted">{detail.hours.raw ? copy.hoursRawNote : copy.hoursUnknown}</p>
          )}
          {!detail.hours.rows && detail.hours.raw && <p className="qx-small mt-0.5 whitespace-pre-line text-fg">{detail.hours.raw}</p>}
        </div>
      </div>
    </SectionCard>
  );
}
