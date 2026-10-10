'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Database, Moon, ScanLine, ShieldAlert, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DetailSheet, MetricGrid, MetricTile, StatusBadge, useDetailSheet } from '@/components/ds/data';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionTabs } from '@/components/ds/page';
import { EmptyState, QueryState } from '@/components/states';
import type { CustomerListPage, CustomersSummary } from '@/lib/dealer-customers/types';
import { ActionComposer, type ComposerRequest } from './action-composer';
import { customerKeys, fetchSummary, type ListParams } from './api';
import { useCustomersCopy } from './copy';
import { CustomersActionsProvider, type CustomersActions } from './context';
import { CustomerDetailBody, useDetailTitle } from './customer-detail';
import { ListTab } from './list-tab';
import { Callout, useFormat } from './parts';
import { RiskTab } from './risk-tab';
import { SegmentsTab } from './segments-tab';
import { WinBackTab } from './winback-tab';

export type CustomersInitial = {
  summary: CustomersSummary | null;
  list: { params: ListParams; page: CustomerListPage } | null;
  canSend: boolean;
};

const TAB_RESET_KEYS = ['page', 'size', 'sort', 'q', 'segment', 'risk', 'band'] as const;

function DetailTitle({ refId }: { refId: string }) {
  return <>{useDetailTitle(refId)}</>;
}

/**
 * Müşteriler 360 — liste + çekmece + Risk · Geri kazanım · Segmentler (yol haritası §4.3 bayi
 * "Müşteriler", F3.2(c)). Eski /dealer/churn-risk, /dealer/radar ve /dealer/segment-actions bu
 * yüzeyin sekmelerine kalıcı yönlenir. ops kaydı: sakin, yoğun; hareket yalnız durum değişiminde.
 */
export function CustomersScreen({ initial }: { initial: CustomersInitial }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const sheet = useDetailSheet();
  const [composer, setComposer] = useState<ComposerRequest | null>(null);

  const summary = useQuery({
    queryKey: customerKeys.summary(),
    queryFn: fetchSummary,
    initialData: initial.summary ?? undefined,
    staleTime: 60_000,
  });

  const compose = useCallback((req: ComposerRequest) => setComposer(req), []);
  const actions = useMemo<CustomersActions>(
    () => ({ compose, openCustomer: sheet.open, canSend: initial.canSend }),
    [compose, sheet.open, initial.canSend]
  );

  const s = summary.data;
  const freshness = s ? (s.source === 'live' ? copy.freshnessLive : s.calculatedAt ? copy.freshnessAt(fmt.relative(s.calculatedAt)) : null) : null;

  return (
    <CustomersActionsProvider value={actions}>
      <PanelPage
        register="ops"
        header={
          <PageHeader
            title={copy.title}
            description={copy.description}
            icon={<Users />}
            meta={freshness ? <StatusBadge size="sm" tone={s?.stale ? 'warning' : 'neutral'} icon={Database} label={freshness} /> : undefined}
          />
        }
      >
        <QueryState query={summary} skeleton="stats" isEmpty={(d) => d.total === 0} empty={
          <EmptyState
            variant="first-use"
            icon={Users}
            title={copy.firstUseTitle}
            description={copy.firstUseBody}
            action={
              <Button asChild className="min-h-11">
                <Link href="/dealer/scan">
                  <ScanLine className="h-4 w-4" aria-hidden />
                  {copy.firstUseCta}
                </Link>
              </Button>
            }
          />
        }>
          {(d) => (
            <div className="space-y-6">
              {d.stale && d.calculatedAt && (
                <Callout tone="warning" icon={AlertTriangle}>
                  {copy.staleNote(fmt.relative(d.calculatedAt))}
                </Callout>
              )}
              {d.source === 'live' && <Callout tone="info">{copy.liveNote}</Callout>}

              <MetricGrid cols={5}>
                <MetricTile
                  label={copy.kpiTotal}
                  metric={{ value: d.total }}
                  icon={<Users />}
                  hint={d.repeatRate != null ? copy.kpiTotalHint(fmt.percent(d.repeatRate / 100)) : undefined}
                />
                <MetricTile label={copy.kpiActive} metric={{ value: d.active30 }} icon={<Activity />} hint={copy.kpiActiveHint(d.newThisMonth)} tone="success" />
                <MetricTile label={copy.kpiRisk} metric={{ value: d.atRisk }} icon={<ShieldAlert />} hint={copy.kpiRiskHint} tone="danger" href="?tab=risk" />
                <MetricTile label={copy.kpiDormant} metric={{ value: d.dormant }} icon={<Moon />} hint={copy.kpiDormantHint} tone="warning" href="?tab=winback" />
                <MetricTile
                  label={copy.kpiValue}
                  metric={{ value: d.avgCustomerValue, format: 'currency', currency: 'TRY' }}
                  icon={<Wallet />}
                  hint={copy.kpiValueHint}
                />
              </MetricGrid>

              <SectionTabs
                ariaLabel={copy.tabsLabel}
                defaultValue="list"
                resetKeys={TAB_RESET_KEYS}
                tabs={[
                  { value: 'list', label: copy.tabList, count: d.total },
                  { value: 'risk', label: copy.tabRisk, count: d.atRisk },
                  { value: 'winback', label: copy.tabWinback, count: d.dormant },
                  { value: 'segments', label: copy.tabSegments },
                ]}
              >
                {(tab) => (
                  <PanelErrorBoundary resetKeys={[tab]}>
                    {tab === 'risk' ? (
                      <RiskTab />
                    ) : tab === 'winback' ? (
                      <WinBackTab />
                    ) : tab === 'segments' ? (
                      <SegmentsTab />
                    ) : (
                      <ListTab initial={initial.list} />
                    )}
                  </PanelErrorBoundary>
                )}
              </SectionTabs>
            </div>
          )}
        </QueryState>
      </PanelPage>

      <DetailSheet size="lg" title={(id) => <DetailTitle refId={id} />}>
        {(id) => <CustomerDetailBody refId={id} />}
      </DetailSheet>

      <ActionComposer request={composer} onClose={() => setComposer(null)} />
    </CustomersActionsProvider>
  );
}
