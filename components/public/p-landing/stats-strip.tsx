import { Sprout } from 'lucide-react';
import { selectVisibleStats, type PublicStatKey, type PublicStats } from '@/lib/landing/public-stats-core';
import { cn } from '@/lib/utils';
import { fmt, type PublicLocale } from './fmt';
import type { LandingCopy } from './landing-copy';

const TIME_FORMAT: Record<PublicLocale, Intl.DateTimeFormatOptions> = {
  tr: { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
  en: { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
};

/**
 * Gerçek vitrin rakamları (sunucuda, ilk HTML'de — istemci fetch'i ve sayı karıştırma
 * animasyonu yok; ekran okuyucu değeri tek seferde okur). Yalnız eşiği geçen metrikler
 * görünür; hiçbiri geçmiyorsa uydurma sayı yerine dürüst "yeni başlıyoruz" kartı.
 * İstatistik kaynağına ulaşılamazsa (`stats === null`) bant hiç çizilmez.
 */
export function StatsStrip({
  stats,
  keys,
  copy,
  locale,
  brand,
  className,
  showHeading = false,
}: {
  stats: PublicStats | null;
  keys: readonly PublicStatKey[];
  copy: LandingCopy['stats'];
  locale: PublicLocale;
  brand: string;
  className?: string;
  /** Ana sayfada görünür başlık; diğer sayfalarda bant olarak (başlık yalnız ekran okuyucuya). */
  showHeading?: boolean;
}) {
  if (!stats) return null;
  const visible = selectVisibleStats(stats, keys, locale);

  if (visible.length < 2) {
    return (
      <div className={cn('mx-auto w-full max-w-3xl px-4 sm:px-6', className)}>
        <div className="flex items-start gap-4 rounded-card border border-subtle bg-surface-1/85 p-5 backdrop-blur-md">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success-subtle text-success" aria-hidden>
            <Sprout className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-fg">{copy.earlyTitle}</p>
            <p className="mt-1 text-sm text-fg-muted">{fmt(copy.earlyBody, { brand })}</p>
          </div>
        </div>
      </div>
    );
  }

  const labels: Record<PublicStatKey, string> = {
    members: copy.members,
    businesses: copy.businesses,
    feedbacks: copy.feedbacks,
    feedbacksLast30d: copy.feedbacksLast30d,
    rating: copy.rating,
  };
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', TIME_FORMAT[locale]).format(
    new Date(stats.computedAt)
  );

  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', showHeading && 'py-14 sm:py-20', className)}>
      <section aria-labelledby="stats-heading">
        {showHeading ? (
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="qx-overline text-brand">{copy.eyebrow}</p>
              <h2 id="stats-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {copy.heading}
              </h2>
            </div>
          </div>
        ) : (
          <h2 id="stats-heading" className="sr-only">
            {copy.heading}
          </h2>
        )}
        <dl
          className={cn(
            'grid gap-x-6 gap-y-8 border-t border-subtle pt-6',
            visible.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : visible.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'
          )}
        >
          {visible.map((s) => (
            <div key={s.key} className="flex flex-col-reverse">
              <dt className="mt-2 text-sm text-fg-muted">{labels[s.key]}</dt>
              <dd className="qx-num text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
                {s.display}
                {s.key === 'rating' ? <span className="ml-1 text-base font-medium text-fg-muted">{copy.ratingSuffix}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-fg-muted">{fmt(copy.updated, { time })}</p>
      </section>
    </div>
  );
}
