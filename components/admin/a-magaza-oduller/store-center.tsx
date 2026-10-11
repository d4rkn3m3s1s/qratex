'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Inbox, Palette, Plus, RefreshCw, ShoppingBag, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, useDetailSheet } from '@/components/ds/data';
import { PageHeader, PanelPage, SectionTabs, useUrlState } from '@/components/ds/page';
import type { CosmeticListItem, CosmeticStats, RedemptionStats, RewardListItem, RewardStats } from '@/lib/admin-store/contract';
import { fetchCosmeticStats, fetchRedemptionStats, fetchRewardStats, storeKeys } from './api';
import { RewardsTab, type RewardsInitial } from './rewards-tab';
import { RewardDetailBody } from './reward-sheet';
import { RewardEditor } from './reward-editor';
import { RedemptionsTab } from './redemptions-tab';
import { CosmeticsTab, type CosmeticsInitial } from './cosmetics-tab';
import { CosmeticDetailBody } from './cosmetic-sheet';
import { CosmeticEditor } from './cosmetic-editor';
import { useStoreCopy } from './copy';

export type StoreInitial = {
  rewardStats: RewardStats | null;
  redemptionStats: RedemptionStats | null;
  cosmeticStats: CosmeticStats | null;
  rewards: RewardsInitial;
  cosmetics: CosmeticsInitial;
  rewardsModuleOff: boolean;
};

/**
 * Admin → Mağaza ve Ödüller (/admin/rewards): Ödüller · Kozmetik · Talepler.
 * Eski /admin/shop buraya (?tab=kozmetik) kalıcı yönlenir.
 */
export function StoreCenter({ initial }: { initial: StoreInitial }) {
  const uy = useStoreCopy().ui2;
  const ux = useStoreCopy().ui;
  const qc = useQueryClient();
  const { get } = useUrlState();
  const tab = get('tab') ?? 'oduller';
  const rewardStats = useQuery({ queryKey: storeKeys.rewardStats(), queryFn: fetchRewardStats, initialData: initial.rewardStats ?? undefined, staleTime: 30_000 });
  const redemptionStats = useQuery({ queryKey: storeKeys.redemptionStats(), queryFn: fetchRedemptionStats, initialData: initial.redemptionStats ?? undefined, staleTime: 30_000 });
  const cosmeticStats = useQuery({ queryKey: storeKeys.cosmeticStats(), queryFn: fetchCosmeticStats, initialData: initial.cosmeticStats ?? undefined, staleTime: 30_000 });
  const rewardSheet = useDetailSheet('odul');
  const cosmeticSheet = useDetailSheet('kozmetik');
  const [rewardEditor, setRewardEditor] = useState<{ open: boolean; item: RewardListItem | null }>({ open: false, item: null });
  const [cosmeticEditor, setCosmeticEditor] = useState<{ open: boolean; item: CosmeticListItem | null }>({ open: false, item: null });

  const onCosmetic = tab === 'kozmetik';
  const create = () => (onCosmetic ? setCosmeticEditor({ open: true, item: null }) : setRewardEditor({ open: true, item: null }));

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={ux.magazaVeOduller}
          description={ux.musterininPuanHarcadigiHer}
          icon={<ShoppingBag />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: storeKeys.all })}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                {uy.yenile}
              </Button>
              {tab !== 'talepler' ? (
                <Button className="min-h-11 sm:min-h-10" onClick={create}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {onCosmetic ? ux.yeniUrun : ux.yeniOdul}
                </Button>
              ) : null}
            </div>
          }
        />
      }
    >
      {initial.rewardsModuleOff ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          {ux.odulModuluKapaliMusteriler}
          <Link href="/admin/features" className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline sm:min-h-0">
            {ux.modullerSayfasinaGit}
          </Link>
        </p>
      ) : null}

      <SectionTabs
        ariaLabel={ux.magazaBolumleri}
        defaultValue="oduller"
        resetKeys={['page', 'size', 'sort', 'q', 'status', 'type', 'rarity', 'rewardId', 'odul', 'kozmetik']}
        tabs={[
          { value: 'oduller', label: ux.oduller, icon: <Gift />, count: rewardStats.data ? rewardStats.data.published + rewardStats.data.draft : undefined },
          { value: 'kozmetik', label: ux.kozmetik, icon: <Palette />, count: cosmeticStats.data ? cosmeticStats.data.active + cosmeticStats.data.inactive : undefined },
          { value: 'talepler', label: ux.talepler, icon: <Inbox />, count: redemptionStats.data?.pending },
        ]}
      >
        {(t) =>
          t === 'kozmetik' ? (
            <CosmeticsTab
              initial={initial.cosmetics}
              stats={cosmeticStats.data}
              statsError={cosmeticStats.isError ? cosmeticStats.error : null}
              onRetryStats={() => cosmeticStats.refetch()}
              onCreate={() => setCosmeticEditor({ open: true, item: null })}
            />
          ) : t === 'talepler' ? (
            <RedemptionsTab stats={redemptionStats.data} statsError={redemptionStats.isError ? redemptionStats.error : null} onRetryStats={() => redemptionStats.refetch()} />
          ) : (
            <RewardsTab
              initial={initial.rewards}
              stats={rewardStats.data}
              statsError={rewardStats.isError ? rewardStats.error : null}
              onRetryStats={() => rewardStats.refetch()}
              onCreate={() => setRewardEditor({ open: true, item: null })}
            />
          )
        }
      </SectionTabs>

      <DetailSheet paramKey="odul" size="lg" title={ux.odulAyrintisi} description={ux.talepEgilimiStokKod}>
        {(id) => <RewardDetailBody id={id} onEdit={(r) => setRewardEditor({ open: true, item: r })} onOpenOther={(other) => rewardSheet.open(other)} />}
      </DetailSheet>
      <DetailSheet paramKey="kozmetik" size="lg" title={ux.urunAyrintisi} description={ux.edinimEgilimiSahiplerVe}>
        {(id) => <CosmeticDetailBody id={id} onEdit={(c) => setCosmeticEditor({ open: true, item: c })} onOpenOther={(other) => cosmeticSheet.open(other)} />}
      </DetailSheet>

      <RewardEditor
        open={rewardEditor.open}
        reward={rewardEditor.item}
        onOpenChange={(open) => setRewardEditor((s) => ({ ...s, open }))}
        onSaved={async (id) => {
          await qc.invalidateQueries({ queryKey: storeKeys.all });
          rewardSheet.open(id);
        }}
      />
      <CosmeticEditor
        open={cosmeticEditor.open}
        item={cosmeticEditor.item}
        onOpenChange={(open) => setCosmeticEditor((s) => ({ ...s, open }))}
        onSaved={async (id) => {
          await qc.invalidateQueries({ queryKey: storeKeys.all });
          cosmeticSheet.open(id);
        }}
      />
    </PanelPage>
  );
}
