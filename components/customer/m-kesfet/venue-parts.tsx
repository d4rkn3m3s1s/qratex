'use client';

import { Burst } from '@/components/fx/event-fx';
import { playSound } from '@/lib/sound';
import { useState } from 'react';
import Image from 'next/image';
import { m as Motion } from 'framer-motion';
import { Heart, Star, Zap, Tag, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { TONE_CHIP } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { OpenState } from '@/lib/places/business-hours';
import { categoryLabel, type PlaceCategory } from '@/lib/places/categories';
import { formatDistance, walkingMinutes } from '@/lib/places/geo';
import type { LiveBoostDto } from '@/lib/places/types';
import { usePlacesCopy } from './copy';
import { formatClockIso, formatMultiplierLabel, formatRating, initialsOf, openStateLabel } from './format';
import { useSaveToggle } from './use-save-toggle';

/** Mekân görseli — bilinmeyen alan adında kırılmaz (optimizasyonsuz + hata yedeği: baş harfler). */
export function VenueAvatar({ name, src, size = 56, className }: { name: string; src: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <span
      aria-hidden
      className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-control bg-brand-subtle font-semibold text-brand ring-1 ring-inset ring-brand-border', className)}
      style={{ width: size, height: size }}
    >
      {show ? (
        <Image src={src} alt="" width={size} height={size} unoptimized className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className={size >= 56 ? 'qx-h3' : 'qx-small'}>{initialsOf(name)}</span>
      )}
    </span>
  );
}

export function OpenStateBadge({ state, size = 'sm' }: { state: OpenState | null; size?: 'sm' | 'md' }) {
  const { copy } = usePlacesCopy();
  const s = openStateLabel(state, copy);
  if (!s) return null;
  return <StatusBadge label={s.label} tone={s.tone} size={size} />;
}

export function RatingInline({ rating }: { rating: { avg: number; n: number } | null }) {
  const { copy, locale } = usePlacesCopy();
  if (!rating) {
    return <span className={cn('qx-caption inline-flex items-center rounded-chip px-1.5 py-0.5 font-medium', TONE_CHIP.info)}>{copy.newPlace}</span>;
  }
  const avg = formatRating(rating.avg, locale);
  return (
    <span className="qx-small inline-flex items-center gap-1 text-fg" aria-label={copy.ratingAria(avg, rating.n)}>
      <Star aria-hidden className="h-3.5 w-3.5 fill-current text-warning" />
      <span className="qx-num font-semibold">{avg}</span>
      <span className="qx-num text-fg-muted">({rating.n})</span>
    </span>
  );
}

export function DistanceInline({ km }: { km: number | null }) {
  const { copy, locale } = usePlacesCopy();
  if (km === null) return null;
  return (
    <span className="qx-small inline-flex items-center gap-1 text-fg-muted">
      <Footprints aria-hidden className="h-3.5 w-3.5" />
      <span className="qx-num">{formatDistance(km, locale)}</span>
      <span aria-hidden>·</span>
      <span>{copy.walk(walkingMinutes(km))}</span>
    </span>
  );
}

export function CategoryLine({ categories }: { categories: PlaceCategory[] }) {
  const { locale } = usePlacesCopy();
  if (categories.length === 0) return null;
  return <span className="qx-caption truncate text-fg-muted">{categories.slice(0, 3).map((c) => categoryLabel(c, locale)).join(' · ')}</span>;
}

export function BoostChip({ boost }: { boost: LiveBoostDto }) {
  const { copy, locale } = usePlacesCopy();
  const until = formatClockIso(boost.endsAt, locale);
  return (
    <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-2 py-1 font-semibold', TONE_CHIP.brand)}>
      <Zap aria-hidden className="h-3.5 w-3.5" />
      <span>{copy.boostChip(formatMultiplierLabel(boost.multiplier, locale))}</span>
      {until && <span className="font-normal">· {copy.boostUntil(until)}</span>}
    </span>
  );
}

export function FlashChip({ count }: { count: number }) {
  const { copy } = usePlacesCopy();
  if (count <= 0) return null;
  return (
    <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-2 py-1 font-medium', TONE_CHIP.warning)}>
      <Tag aria-hidden className="h-3.5 w-3.5" />
      {copy.flashChip(count)}
    </span>
  );
}

/** Kaydet kalbi — `aria-pressed` aç/kapa; kaydetme anında kısa ölçek darbesi (azaltılmış harekette yok). */
export function SaveButton({ dealerId, name, saved, className }: { dealerId: string; name: string; saved: boolean; className?: string }) {
  const { copy } = usePlacesCopy();
  const { toggle, pendingId } = useSaveToggle();
  const policy = useMotionPolicy();
  const [pulse, setPulse] = useState(0);
  return (
    <IconButton
      aria-label={saved ? copy.unsave(name) : copy.save(name)}
      pressed={saved}
      variant="ghost"
      shape="circle"
      className={cn('relative z-raised', saved && 'text-danger', className)}
      disabled={pendingId === dealerId}
      onClick={(e) => {
        e.stopPropagation();
        if (!saved) {
          setPulse((n) => n + 1);
          playSound('success'); // SES: kaydetme anı (çıkarma sessiz)
        }
        toggle(dealerId, name, !saved);
      }}
      icon={
        <Motion.span
          key={pulse}
          className="relative inline-flex"
          initial={pulse > 0 && !policy.reduce ? { scale: 1 } : false}
          animate={pulse > 0 && !policy.reduce ? { scale: [1, 1.25, 1] } : undefined}
          transition={{ duration: DURATION.base, ease: EASE.standard }}
        >
          <Heart className={cn('h-5 w-5', saved && 'fill-current')} />
          {saved && <Burst trigger={pulse} kind="hearts" count={8} radius={28} />}
        </Motion.span>
      }
    />
  );
}
