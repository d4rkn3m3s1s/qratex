'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Palette } from 'lucide-react';
import { SectionTabs } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import type { ClaimRewardResult, CosmeticsCatalogDTO, RewardsCatalogDTO } from '@/lib/wallet-rewards/types';
import { useWalletCopy } from './copy';
import { BalanceHero } from './balance-hero';
import { RewardCatalog } from './reward-catalog';
import { CosmeticsCatalog } from './cosmetics-catalog';
import { useShallowQuery } from './use-shallow-query';

export type LoadIssue = 'moduleDisabled' | 'error' | null;

/**
 * Cüzdan → Ödüller istemci adası. Veri sunucudan gelir (ilk boyamada bakiye ve katalog hazır;
 * "0 puan" parlaması yok). Sekme/filtre/detay URL'de, sunucuya gitmeden (shallow).
 * Yazma sonrası `router.refresh()` sunucu durumunu (stok, limit, sahiplik) yeniden okur.
 */
export function RewardsView({
  balance: serverBalance,
  rewards,
  rewardsIssue,
  cosmetics,
  cosmeticsIssue,
}: {
  balance: number | null;
  rewards: RewardsCatalogDTO | null;
  rewardsIssue: LoadIssue;
  cosmetics: CosmeticsCatalogDTO | null;
  cosmeticsIssue: LoadIssue;
}) {
  const copy = useWalletCopy();
  const router = useRouter();
  const url = useShallowQuery();
  const [, startRefresh] = useTransition();
  const [localBalance, setBalance] = useState(serverBalance);
  useEffect(() => setBalance(serverBalance), [serverBalance]);
  const balance = localBalance ?? 0;

  const tab = url.get('tab') === 'cosmetics' ? 'cosmetics' : 'rewards';
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const onClaimed = useCallback(
    (r: ClaimRewardResult) => {
      setBalance(r.newBalance);
      refresh();
    },
    [refresh]
  );

  const goal = useMemo(() => {
    if (!rewards?.nextGoalId) return null;
    const r = rewards.rewards.find((x) => x.id === rewards.nextGoalId);
    return r ? { id: r.id, name: r.name, cost: r.cost } : null;
  }, [rewards]);

  const issueView = (issue: LoadIssue) =>
    issue === 'moduleDisabled' ? (
      <ErrorState kind="moduleDisabled" title={copy.moduleOffTitle} description={copy.moduleOffBody} />
    ) : (
      <ErrorState kind="generic" title={copy.loadErrorTitle} description={copy.loadErrorBody} onRetry={refresh} />
    );

  return (
    <div className="flex min-w-0 flex-col gap-section">
      <h2 className="sr-only">{copy.rewardsTitle}</h2>
      {localBalance !== null && (
        <BalanceHero
          balance={localBalance}
          goal={goal}
          onOpenGoal={goal ? (id) => url.set({ tab: null, reward: id }, 'push') : undefined}
        />
      )}

      <SectionTabs
        value={tab}
        onValueChange={(v) => url.set({ tab: v === 'rewards' ? null : v, reward: null, item: null })}
        ariaLabel={copy.rewardsTitle}
        tabs={[
          { value: 'rewards', label: copy.tabs.rewards, icon: <Gift className="size-4" /> },
          { value: 'cosmetics', label: copy.tabs.cosmetics, icon: <Palette className="size-4" /> },
        ]}
      >
        {(active) =>
          active === 'rewards' ? (
            rewards ? (
              <RewardCatalog rewards={rewards.rewards} balance={balance} truncated={rewards.truncated} onClaimed={onClaimed} onRefresh={refresh} />
            ) : (
              issueView(rewardsIssue)
            )
          ) : cosmetics ? (
            <CosmeticsCatalog catalog={cosmetics} balance={balance} onBalance={setBalance} onRefresh={refresh} />
          ) : (
            issueView(cosmeticsIssue)
          )
        }
      </SectionTabs>
    </div>
  );
}
