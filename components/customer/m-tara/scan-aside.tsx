/**
 * Tara sayfasının yan sütunu — SUNUCU bileşeni (istemci JS'i yok).
 * Ödül şeridi (bakiye + taban ödül + bugün kalan) ve son mekânlar; hepsi sunucu özetinden.
 */
import Link from 'next/link';
import { ArrowRight, History, MapPin, RotateCw, Sparkles, Wallet } from 'lucide-react';
import { fill, formatPoints, formatVisitDate, type ScanCopy, type ScanLocale } from './copy';
import type { ScanSummary } from './scan-types';
import { VenueLogo } from './venue-logo';

export function ScanRewardPanel({ summary, copy, locale }: { summary: ScanSummary; copy: ScanCopy; locale: ScanLocale }) {
  const { reward } = summary;
  const capReached = reward.remainingToday <= 0;
  return (
    <section
      aria-labelledby="scan-reward-title"
      className="rounded-card border border-brand-border bg-gradient-to-br from-brand-subtle to-surface-1 p-5 shadow-[var(--elevation-1)]"
    >
      <h2 id="scan-reward-title" className="flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-brand" aria-hidden />
        {copy.sideRewardTitle}
      </h2>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-control bg-surface-1/80 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {copy.sideBalance}
          </dt>
          <dd className="mt-1 font-display text-xl font-bold tabular-nums">
            {formatPoints(summary.balance, locale)} <span className="text-sm font-medium text-fg-muted">{copy.points}</span>
          </dd>
        </div>
        <div className="rounded-control bg-surface-1/80 p-3">
          <dt className="text-xs font-medium text-fg-muted">{copy.rewardTitle}</dt>
          <dd className="mt-1 font-display text-xl font-bold tabular-nums text-brand">
            {fill(copy.rewardShort, { points: formatPoints(reward.basePoints, locale) })}
          </dd>
        </div>
      </dl>

      {reward.detailedPoints > reward.basePoints && !capReached && (
        <p className="mt-3 text-sm text-fg">
          {fill(copy.rewardDetailed, {
            threshold: reward.detailThreshold,
            points: formatPoints(reward.detailedPoints, locale),
          })}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        {capReached
          ? copy.rewardCapReached
          : `${fill(copy.rewardRemaining, { points: formatPoints(reward.remainingToday, locale) })} · ${copy.rewardNote}`}
      </p>
    </section>
  );
}

export function ScanRecentVenues({ summary, copy, locale }: { summary: ScanSummary; copy: ScanCopy; locale: ScanLocale }) {
  const venues = summary.recentVenues;
  const now = new Date();
  return (
    <section aria-labelledby="scan-recent-title" className="rounded-card border border-subtle bg-surface-1 p-5">
      <h2 id="scan-recent-title" className="flex items-center gap-2 text-lg font-semibold">
        <History className="h-5 w-5 text-fg-muted" aria-hidden />
        {copy.sideRecentTitle}
      </h2>
      {venues.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{copy.sideRecentEmpty}</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border">
            {venues.map((v) => (
              <li key={v.dealerId}>
                <Link
                  href={`/customer/places/${encodeURIComponent(v.dealerId)}`}
                  className="-mx-2 flex min-h-14 items-center gap-3 rounded-control px-2 py-2 transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <VenueLogo name={v.name} logoUrl={v.logoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.name}</span>
                    {v.placeLabel && (
                      <span className="flex items-center gap-1 truncate text-xs text-fg-muted">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        {v.placeLabel}
                      </span>
                    )}
                  </span>
                  <time dateTime={v.lastVisitAt} className="shrink-0 text-xs text-fg-muted">
                    {formatVisitDate(v.lastVisitAt, locale, copy, now)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/customer/me/voices"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {copy.sideRecentAll}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}

export function ScanSummaryError({ copy }: { copy: ScanCopy }) {
  return (
    <section role="status" className="rounded-card border border-warning-border bg-warning-subtle p-5 text-sm">
      <p className="text-warning">{copy.summaryError}</p>
      <Link
        href="/customer/scan"
        prefetch={false}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <RotateCw className="h-4 w-4" aria-hidden />
        {copy.summaryRetry}
      </Link>
    </section>
  );
}
