'use client';

import { ChevronRight, HeartHandshake, Package } from 'lucide-react';
import { RarityBadge } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { OpenedBoxDTO, RemedyPassDTO, RewardPassDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { formatDate, formatPoints } from './format';
import { RewardVisual } from './reward-visual';

const ROW =
  'group flex w-full min-w-0 items-center gap-3 rounded-card border border-subtle bg-surface-1 p-3 text-left qx-elevation-1 transition-[border-color] duration-fast hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[4.5rem]';

export function RewardPassRow({ pass, onOpen }: { pass: RewardPassDTO; onOpen: () => void }) {
  const copy = useWalletCopy();
  const used = !!pass.usedAt;
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={ROW}>
      <span className="relative size-12 shrink-0 overflow-hidden rounded-control bg-surface-muted">
        <RewardVisual imageUrl={pass.imageUrl} glyph={pass.glyph} kind={pass.rewardKind} size="sm" className={cn(used && 'grayscale')} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="qx-small block truncate font-semibold text-fg">{pass.rewardName}</span>
        {pass.code && <span className={cn('qx-caption block truncate font-mono text-fg-muted', used && 'line-through')}>{pass.code}</span>}
        <span className="qx-caption block text-fg-muted">
          {used ? copy.passes.usedAt(formatDate(pass.usedAt, copy.locale)) : copy.passes.issuedAt(formatDate(pass.issuedAt, copy.locale))}
        </span>
      </span>
      <span
        className={cn(
          'qx-caption shrink-0 rounded-chip px-2 py-0.5 font-medium ring-1 ring-inset',
          used ? 'bg-surface-muted text-fg-muted ring-border' : 'bg-success-subtle text-success ring-success-border'
        )}
      >
        {used ? copy.passes.statusUsed : copy.passes.statusActive}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
    </button>
  );
}

export function RemedyPassRow({ pass, onOpen }: { pass: RemedyPassDTO; onOpen: () => void }) {
  const copy = useWalletCopy();
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={ROW}>
      <span className="grid size-12 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted" aria-hidden>
        <HeartHandshake className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="qx-small block truncate font-semibold text-fg">{pass.label}</span>
        <span className="qx-caption block truncate text-fg-muted">{pass.businessName}</span>
        <span className="qx-caption block font-mono text-fg-muted">{pass.reference}</span>
      </span>
      <span className="qx-caption shrink-0 rounded-chip bg-info-subtle px-2 py-0.5 font-medium text-info ring-1 ring-inset ring-info-border">
        {copy.passes.statusRemedy}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
    </button>
  );
}

export function OpenedBoxRow({ box, onOpen }: { box: OpenedBoxDTO; onOpen: () => void }) {
  const copy = useWalletCopy();
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={ROW}>
      <span className="grid size-12 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted" aria-hidden>
        <Package className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="qx-small block truncate font-semibold text-fg">{box.title}</span>
        <span className="qx-caption block text-fg-muted">
          {copy.boxes.source[box.source]} · {formatDate(box.openedAt, copy.locale)}
        </span>
        {box.couponCode && <span className="qx-caption block truncate font-mono text-fg-muted">{box.couponCode}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <RarityBadge rarity={box.tier} size="sm" register="ops" />
        {box.points > 0 && <span className="qx-caption qx-num font-semibold text-success">+{formatPoints(box.points, copy.locale)}</span>}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
    </button>
  );
}
