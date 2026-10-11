'use client';

import Image from 'next/image';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isImageSrc } from '@/lib/admin-store/contract';
import { StatusBadge } from '@/components/ds/data';
import { stockLabel } from './format';

/** Ödül ikonu: R2/yerel görsel ya da emoji; ikisi de yoksa nötr hediye glifi. */
export function RewardIcon({ icon, name, size = 'md', muted = false }: { icon: string; name: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const box = size === 'lg' ? 'size-16 text-3xl' : size === 'sm' ? 'size-9 text-lg' : 'size-11 text-2xl';
  const raw = typeof icon === 'string' ? icon.trim() : '';
  const glyph = raw && !isImageSrc(raw) && [...raw].length <= 4 ? raw : null;
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-control border border-subtle bg-surface-2',
        box,
        muted && 'opacity-60 grayscale'
      )}
    >
      {isImageSrc(icon) ? (
        <Image src={icon} alt={name} fill sizes="4rem" className="object-contain p-1" unoptimized />
      ) : glyph ? (
        <span aria-hidden>{glyph}</span>
      ) : (
        <Gift aria-hidden className="size-1/2 text-fg-muted" />
      )}
      {!isImageSrc(icon) ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}

export function StockBadge({ stock, pool }: { stock: number; pool?: { enabled: boolean } }) {
  const s = stockLabel(stock);
  return <StatusBadge size="sm" tone={s.tone} icon={null} label={pool?.enabled ? `${s.label} kod` : s.label} srPrefix="Stok" />;
}
