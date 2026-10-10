'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoicesCopy } from './copy';

/**
 * Salt okunur yıldız gösterimi. Ekran okuyucu tek bir cümle duyar ("5 üzerinden 4 yıldız");
 * ikonlar dekoratiftir. Dolu yıldız yalnız renkle değil, dolgu ile de ayrışır.
 */
export function RatingStars({ value, size = 'sm', className }: { value: number; size?: 'sm' | 'md'; className?: string }) {
  const copy = useVoicesCopy();
  const n = Math.max(0, Math.min(5, Math.round(value)));
  const icon = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span role="img" aria-label={copy.ratingLabel(n)} className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(icon, i <= n ? 'fill-warning text-warning' : 'fill-transparent text-fg-subtle')}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}
