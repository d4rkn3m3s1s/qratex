'use client';

import Image from 'next/image';
import { Gift, Package, Sparkles, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RewardKind } from '@/lib/wallet-rewards/types';

const KIND_ICON: Record<RewardKind, typeof Gift> = {
  coupon: Ticket,
  physical: Package,
  digital: Sparkles,
  other: Gift,
};

/**
 * Ödül görseli: admin görseli → emoji glifi → türün ikonu. Görsel dekoratiftir
 * (adı yanında metin olarak var) → `alt=""`.
 */
export function RewardVisual({
  imageUrl,
  glyph,
  kind,
  size = 'md',
  className,
}: {
  imageUrl: string | null;
  glyph: string | null;
  kind: RewardKind;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  if (imageUrl) {
    const remote = /^https?:\/\//i.test(imageUrl);
    return (
      <div className={cn('relative h-full w-full overflow-hidden', className)}>
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={size === 'lg' ? '(max-width: 768px) 100vw, 32rem' : size === 'sm' ? '4rem' : '(max-width: 640px) 50vw, 16rem'}
          className="object-cover"
          unoptimized={remote}
        />
      </div>
    );
  }
  const box = size === 'lg' ? 'size-24 text-6xl' : size === 'sm' ? 'size-10 text-2xl' : 'size-16 text-4xl';
  return (
    <div className={cn('grid h-full w-full place-items-center', className)} aria-hidden>
      <span className={cn('grid place-items-center rounded-card bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border', box)}>
        {glyph ? <span className="leading-none">{glyph}</span> : <Icon className={size === 'lg' ? 'size-12' : size === 'sm' ? 'size-5' : 'size-8'} />}
      </span>
    </div>
  );
}
