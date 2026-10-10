'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { SectionTabs } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import type { OpenedBoxDTO, OwnedWalletDTO, Page, RevealPayload, RewardPassDTO } from '@/lib/wallet-rewards/types';
import { errorText, walletGet, walletPost } from './api';
import { useWalletCopy } from './copy';
import { BoxRevealDialog } from './box-reveal-dialog';
import { BoxesSection } from './boxes-section';
import { PassesSection } from './passes-section';
import { PassSheet, type AnyPass } from './pass-sheet';
import { useShallowQuery } from './use-shallow-query';

function mergePage<T extends { id: string }>(base: readonly T[], more: readonly T[]): T[] {
  const seen = new Set(base.map((x) => x.id));
  return [...base, ...more.filter((x) => !seen.has(x.id))];
}

/**
 * Cüzdan → Ödüllerim istemci adası: Kodlarım (ödül kodları + telafi kuponları) ve
 * Kutularım (günlük kutu + bekleyen hediyeler + açılanlar). İlk veri sunucudan; geçmiş
 * cursor ile sayfalanır; açılış sonrası yalnız sunucu verisi tazelenir.
 */
export function OwnedView({ data }: { data: OwnedWalletDTO | null }) {
  const copy = useWalletCopy();
  const router = useRouter();
  const url = useShallowQuery();
  const [, startRefresh] = useTransition();
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  // Sayfalanan geçmişler (sunucu ilk sayfayı verir; "daha fazla" ekler).
  const [usedMore, setUsedMore] = useState<Page<RewardPassDTO> | null>(null);
  const [boxesMore, setBoxesMore] = useState<Page<OpenedBoxDTO> | null>(null);
  const [loadingMore, setLoadingMore] = useState<'passes' | 'boxes' | null>(null);
  useEffect(() => {
    setUsedMore(null);
    setBoxesMore(null);
  }, [data]);

  const used = useMemo(() => (data ? mergePage(data.usedPasses.items, usedMore?.items ?? []) : []), [data, usedMore]);
  const usedCursor = usedMore ? usedMore.nextCursor : data?.usedPasses.nextCursor ?? null;
  const opened = useMemo(() => (data ? mergePage(data.boxes.opened.items, boxesMore?.items ?? []) : []), [data, boxesMore]);
  const boxesCursor = boxesMore ? boxesMore.nextCursor : data?.boxes.opened.nextCursor ?? null;

  async function loadMore(kind: 'passes' | 'boxes') {
    const cursor = kind === 'passes' ? usedCursor : boxesCursor;
    if (!cursor) return;
    setLoadingMore(kind);
    try {
      if (kind === 'passes') {
        const page = await walletGet<Page<RewardPassDTO>>(`/api/customer/wallet/owned-history?kind=passes&cursor=${encodeURIComponent(cursor)}`);
        setUsedMore((prev) => ({ items: [...(prev?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
      } else {
        const page = await walletGet<Page<OpenedBoxDTO>>(`/api/customer/wallet/owned-history?kind=boxes&cursor=${encodeURIComponent(cursor)}`);
        setBoxesMore((prev) => ({ items: [...(prev?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
      }
    } catch (err) {
      toast.error(errorText(err, copy.errors));
    } finally {
      setLoadingMore(null);
    }
  }

  // Kutu açılışı
  const [reveal, setReveal] = useState<{ run: () => Promise<RevealPayload> } | null>(null);
  const openBoxById = (id: string) =>
    setReveal({ run: () => walletPost<RevealPayload>(`/api/customer/wallet/boxes/${encodeURIComponent(id)}/open`) });
  const openDaily = () =>
    setReveal({
      run: async () => {
        const known = data?.boxes.daily?.boxId;
        const id = known ?? (await walletPost<{ id: string }>('/api/customer/wallet/boxes/daily')).id;
        return walletPost<RevealPayload>(`/api/customer/wallet/boxes/${encodeURIComponent(id)}/open`);
      },
    });

  const find = useCallback(
    (kind: string, id: string): AnyPass | null => {
      if (!data) return null;
      if (kind === 'reward') return data.passes.find((p) => p.id === id) ?? used.find((p) => p.id === id) ?? null;
      if (kind === 'remedy') return data.remedyPasses.find((p) => p.id === id) ?? null;
      if (kind === 'box') return opened.find((b) => b.id === id) ?? null;
      return null;
    },
    [data, used, opened]
  );

  const tab = url.get('tab') === 'boxes' ? 'boxes' : 'passes';
  const passCount = (data?.passes.length ?? 0) + (data?.remedyPasses.length ?? 0);
  const boxCount = (data?.boxes.unopened.length ?? 0) + (data?.boxes.daily && !data.boxes.daily.opened ? 1 : 0);

  return (
    <div className="flex min-w-0 flex-col gap-section">
      <h2 className="sr-only">{copy.ownedTitle}</h2>
      {!data ? (
        <ErrorState kind="generic" title={copy.loadErrorTitle} description={copy.loadErrorBody} onRetry={refresh} />
      ) : (
        <SectionTabs
          value={tab}
          onValueChange={(v) => url.set({ tab: v === 'passes' ? null : v })}
          ariaLabel={copy.ownedTitle}
          tabs={[
            { value: 'passes', label: copy.tabs.passes, icon: <Ticket className="size-4" />, count: passCount },
            { value: 'boxes', label: copy.tabs.boxes, icon: <Package className="size-4" />, count: data.boxes.enabled ? boxCount : undefined },
          ]}
        >
          {(active) =>
            active === 'passes' ? (
              <PassesSection
                passes={data.passes}
                remedy={data.remedyPasses}
                used={used}
                hasMoreUsed={!!usedCursor}
                loadingMore={loadingMore === 'passes'}
                onOpen={(param) => url.set({ pass: param }, 'push')}
                onLoadMore={() => void loadMore('passes')}
              />
            ) : (
              <BoxesSection
                enabled={data.boxes.enabled}
                daily={data.boxes.daily}
                unopened={data.boxes.unopened}
                opened={opened}
                hasMore={!!boxesCursor}
                loadingMore={loadingMore === 'boxes'}
                busy={!!reveal}
                onOpenDaily={openDaily}
                onOpenBox={openBoxById}
                onShowOpened={(id) => url.set({ pass: `box:${id}` }, 'push')}
                onLoadMore={() => void loadMore('boxes')}
                onDayChange={refresh}
              />
            )
          }
        </SectionTabs>
      )}

      <PassSheet find={find} onUsed={refresh} />
      <BoxRevealDialog
        open={!!reveal}
        run={reveal?.run ?? null}
        onOpenChange={(o) => {
          if (!o) setReveal(null);
        }}
        onRevealed={() => refresh()}
      />
    </div>
  );
}
