'use client';

import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { ChevronRight, Gift, HeartHandshake, MessageSquareText, Ticket, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, formatInt } from '@/components/ds/play/shared';
import { listContainer, listItem, useMotionPolicy } from '@/lib/motion';
import type { HomePendingAction, HomePendingId } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

const META: Record<HomePendingId, { icon: LucideIcon; tone: string }> = {
  remedy: { icon: HeartHandshake, tone: 'border-info-border bg-info-subtle text-info' },
  reviews: { icon: MessageSquareText, tone: 'border-brand-border bg-brand-subtle text-brand' },
  rewards: { icon: Ticket, tone: 'border-success-border bg-success-subtle text-success' },
  boxes: { icon: Gift, tone: 'border-warning-border bg-warning-subtle text-warning' },
};

/**
 * Bekleyen işler: telafi teklifi, yorum bekleyen tüketim, kullanılmamış ödül, açılmamış
 * kutu. Sayılar DB'den; kapalı modüller hiç listelenmez. Hiçbiri yoksa dürüst boş metin.
 */
export function PendingActions({ items }: { items: HomePendingAction[] }) {
  const { copy, locale } = useHomeCopy();
  const policy = useMotionPolicy();

  return (
    <section aria-labelledby="home-pending-title" className="rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5">
      <h2 id="home-pending-title" className="mb-3 qx-h3 text-fg">
        {copy.pendingTitle}
      </h2>
      {items.length === 0 ? (
        <p className="qx-small text-fg-muted">{copy.pendingEmpty}</p>
      ) : (
        <Motion.ul
          className="flex flex-col gap-2"
          variants={policy.variants(listContainer)}
          initial="hidden"
          animate="visible"
        >
          {items.map((item) => {
            const { icon: Icon, tone } = META[item.id];
            return (
              <Motion.li key={item.id} variants={policy.variants(listItem)}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-control px-2 py-2 transition-colors duration-fast hover:bg-surface-2',
                    FOCUS_RING
                  )}
                >
                  <span className={cn('relative grid size-10 shrink-0 place-items-center rounded-full border', tone)} aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block qx-body font-medium text-fg">{copy.pending[item.id](item.count)}</span>
                    <span className="block qx-small text-fg-muted">{copy.pendingHint[item.id]}</span>
                  </span>
                  <span
                    className="grid min-w-7 place-items-center rounded-full bg-brand px-2 py-0.5 qx-caption font-semibold tabular-nums text-brand-fg"
                    aria-hidden
                  >
                    {formatInt(item.count, locale)}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              </Motion.li>
            );
          })}
        </Motion.ul>
      )}
    </section>
  );
}
