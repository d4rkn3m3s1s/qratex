'use client';

/**
 * /admin/segments istemci adası — üç sekme (URL `?tab=`): Segmentler (kayıt defteri + üyeler),
 * Öneriler (tek onay kuyruğu), Modüller (inovasyon ayarları). Öneriler ve Modüller ağır/etkileşimli
 * olduğundan yalnız açıldığında yüklenir (lazy).
 */
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { PieChart } from 'lucide-react';
import { PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { useDsLocale } from '@/components/ds/a11y';
import { SkeletonTable } from '@/components/states';
import { SEGMENTS_COPY } from '../copy';
import { fetchOverview } from '../client/api';
import type { SegmentOverview } from '../domain';
import { SegmentsTab } from './segments-tab';

const ProposalsTab = dynamic(() => import('./proposals-tab').then((m) => m.ProposalsTab), {
  ssr: false,
  loading: () => <SkeletonTable rows={6} />,
});
const ModulesTab = dynamic(() => import('./modules-tab').then((m) => m.ModulesTab), {
  ssr: false,
  loading: () => <SkeletonTable rows={4} />,
});

export const OVERVIEW_KEY = ['admin-segments', 'overview'] as const;

export function SegmentsClient({ initial }: { initial: SegmentOverview | null }) {
  return (
    <Suspense fallback={null}>
      <Inner initial={initial} />
    </Suspense>
  );
}

function Inner({ initial }: { initial: SegmentOverview | null }) {
  const locale = useDsLocale();
  const c = SEGMENTS_COPY[locale];
  const overview = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: ({ signal }) => fetchOverview({}, signal),
    initialData: initial ?? undefined,
    staleTime: 60_000,
  });
  const pending = overview.data?.pendingProposals;

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={<PageHeader eyebrow={c.eyebrow} title={c.title} description={c.description} icon={<PieChart className="h-5 w-5" />} />}
    >
      <SectionTabs
        ariaLabel={c.title}
        resetKeys={['page', 'size', 'sort', 'q', 'segment', 'oneri', 'durum', 'seg', 'kaynak']}
        tabs={[
          { value: 'segmentler', label: c.tabs.segments },
          { value: 'oneriler', label: c.tabs.proposals, count: pending && pending > 0 ? pending : undefined },
          { value: 'moduller', label: c.tabs.modules },
        ]}
      >
        {(active) =>
          active === 'oneriler' ? (
            <ProposalsTab c={c} locale={locale} />
          ) : active === 'moduller' ? (
            <ModulesTab c={c} />
          ) : (
            <SegmentsTab c={c} locale={locale} overview={overview} />
          )
        }
      </SectionTabs>
    </PanelPage>
  );
}
