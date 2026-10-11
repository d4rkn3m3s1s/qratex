'use client';

/**
 * Cüzdan → Hareketler istemci adası. Cüzdan kabuğu (h1 + cüzdan sekmeleri) layout'ta;
 * burada yalnız iç sekmeler (Puan · Ziyaretler · Özet) ve içerikleri. Sekme ve filtreler
 * URL'de (paylaşılabilir; geri/yenile korunur) ama sunucu yeniden çalıştırılmaz.
 */
import dynamic from 'next/dynamic';
import { Coins, History, PieChart } from 'lucide-react';
import { SkeletonStats } from '@/components/states';
import { SectionTabs } from '@/components/ds/page';
import { PanelErrorBoundary } from '@/components/ds/page';
import type { SpendSummary } from '@/lib/customer-wallet/activity/spend-summary';
import type { SummaryRange } from '@/lib/customer-wallet/periods';
import type { EarnGuide } from '@/lib/economy/earn-guide';
import type { PointsPage, VisitsPage } from './api';
import { useMovesCopy } from './copy';
import { readActivityTab, type ActivityTab, type PointsFilterValue, type VisitsFilterValue } from './filters';
import { PointsTab } from './points-tab';
import { useSearchParamState } from './use-param';
import { VisitsTab } from './visits-tab';

export type ActivityInitial = {
  points?: { filter: PointsFilterValue; page: PointsPage } | null;
  visits?: { filter: VisitsFilterValue; page: VisitsPage } | null;
  summary?: { range: SummaryRange; data: SpendSummary } | null;
};

const SHEET_KEYS = { entry: null } as const;

/** Özet sekmesi (grafik + framer) yalnız açıldığında yüklenir. */
const SummaryTab = dynamic(() => import('./summary-tab').then((m) => m.SummaryTab), {
  loading: () => <SkeletonStats />,
});

export function ActivityView({
  initial,
  summaryEnabled,
  pendingCount,
  guide = null,
}: {
  initial: ActivityInitial;
  summaryEnabled: boolean;
  pendingCount: number | null;
  /** Puan Rehberi (sunucuda üretilir); null → bölüm gösterilmez. */
  guide?: EarnGuide | null;
}) {
  const { copy } = useMovesCopy();
  const url = useSearchParamState();
  const tab = readActivityTab(url.get, summaryEnabled);

  const go = (next: ActivityTab, extra: Record<string, string | null> = {}) => {
    url.patch({ tab: next === 'points' ? null : next, ...SHEET_KEYS, ...extra });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const tabs = [
    { value: 'points', label: copy.tabs.points, icon: <Coins /> },
    {
      value: 'visits',
      label: copy.tabs.visits,
      icon: <History />,
      ...(pendingCount && pendingCount > 0 ? { count: pendingCount } : {}),
    },
    ...(summaryEnabled ? [{ value: 'summary', label: copy.tabs.summary, icon: <PieChart /> }] : []),
  ];

  return (
    <SectionTabs
      tabs={tabs}
      value={tab}
      onValueChange={(v) => go(v as ActivityTab)}
      ariaLabel={copy.tabsLabel}
      variant="pill"
      touchTarget
    >
      {(active) => (
        <PanelErrorBoundary resetKeys={[active]}>
          {active === 'points' ? (
            <PointsTab initial={initial.points} guide={guide} />
          ) : active === 'visits' ? (
            <VisitsTab initial={initial.visits} />
          ) : (
            <SummaryTab
              initial={initial.summary}
              onShowPending={() => go('visits', { review: 'pending', hasReview: null, q: null, dealer: null })}
              onShowDealer={(dealerId) => go('visits', { dealer: dealerId, review: null, hasReview: null, q: null })}
              onShowLedger={() => go('points', { dir: null, src: null })}
            />
          )}
        </PanelErrorBoundary>
      )}
    </SectionTabs>
  );
}
