'use client';

import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionCard } from '@/components/states';
import type { RemedyPassDTO, RewardPassDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { RemedyPassRow, RewardPassRow } from './pass-cards';

/**
 * Kodlarım: kullanıma hazır ödül kodları · kabul edilmiş telafi kuponları · kullanılanlar
 * (sayfalı). Teklif KABUL akışı Seslerim'dedir; burada yalnız kupon görünümü vardır.
 */
export function PassesSection({
  passes,
  remedy,
  used,
  hasMoreUsed,
  loadingMore,
  onOpen,
  onLoadMore,
}: {
  passes: readonly RewardPassDTO[];
  remedy: readonly RemedyPassDTO[];
  used: readonly RewardPassDTO[];
  hasMoreUsed: boolean;
  loadingMore: boolean;
  onOpen: (param: string) => void;
  onLoadMore: () => void;
}) {
  const copy = useWalletCopy();
  return (
    <div className="flex min-w-0 flex-col gap-section">
      <SectionCard title={copy.passes.readyTitle} headingLevel="h2">
        {passes.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={Ticket}
            compact
            title={copy.passes.readyEmptyTitle}
            description={copy.passes.readyEmptyBody}
            action={
              <Button asChild>
                <Link href="/customer/wallet/rewards">{copy.goToRewards}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="qx-fx-stagger grid grid-cols-1 gap-2 md:grid-cols-2">
            {passes.map((p) => (
              <li key={p.id} className="min-w-0">
                <RewardPassRow pass={p} onOpen={() => onOpen(`reward:${p.id}`)} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {remedy.length > 0 && (
        <SectionCard title={copy.passes.remedyTitle} description={copy.passes.remedyHint} headingLevel="h2">
          <ul className="qx-fx-stagger grid grid-cols-1 gap-2 md:grid-cols-2">
            {remedy.map((p) => (
              <li key={p.id} className="min-w-0">
                <RemedyPassRow pass={p} onOpen={() => onOpen(`remedy:${p.id}`)} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title={copy.passes.usedTitle} headingLevel="h2">
        {used.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.passes.usedEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ul className="qx-fx-stagger grid grid-cols-1 gap-2 md:grid-cols-2">
              {used.map((p) => (
                <li key={p.id} className="min-w-0">
                  <RewardPassRow pass={p} onOpen={() => onOpen(`reward:${p.id}`)} />
                </li>
              ))}
            </ul>
            {hasMoreUsed && (
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
