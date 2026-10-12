'use client';

import { Gift, Package, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard, RarityBadge } from '@/components/ds/play';
import { EmptyState, SectionCard } from '@/components/states';
import type { BoxTeaserDTO, DailyBoxDTO, OpenedBoxDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { formatDate } from './format';
import { OpenedBoxRow } from './pass-cards';

/**
 * Kutularım: bugünün kutusu (açılınca sonraki gece yarısına geri sayım) · bekleyen hediye kutuları
 * (yalnız kademe ve kaynak; kesin puan "sürprizi" bozmaz) · açılan kutular (kupon kodları kaybolmaz).
 * Kutu üretimine dair GERÇEK OLMAYAN vaatler ("yorum yaz, ihtimal artar") kaldırıldı.
 */
export function BoxesSection({
  enabled,
  daily,
  unopened,
  opened,
  hasMore,
  loadingMore,
  busy,
  onOpenDaily,
  onOpenBox,
  onShowOpened,
  onLoadMore,
  onDayChange,
}: {
  enabled: boolean;
  daily: DailyBoxDTO | null;
  unopened: readonly BoxTeaserDTO[];
  opened: readonly OpenedBoxDTO[];
  hasMore: boolean;
  loadingMore: boolean;
  busy: boolean;
  onOpenDaily: () => void;
  onOpenBox: (id: string) => void;
  onShowOpened: (id: string) => void;
  onLoadMore: () => void;
  onDayChange: () => void;
}) {
  const copy = useWalletCopy();

  if (!enabled) {
    return <EmptyState variant="permission" icon={Package} title={copy.boxes.disabledTitle} description={copy.boxes.disabledBody} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-section">
      {daily && (
        <GlowCard register="play">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-card bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border"
            >
              {daily.opened ? <PackageOpen className="size-8" /> : <Gift className="size-8" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="qx-h3 text-fg">{copy.boxes.todayTitle}</h2>
              <p className="qx-small mt-0.5 text-fg-muted">{daily.opened ? copy.boxes.todayOpened : copy.boxes.todayReady}</p>
            </div>
            {daily.opened ? (
              <div className="flex items-center gap-2">
                <span className="qx-small text-fg-muted">{copy.boxes.nextIn}</span>
                <CountdownChip target={daily.nextAt} label={null} onExpire={onDayChange} />
              </div>
            ) : (
              <Button onClick={onOpenDaily} loading={busy} disabled={busy} className="w-full sm:w-auto">
                <Gift aria-hidden className="size-4" />
                {copy.boxes.open}
              </Button>
            )}
          </div>
        </GlowCard>
      )}

      <SectionCard title={copy.boxes.waitingTitle} description={copy.boxes.tierHint} headingLevel="h2">
        {unopened.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.boxes.waitingEmpty}</p>
        ) : (
          <ul className="qx-fx-stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unopened.map((b) => (
              <li key={b.id} className="flex min-h-[4.5rem] items-center gap-3 rounded-card border border-subtle bg-surface-1 p-3">
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted">
                  <Gift className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="qx-small truncate font-semibold text-fg">{b.title}</p>
                  <p className="qx-caption text-fg-muted">
                    {copy.boxes.source[b.source]} · {formatDate(b.createdAt, copy.locale)}
                  </p>
                  <RarityBadge rarity={b.tier} size="sm" register="ops" className="mt-1" />
                </div>
                <Button size="sm" onClick={() => onOpenBox(b.id)} disabled={busy} className="min-h-11 shrink-0">
                  {copy.boxes.open}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={copy.boxes.historyTitle} headingLevel="h2">
        {opened.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.boxes.historyEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {opened.map((b) => (
                <li key={b.id}>
                  <OpenedBoxRow box={b} onOpen={() => onShowOpened(b.id)} />
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button variant="outline" onClick={onLoadMore} loading={loadingMore} disabled={loadingMore} className="self-center">
                {copy.passes.loadMore}
              </Button>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
