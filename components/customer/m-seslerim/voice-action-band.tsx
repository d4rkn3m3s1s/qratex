'use client';

import Link from 'next/link';
import { ChevronRight, Gift, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomerRemedyListItem, VoiceSummary } from '@/lib/customer-voices/types';
import { BusinessAvatar } from './business-avatar';
import { useVoicesCopy, useVoicesLocale } from './copy';
import { formatRelative } from './lib';

/**
 * "Seni bekleyenler": açık telafi teklifleri (birincil aksiyon) ve yorum bekleyen tüketimler
 * (sunucunun gerçek ödül matrisi + bugünkü kalan tavan ile). Hiç bekleyen yoksa çizilmez.
 */
export function VoiceActionBand({
  summary,
  pendingOffers,
  onOpenOffer,
  onOpenVoice,
}: {
  summary: VoiceSummary;
  pendingOffers: CustomerRemedyListItem[];
  onOpenOffer: (id: string) => void;
  onOpenVoice: (key: string) => void;
}) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const { pending } = summary;
  const reward = pending.reward;
  if (pendingOffers.length === 0 && pending.reviews === 0) return null;

  return (
    <section aria-labelledby="voices-actions" className="space-y-3">
      <h2 id="voices-actions" className="qx-h3 text-fg">{copy.actionsTitle}</h2>

      {pendingOffers.length > 0 ? (
        <div className="rounded-card border border-warning-border bg-warning-subtle/60 p-card">
          <p className="qx-small flex items-center gap-2 font-medium text-fg">
            <Gift aria-hidden className="h-4 w-4 text-warning" />
            {copy.remedyWaiting(pendingOffers.length)}
          </p>
          <ul className="mt-3 space-y-2">
            {pendingOffers.map((o) => (
              <li key={o.id} className="flex items-center gap-3 rounded-control bg-surface-1 p-3">
                <BusinessAvatar business={o.business} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="qx-small truncate font-medium text-fg">{copy.remedyFrom(o.business.name)}</p>
                  <p className="qx-caption line-clamp-1 text-fg-muted">{o.message}</p>
                </div>
                <Button size="sm" className="min-h-11 shrink-0" onClick={() => onOpenOffer(o.id)}>
                  {copy.remedyChoose}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending.reviews > 0 ? (
        <div className="rounded-card border border-subtle bg-surface-1 p-card qx-elevation-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="qx-small flex items-center gap-2 font-medium text-fg">
                <PenLine aria-hidden className="h-4 w-4 text-brand" />
                {copy.reviewWaiting(pending.reviews)}
              </p>
              {reward ? (
                <p className="qx-caption mt-0.5 text-fg-muted">
                  {copy.reviewEarn(reward.base.points, reward.detailed.points)} · {copy.reviewCapLeft(reward.remainingToday)}
                </p>
              ) : null}
            </div>
            {pending.reviews > pending.reviewPreview.length ? (
              <Link href="/customer/consumptions" className="qx-small inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {copy.allConsumptions}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <ul className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {pending.reviewPreview.map((c) => (
              <li key={c.key} className="w-[15rem] shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => onOpenVoice(c.key)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-control border border-subtle bg-surface-1 p-3 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BusinessAvatar business={c.business} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="qx-small block truncate font-medium text-fg">{c.business.name}</span>
                    <span className="qx-caption block truncate text-fg-muted">
                      {[c.product, formatRelative(c.createdAt, locale)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="qx-caption shrink-0 font-medium text-brand">{copy.writeReview}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
