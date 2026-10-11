'use client';

import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Ban, FlaskConical, Gauge, History, RefreshCw, ShieldAlert, ShieldCheck, ToggleRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage, PanelErrorBoundary, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState, SkeletonTable, TONE_CALLOUT } from '@/components/states';
import type { ExperimentsState, ModulesOverview, RolloutsState } from '@/lib/admin-flags/contract';
import { cn } from '@/lib/utils';
import { fcKeys, fetchOverview } from './api';
import { fmtAbs, fmtNum } from './format';
import { ModulesTab } from './modules-tab';
import { useFeatureLabCopy } from './copy';

// Sekme içerikleri yalnız açıldığında yüklenir (istemci adası küçük kalır).
const tabFallback = () => <SkeletonTable />;
const RolloutsTab = dynamic(() => import('./rollouts-tab').then((m) => m.RolloutsTab), { loading: tabFallback });
const ExperimentsTab = dynamic(() => import('./experiments-tab').then((m) => m.ExperimentsTab), { loading: tabFallback });
const HistoryTab = dynamic(() => import('./history-tab').then((m) => m.HistoryTab), { loading: tabFallback });

export type FeatureControlInitial = {
  overview: ModulesOverview | null;
  rollouts: RolloutsState | null;
  experiments: ExperimentsState | null;
};

const RESET_KEYS = ['q', 'scope', 'state', 'enf', 'sev', 'sort', 'modul', 'deney', 'kind', 'hkey', 'page', 'size'];

/**
 * Özellik ve Deney Kontrolü — /admin/modules + /admin/features + /admin/ab-testing birleşimi.
 * ops kaydı: sakin, yoğun; 3B yok, sonsuz animasyon yok. Ekran DURUMU değil ETKİYİ anlatır:
 * her anahtarın gerçekten neyi kapattığı koddan taranır, etkisiz anahtarlar açıkça işaretlenir.
 */
export function FeatureControl({ initial }: { initial: FeatureControlInitial }) {
  const uy = useFeatureLabCopy().ui2;
  const ux = useFeatureLabCopy().ui;
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: fcKeys.overview(),
    queryFn: ({ signal }) => fetchOverview(signal),
    initialData: initial.overview ?? undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const o = overview.data;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={ux.ozellikVeDeneyKontrolu}
          description={ux.modulAnahtarlariKademeliAcilislar}
          icon={<ToggleRight />}
          actions={
            <Button
              variant="outline"
              className="min-h-11 sm:min-h-10"
              onClick={() => void qc.invalidateQueries({ queryKey: fcKeys.all })}
              disabled={overview.isFetching}
              aria-busy={overview.isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'motion-safe:animate-spin')} aria-hidden />
              {uy.yenile}
            </Button>
          }
        />
      }
    >
      <QueryState query={overview} skeleton="stats" onRetry={() => overview.refetch()}>
        {(data) => <OverviewBlock data={data} />}
      </QueryState>

      <SectionTabs
        ariaLabel={ux.ozellikVeDeneyBolumleri}
        defaultValue="moduller"
        resetKeys={RESET_KEYS}
        tabs={[
          { value: 'moduller', label: ux.modulAnahtarlari, icon: <ShieldCheck />, count: o?.totals.disabled || undefined },
          { value: 'acilis', label: ux.kademeliAcilis, icon: <TrendingUp />, count: o?.totals.activeRollouts || undefined },
          { value: 'deneyler', label: ux.aBDeneyleri, icon: <FlaskConical />, count: o?.totals.runningExperiments || undefined },
          { value: 'gecmis', label: ux.degisiklikGecmisi, icon: <History /> },
        ]}
      >
        {(t) => (
          <PanelErrorBoundary resetKeys={[t]}>
            {t === 'acilis' ? (
              <RolloutsTab initial={initial.rollouts} />
            ) : t === 'deneyler' ? (
              <ExperimentsTab initial={initial.experiments} />
            ) : t === 'gecmis' ? (
              <HistoryTab />
            ) : (
              <ModulesTab query={overview} />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}

function OverviewBlock({ data: o }: { data: ModulesOverview }) {
  const fz = useFeatureLabCopy().fx;
  const ux = useFeatureLabCopy().ui;
  const t = o.totals;
  const problems: string[] = [];
  if (!o.killSwitches.featureFlags) problems.push(ux.kademeliAcilisAcilDurdurmada);
  if (!o.killSwitches.abTesting) problems.push(ux.aBDeneyleriAcil);
  if (o.unknownKeys.length) problems.push(fz.unknownKeys(fmtNum(o.unknownKeys.length)));
  const tone = problems.length ? 'warning' : t.disabled > 0 ? 'info' : 'success';

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className={cn('flex flex-col gap-2 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between', TONE_CALLOUT[tone])}>
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">
              {t.disabled > 0 ? fz.modulesOff(fmtNum(t.disabled)) : ux.butunModullerAcik} · {fz.apiProtected(fmtNum(t.apiGated))}{' '}
              {fz.noReader(fmtNum(t.inert))}
            </p>
            {problems.map((p) => (
              <p key={p} className="text-fg-muted">
                {p}
              </p>
            ))}
          </div>
        </div>
        <p className="shrink-0 text-xs text-fg-muted">
          Veri: <time dateTime={o.generatedAt}>{fmtAbs(o.generatedAt)}</time> · 60 sn'de bir yenilenir
        </p>
      </div>

      <MetricGrid cols={5}>
        <MetricTile
          label={ux.kapaliModul}
          icon={<Ban />}
          tone={t.disabled > 0 ? 'warning' : 'neutral'}
          metric={{ value: t.disabled }}
          hint={fz.ofModules(fmtNum(t.modules), fmtNum(t.roleRestricted))}
          href="/admin/features?tab=moduller&state=off"
          animate
        />
        <MetricTile
          label={ux.apiKapiliModul}
          icon={<ShieldCheck />}
          tone="success"
          metric={{ value: t.apiGated }}
          hint={ux.kapatincaBagliUclar403}
          href="/admin/features?tab=moduller&enf=api"
          animate
        />
        <MetricTile
          label={ux.etkisizAnahtar}
          icon={<ShieldAlert />}
          tone={t.inert > 0 ? 'danger' : 'success'}
          metric={{ value: t.inert }}
          hint={ux.okuyanKodYokDegistirilemez}
          href="/admin/features?tab=moduller&enf=none"
          animate
        />
        <MetricTile
          label={ux.engellenenIstek24Sa}
          icon={<Gauge />}
          tone={t.blocks24h > 0 ? 'info' : 'neutral'}
          metric={{ value: t.blocks24h, compact: true }}
          hint={ux.oturumluIsteklerGerekceKirilimi}
          href="/admin/features?tab=moduller&sort=blocks"
          animate
        />
        <MetricTile
          label={ux.kademeliAcilisDeney}
          icon={<FlaskConical />}
          metric={{ value: t.activeRollouts + t.runningExperiments }}
          hint={fz.rolloutsRunning(fmtNum(t.activeRollouts), fmtNum(t.runningExperiments))}
          href="/admin/features?tab=deneyler"
          animate
        />
      </MetricGrid>
    </div>
  );
}
