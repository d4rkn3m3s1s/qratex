import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Compass, MapPin, Quote, ShieldCheck, Star, Users } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { getPublicExperience, isPlausibleShareToken } from '@/lib/experience-share/public';
import { ErrorState } from '@/components/states';
import { cn } from '@/lib/utils';
import { formatRating, formatShareDate, getShareCopy, type ShareLocale } from '@/components/public/p-deneyim-anket/copy';
import { authHref, openStateLabel } from '@/components/public/p-deneyim-anket/labels';
import { categoryColorVar, categoryIcon, VenueAvatar } from '@/components/public/p-deneyim-anket/venue-visual';
import { CardReveal, DelayedFade } from '@/components/public/p-deneyim-anket/card-reveal';
import { StatusPanel } from '@/components/public/p-deneyim-anket/status-panel';
import {
  ExperienceViewBeacon,
  OwnerPanel,
  RefreshButton,
  TrackedLink,
} from '@/components/public/p-deneyim-anket/experience-client';

/**
 * `/experience/[token]` — anonim deneyim kartı (büyüme döngüsü: arkadaş → mekân → kayıt).
 *
 * Sunucu bileşeni (denetim B2/B4/B11): kart ilk HTML'de gelir; metadata + OG kartı aynı
 * okumadan üretilir; okuma yan etkisiz, sayım istemci adasından ayrı POST ile (B5).
 * Durumlar: kart · paylaşım sona erdi (mekân hâlâ keşfedilebilir) · bulunamadı (404) ·
 * modül kapalı · geçici hata (yeniden dene).
 */
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ token: string }> };

const viewer = cache(async () => {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id ? { id: session.user.id as string, role: String(session.user.role ?? '') } : null;
  } catch {
    return null;
  }
});

const loadCard = cache(async (token: string) => {
  const v = await viewer();
  return getPublicExperience(token, { viewerId: v?.id ?? null });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const copy = getShareCopy(await getServerLocale());
  const robots = { index: false, follow: false } as const;
  if (!isPlausibleShareToken(token)) return { title: copy.expMetaNotFound, robots };
  const result = await loadCard(token);
  if (result.status !== 'ok') return { title: copy.expMetaNotFound, robots };
  const { card } = result;
  const title = card.venue.name ? copy.expMetaTitle(card.venue.name) : copy.expMetaTitleGeneric;
  const description = copy.expMetaDescription(
    card.caption ? copy.captions[card.caption.key] : null,
    card.caption?.rating ?? null
  );
  const url = `/experience/${token}`;
  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          aria-hidden
          strokeWidth={1.75}
          className={cn('h-5 w-5', s <= value ? 'fill-warning text-warning' : 'fill-transparent text-fg-subtle')}
        />
      ))}
    </span>
  );
}

function StatusShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-12 sm:py-16">{children}</div>;
}

export default async function ExperienceSharePage({ params }: PageProps) {
  const { token } = await params;
  if (!isPlausibleShareToken(token)) notFound();

  const locale: ShareLocale = await getServerLocale();
  const copy = getShareCopy(locale);
  const [result, me] = await Promise.all([loadCard(token), viewer()]);

  if (result.status === 'not_found') notFound();

  const exploreHref = me?.role === 'CUSTOMER' ? '/customer/places' : authHref('register', '/customer/places');

  if (result.status === 'unavailable') {
    return (
      <StatusShell>
        <ErrorState
          variant="page"
          kind="generic"
          title={copy.unavailableTitle}
          description={copy.unavailableBody}
          action={<RefreshButton label={copy.retry} />}
        />
      </StatusShell>
    );
  }

  if (result.status === 'disabled') {
    return (
      <StatusShell>
        <ErrorState
          variant="page"
          kind="moduleDisabled"
          title={copy.expDisabledTitle}
          description={copy.expDisabledBody}
          action={
            <TrackedLink href="/" cta="disabled_home" variant="outline" size="default">
              {copy.goHome}
            </TrackedLink>
          }
        />
      </StatusShell>
    );
  }

  if (result.status === 'expired') {
    const venue = result.venue;
    const venueHref = venue
      ? me?.role === 'CUSTOMER'
        ? `/customer/places/${venue.id}`
        : authHref('register', `/customer/places/${venue.id}`)
      : exploreHref;
    return (
      <StatusShell>
        <StatusPanel
          icon={venue ? undefined : Compass}
          visual={venue ? <VenueAvatar logo={venue.logo} category={venue.category} size="lg" className="mb-4" /> : undefined}
          title={copy.expExpiredTitle}
          description={copy.expExpiredBody(venue?.name ?? null)}
          actions={
            <>
              <TrackedLink href={venueHref} cta="expired_recover" size="default" className="w-full">
                {venue ? copy.ctaVenue : copy.explore}
              </TrackedLink>
              <TrackedLink href="/" cta="expired_home" variant="ghost" size="default" className="w-full">
                {copy.goHome}
              </TrackedLink>
            </>
          }
        />
      </StatusShell>
    );
  }

  const { card, isOwner } = result;
  const venueName = card.venue.name ?? copy.venueFallback;
  const colorVar = categoryColorVar(card.venue.category);
  const CategoryIcon = categoryIcon(card.venue.category);
  const open = openStateLabel(card.venue.openState, copy, locale);
  const venuePath = `/customer/places/${card.venue.id}`;
  const signedInCustomer = me?.role === 'CUSTOMER';
  const daysLeftLabel = copy.daysLeft(card.daysLeft);

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6 sm:py-10" data-register="play">
      <ExperienceViewBeacon token={card.token} isOwner={isOwner} />

      <CardReveal>
        <article
          aria-labelledby="exp-venue-title"
          className="relative overflow-hidden rounded-sheet border border-subtle bg-surface-1 qx-elevation-2"
        >
          {/* Kategori kimlik rengi: üst bant + ince kenar parıltısı (dekoratif) */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-40"
            style={{ background: `linear-gradient(180deg, hsl(var(${colorVar}) / 0.2), hsl(var(--gradient-to) / 0.06) 55%, transparent)` }}
          />
          <div className="relative space-y-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="qx-overline text-fg-muted">{copy.expEyebrow}</p>
              <span className="qx-caption inline-flex shrink-0 items-center gap-1 rounded-chip border border-subtle bg-surface-0 px-2 py-1 font-medium text-fg-muted">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {copy.expAnonymousSeal}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <VenueAvatar logo={card.venue.logo} category={card.venue.category} size="lg" />
              <div className="min-w-0">
                <h1 id="exp-venue-title" className="qx-h2 break-words text-fg">
                  {venueName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {card.venue.category && (
                    <span className="qx-small inline-flex items-center gap-1 text-fg-muted">
                      <CategoryIcon className="h-4 w-4" aria-hidden style={{ color: `hsl(var(${colorVar}))` }} />
                      {copy.categories[card.venue.category]}
                    </span>
                  )}
                  {open && (
                    <span
                      className={cn(
                        'qx-small inline-flex items-center gap-1.5 font-medium',
                        open.tone === 'success' ? 'text-success' : open.tone === 'warning' ? 'text-warning' : 'text-fg-muted'
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'h-2 w-2 rounded-full',
                          open.tone === 'success' ? 'bg-success' : open.tone === 'warning' ? 'bg-warning' : 'bg-fg-subtle'
                        )}
                      />
                      {open.text}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {card.caption && (
                <span className="inline-flex items-center gap-2">
                  <Stars value={card.caption.rating} label={copy.expRatingAria(card.caption.rating)} />
                  <span className="qx-small qx-num font-semibold text-fg" aria-hidden>
                    {copy.expRatingLabel(card.caption.rating)}
                  </span>
                </span>
              )}
              <span className="qx-small inline-flex items-center gap-1.5 rounded-chip bg-surface-3 px-2.5 py-1 text-fg">
                <span aria-hidden className="text-base leading-none">
                  {copy.moodEmoji[card.mood]}
                </span>
                <span className="sr-only">{copy.expMoodLabel}: </span>
                {copy.moods[card.mood]}
              </span>
            </div>

            {card.caption && (
              <blockquote className="relative rounded-card border border-subtle bg-surface-2 p-4 pl-11">
                <Quote aria-hidden className="absolute left-3 top-4 h-5 w-5" style={{ color: `hsl(var(${colorVar}))` }} />
                <p className="qx-body text-fg">{copy.captions[card.caption.key]}</p>
              </blockquote>
            )}

            <div className="qx-caption space-y-1 text-fg-muted">
              <p className="flex flex-wrap gap-x-2">
                <span>{copy.sharedOn(formatShareDate(card.createdAt, locale))}</span>
                <span aria-hidden>·</span>
                <span>{daysLeftLabel}</span>
              </p>
              <p>{copy.expAnonymousNote}</p>
            </div>
          </div>
        </article>
      </CardReveal>

      {card.stats && (
        <DelayedFade delay={0.15}>
          <p className="qx-small flex items-start gap-2 rounded-card border border-subtle bg-surface-1 p-3 text-fg">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
            <span>
              <span className="sr-only">{copy.statsLabel}: </span>
              {copy.stats(card.stats.feedbackCount, formatRating(card.stats.avgRating, locale), card.stats.windowDays)}
            </span>
          </p>
        </DelayedFade>
      )}

      {isOwner && (
        <DelayedFade delay={0.2}>
          <OwnerPanel
            token={card.token}
            venueName={venueName}
            viewCount={card.viewCount}
            daysLeftLabel={daysLeftLabel}
            locale={locale}
          />
        </DelayedFade>
      )}

      {!isOwner && (
        <DelayedFade delay={0.3}>
          <section aria-labelledby="exp-cta-title" className="space-y-3">
            <h2 id="exp-cta-title" className="qx-h3 text-fg">
              {copy.ctaSectionTitle}
            </h2>
            {signedInCustomer ? (
              <>
                <p className="qx-small text-fg-muted">{copy.ctaVenueBody}</p>
                <TrackedLink href={venuePath} cta="venue" className="w-full gap-2">
                  <Compass className="h-5 w-5" aria-hidden />
                  {copy.ctaVenue}
                </TrackedLink>
              </>
            ) : me ? (
              <TrackedLink href="/" cta="home" className="w-full">
                {copy.ctaHome}
              </TrackedLink>
            ) : (
              <>
                <p className="qx-small text-fg-muted">{copy.ctaJoinBody}</p>
                <TrackedLink href={authHref('register', venuePath)} cta="register" className="w-full">
                  {copy.ctaJoin}
                </TrackedLink>
                <TrackedLink href={authHref('login', venuePath)} cta="login" variant="ghost" size="default" className="w-full">
                  {copy.ctaLogin}
                </TrackedLink>
              </>
            )}
            {card.venue.directionsUrl && (
              <TrackedLink
                href={card.venue.directionsUrl}
                cta="directions"
                external
                variant="outline"
                size="default"
                className="w-full gap-2"
                aria-label={copy.directionsAria(venueName)}
              >
                <MapPin className="h-4 w-4" aria-hidden />
                {copy.directions}
              </TrackedLink>
            )}
          </section>
        </DelayedFade>
      )}
    </div>
  );
}
