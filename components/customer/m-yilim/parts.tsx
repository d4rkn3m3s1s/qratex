'use client';

/**
 * Yılım küçük parçaları: mekân logosu, rozet glifi, etkinlik çubukları (yalnız SVG/HTML).
 */
import { useState } from 'react';
import { BadgeGlyph, type BadgeGlyphSize } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';

/** Mekân logosu; görsel yoksa/yüklenmezse baş harf (dekoratif, ad zaten metinde). */
export function PlaceLogo({ name, src, size = 56, className }: { name: string; src: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '•';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/[0.1] font-display font-bold text-white',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici/R2 kaynak; boyut küçük ve sabit
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

/** Badge.icon: URL (görsel) ya da emoji/kısa metin. */
export function YearBadgeGlyph({
  badge,
  size = 'lg',
}: {
  badge: YearSummary['badges']['items'][number];
  size?: BadgeGlyphSize;
}) {
  const icon = badge.icon?.trim() ?? '';
  const isUrl = /^(https?:)?\/\//i.test(icon) || icon.startsWith('/');
  const isEmoji = !isUrl && icon.length > 0 && icon.length <= 4;
  return (
    <BadgeGlyph
      label={badge.name}
      rarity={badge.rarity}
      color={badge.color ?? undefined}
      imageSrc={isUrl ? icon : undefined}
      emoji={isEmoji ? icon : undefined}
      size={size}
      register="play"
    />
  );
}

/**
 * Etkinlik çubukları (ay ya da gün). Erişilebilir: `role="img"` + özet etiketi ve
 * her çubuk için `<title>`; değerler ayrıca görünmez bir listede okunur.
 */
export function ActivityBars({
  summary,
  copy,
  tone = 'surface',
  className,
}: {
  summary: YearSummary;
  copy: YearCopy;
  tone?: 'surface' | 'dark';
  className?: string;
}) {
  const { buckets, unit } = summary.activity;
  const max = Math.max(1, ...buckets);
  const labels = buckets.map((_, i) => (unit === 'month' ? copy.monthsShort[i] : String(i + 1)));
  const W = 100;
  const H = 40;
  const gap = unit === 'month' ? 1.6 : 0.6;
  const bw = (W - gap * (buckets.length - 1)) / buckets.length;
  const caption = unit === 'month' ? copy.activityCaptionYear : copy.activityCaptionMonth;
  const total = buckets.reduce((a, b) => a + b, 0);
  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${W} ${H + 6}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${caption}: ${copy.fmt(total)}`}
        className="h-28 w-full sm:h-32"
      >
        {buckets.map((v, i) => {
          const bh = v === 0 ? 0.8 : Math.max(2, (v / max) * H);
          return (
            <rect
              key={i}
              x={i * (bw + gap)}
              y={H - bh}
              width={bw}
              height={bh}
              rx={Math.min(1.2, bw / 2)}
              className={
                v === 0
                  ? tone === 'dark'
                    ? 'fill-white/15'
                    : 'fill-muted'
                  : tone === 'dark'
                    ? 'fill-white/85'
                    : 'fill-brand'
              }
            >
              <title>{copy.activityBar(labels[i], v)}</title>
            </rect>
          );
        })}
      </svg>
      {unit === 'month' ? (
        <div aria-hidden="true" className={cn('mt-1 grid grid-cols-12 text-center qx-caption', tone === 'dark' ? 'text-white/75' : 'text-muted-foreground')}>
          {labels.map((l) => (
            <span key={l}>{l.charAt(0)}</span>
          ))}
        </div>
      ) : null}
      <figcaption className={cn('mt-2 qx-small', tone === 'dark' ? 'text-white/80' : 'text-muted-foreground')}>{caption}</figcaption>
      <ul className="sr-only">
        {buckets.map((v, i) => (v > 0 ? <li key={i}>{copy.activityBar(unit === 'month' ? copy.monthsLong[i] : labels[i], v)}</li> : null))}
      </ul>
    </figure>
  );
}
