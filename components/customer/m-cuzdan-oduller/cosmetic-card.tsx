'use client';

import { CheckCircle2, Gift, Lock, Pin } from 'lucide-react';
import { RarityBadge } from '@/components/ds/play';
import { RARITY_STYLES } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { CosmeticDTO, CosmeticsCatalogDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { formatPoints } from './format';
import { CosmeticPreview } from './cosmetic-preview';

/**
 * Kozmetik kartı: üstte nadirlik şeridi, ortada kendi avatarınla önizleme, altta fiyat ve
 * HER ZAMAN görünen durum satırı (eskiden "yetersiz bakiye" yalnız hover'da görünüyordu).
 */
export function CosmeticCard({
  item,
  balance,
  preview,
  onOpen,
}: {
  item: CosmeticDTO;
  balance: number;
  preview: CosmeticsCatalogDTO['preview'];
  onOpen: (id: string) => void;
}) {
  const copy = useWalletCopy();
  const style = RARITY_STYLES[item.rarity];
  const missing = Math.max(0, item.price - balance);
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      aria-haspopup="dialog"
      className={cn(
        'group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border border-subtle bg-surface-1 text-left qx-elevation-1',
        'transition-[border-color] duration-fast ease-standard hover:border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span aria-hidden className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${style.edge}, ${style.edgeTo})` }} />
      <div className="relative grid aspect-square w-full place-items-center bg-surface-2 p-4">
        <CosmeticPreview item={item} preview={preview} />
        <span className="absolute left-2 top-2">
          <RarityBadge rarity={item.rarity} size="sm" register="ops" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className="qx-caption text-fg-muted">{copy.cosmetics.typeOne[item.type]}</p>
        <p className="qx-small line-clamp-2 font-semibold text-fg">{item.name}</p>
        <div className="mt-auto pt-1">
          {item.owned ? (
            <p className="qx-caption flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-success">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 aria-hidden className="size-3.5" />
                {copy.cosmetics.owned}
              </span>
              {item.equipped && <span className="text-brand">· {copy.cosmetics.equipped}</span>}
              {item.pinned && (
                <span className="inline-flex items-center gap-1 text-brand">
                  · <Pin aria-hidden className="size-3" />
                  {copy.cosmetics.pinned}
                </span>
              )}
              {item.giftedBy && (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <Gift aria-hidden className="size-3" />
                  {copy.cosmetics.giftFrom(item.giftedBy)}
                </span>
              )}
            </p>
          ) : (
            <>
              <p className="qx-body qx-num font-semibold text-fg">
                {formatPoints(item.price, copy.locale)} <span className="qx-caption font-normal text-fg-muted">{copy.pointsShort}</span>
              </p>
              {missing > 0 && (
                <p className="qx-caption flex items-center gap-1 text-fg-muted">
                  <Lock aria-hidden className="size-3" />
                  {copy.missing(formatPoints(missing, copy.locale))}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}
