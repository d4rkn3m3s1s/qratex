import Link from 'next/link';
import { MessageCircleReply, Star, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber, getMeCopy, type MeLocale } from '../copy';
import type { ProgressTrends } from '../types';
import { FOCUS_RING } from './styles';

const EXPERIENCE_ORDER = ['positive', 'neutral', 'negative', 'pending'] as const;
const EXPERIENCE_FILL: Record<(typeof EXPERIENCE_ORDER)[number], string> = {
  positive: 'bg-success',
  neutral: 'bg-info',
  negative: 'bg-warning',
  pending: 'bg-surface-3',
};

/**
 * Deneyimlerin — yargısız ton dağılımı. Eski "Duygu skoru" ve "Gelişim alanı var" rozeti
 * dürüst olumsuz yorumu kullanıcı kusuru gibi sunuyordu (trends bulgu 8); burada yalnız
 * dağılım + "sesin duyuldu" sayısı var, renk tek başına anlam taşımaz (metin + yüzde).
 */
export function ExperienceBreakdown({ experience, locale }: { experience: NonNullable<ProgressTrends['experience']>; locale: MeLocale }) {
  const c = getMeCopy(locale).progress;
  const total = EXPERIENCE_ORDER.reduce((s, k) => s + experience[k], 0);
  if (total === 0) return <p className="qx-small text-fg-muted">{c.experienceEmpty}</p>;
  const pct = (v: number) => formatNumber(v / total, locale, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <div className="space-y-3">
      <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
        {EXPERIENCE_ORDER.map((k) =>
          experience[k] > 0 ? <span key={k} className={EXPERIENCE_FILL[k]} style={{ width: `${(experience[k] / total) * 100}%` }} /> : null,
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {EXPERIENCE_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', EXPERIENCE_FILL[k])} />
            <span className="qx-small min-w-0 text-fg">
              {c.experience[k]} <span className="qx-num text-fg-muted">· {formatNumber(experience[k], locale)} ({pct(experience[k])})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="qx-small inline-flex items-center gap-2 text-fg">
        <MessageCircleReply aria-hidden className="size-4 text-success-text" />
        {experience.heard > 0 ? c.heard(formatNumber(experience.heard, locale)) : c.heardNone}
      </p>
    </div>
  );
}

export function PlacesList({
  places,
  products,
  locale,
}: {
  places: NonNullable<ProgressTrends['places']>;
  products: ProgressTrends['topProducts'];
  locale: MeLocale;
}) {
  const c = getMeCopy(locale).progress;
  const n = (v: number) => formatNumber(v, locale);
  if (places.length === 0) return <p className="qx-small text-fg-muted">{c.placesEmpty}</p>;

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {places.map((p, i) => {
          const name = p.name || c.unknownPlace;
          const meta = [
            p.visits > 0 ? c.placeVisits(n(p.visits)) : null,
            p.reviews > 0 ? c.placeReviews(n(p.reviews)) : null,
            p.avgRating != null ? c.placeAvg(formatNumber(p.avgRating, locale, { maximumFractionDigits: 1 })) : null,
            c.placeLast(formatDate(p.lastAt, locale, { day: 'numeric', month: 'short' })),
          ].filter(Boolean);
          return (
            <li key={p.dealerId}>
              <Link
                href={`/customer/places/${encodeURIComponent(p.dealerId)}`}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-control border border-subtle p-2.5 transition-colors duration-fast ease-standard hover:border-strong hover:bg-surface-2',
                  FOCUS_RING,
                )}
              >
                <span className="qx-caption qx-num w-4 shrink-0 text-center text-fg-muted">{i + 1}</span>
                {p.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici/R2; 36px sabit
                  <img src={p.logo} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 rounded-control object-cover" />
                ) : (
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-brand-subtle text-brand-text">
                    <Store className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="qx-small block truncate font-medium text-fg">{name}</span>
                  <span className="qx-caption block truncate text-fg-muted">{meta.join(' · ')}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {products && products.length > 0 && (
        <div>
          <h4 className="qx-small mb-2 font-semibold text-fg">{c.productsTitle}</h4>
          <ul className="flex flex-wrap gap-2">
            {products.map((p) => (
              <li key={p.id} className="qx-small inline-flex items-center gap-1.5 rounded-chip border border-subtle px-2.5 py-1 text-fg">
                <Star aria-hidden className="size-3.5 text-brand" />
                {p.name}
                <span className="qx-num text-fg-muted">· {c.productTimes(n(p.count))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
