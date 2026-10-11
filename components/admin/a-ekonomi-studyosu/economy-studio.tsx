'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Coins, Disc3, FlaskConical, Gauge, Trophy } from 'lucide-react';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { SkeletonStats, type ImpactPreview } from '@/components/states';
import { pointsMatrixSchema } from '@/lib/points-matrix-schema';
import type { PointsMatrix } from '@/lib/points-rules';
import type { LeagueRule } from '@/lib/league-rules-core';
import {
  leagueRuleErrors,
  parseEconomyTab,
  multipliersSchema,
  type EconomyTab,
  type LeaguesResource,
  type MatrixResource,
  type Multipliers,
  type MultipliersResource,
  type Preload,
} from '@/lib/admin-economy/contract';
import * as api from './api';
import { useEditableResource } from './use-editable-resource';
import { ResourceGate, fmtInt, fmtPct } from './parts';
import { StudioSaveBar } from './save-flow';
import { MatrixTab, matrixPathLabel, type MatrixMeta } from './matrix-tab';
import { MultipliersTab, multipliersPathLabel, type MultipliersMeta } from './multipliers-tab';
import { LeaguesTab, leaguesPathLabel } from './leagues-tab';

// Ağır defter sorguları + tablolar yalnız sekme açılınca yüklenir.
const SimulationTab = dynamic(() => import('./simulation-tab'), {
  ssr: false,
  loading: () => (
    <div role="status" aria-busy="true">
      <span className="sr-only">Simülasyon yükleniyor…</span>
      <SkeletonStats />
    </div>
  ),
});

export type EconomyInitial = {
  matrix: Preload<MatrixResource>;
  multipliers: Preload<MultipliersResource>;
  leagues: Preload<LeaguesResource>;
};

function zodMessages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string[] {
  return result.success ? [] : Array.from(new Set(result.error!.issues.map((i) => i.message)));
}

async function impactFor(body: { matrix?: PointsMatrix; multipliers?: Multipliers }): Promise<ImpactPreview> {
  const r = await api.simulate({ days: 30, ...body });
  return {
    items: [
      { label: 'Son 30 günde basılan (gerçek)', value: `${fmtInt(r.observedMint)} puan` },
      { label: 'Bu taslakla tahmini', value: `${fmtInt(r.projectedMint)} puan`, emphasis: true },
      { label: 'Değişim', value: r.deltaPct == null ? '—' : `${r.deltaPct >= 0 ? '+' : ''}${fmtPct(r.deltaPct)}`, emphasis: Math.abs(r.deltaPct ?? 0) >= 20 },
    ],
    warning:
      (r.deltaPct ?? 0) >= 50
        ? 'Basım yarıdan fazla artıyor. Tavanlar artışı kısabilir ama dolaşımdaki puan hızla büyür.'
        : undefined,
  };
}

/**
 * Ekonomi Stüdyosu istemci adası. Üç düzenlenebilir kaynağın taslakları burada yaşar —
 * sekme değiştirmek düzenlemeleri kaybettirmez; kirli sekme başlıkta işaretlenir.
 */
export function EconomyStudio({ initialTab, initial }: { initialTab: EconomyTab; initial: EconomyInitial }) {
  const matrix = useEditableResource<PointsMatrix, MatrixMeta>({
    initial: initial.matrix ? { data: initial.matrix.data.matrix, meta: { defaults: initial.matrix.data.defaults }, version: initial.matrix.version } : null,
    load: api.loadMatrix,
    save: api.saveMatrix,
    parse: api.parseMatrixSave,
    initialError: 'Puan matrisi sunucudan okunamadı. Kayıtlı matris değişmedi.',
  });
  const multipliers = useEditableResource<Multipliers, MultipliersMeta>({
    initial: initial.multipliers
      ? { data: initial.multipliers.data.multipliers, meta: { isDefault: initial.multipliers.data.isDefault, caps: initial.multipliers.data.caps }, version: initial.multipliers.version }
      : null,
    load: api.loadMultipliers,
    save: api.saveMultipliers,
    parse: api.parseMultipliersSave,
    initialError: 'Çarpanlar sunucudan okunamadı. Kayıtlı değerler değişmedi.',
  });
  const leagues = useEditableResource<LeagueRule[], api.LeaguesMeta>({
    initial: initial.leagues
      ? {
          data: initial.leagues.data.rules,
          meta: { isDefault: initial.leagues.data.isDefault, distribution: initial.leagues.data.distribution, totalUsers: initial.leagues.data.totalUsers },
          version: initial.leagues.version,
        }
      : null,
    load: api.loadLeagues,
    save: api.saveLeagues,
    parse: api.parseLeaguesSave,
    initialError: 'Lig ayarları sunucudan okunamadı. Kayıtlı kurallar değişmedi.',
  });

  const sp = useSearchParams();
  const urlTab: EconomyTab = sp ? parseEconomyTab(sp.get('tab')) : initialTab;
  // Sekme tıklanınca kaydet çubuğu da URL turunu beklemeden değişsin (SectionTabs iyimser).
  const [pickedTab, setPickedTab] = React.useState<EconomyTab | null>(null);
  React.useEffect(() => setPickedTab(null), [urlTab]);
  const active: EconomyTab = pickedTab ?? urlTab;

  const matrixErrors = React.useMemo(() => (matrix.draft ? zodMessages(pointsMatrixSchema.safeParse(matrix.draft)) : []), [matrix.draft]);
  const multErrors = React.useMemo(() => (multipliers.draft ? zodMessages(multipliersSchema.safeParse(multipliers.draft)) : []), [multipliers.draft]);
  const leagueErrors = React.useMemo(() => (leagues.draft ? Object.values(leagueRuleErrors(leagues.draft)) : []), [leagues.draft]);

  const dot = (dirty: boolean, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {dirty && (
        <>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span className="sr-only">(kaydedilmemiş değişiklik)</span>
        </>
      )}
    </span>
  );

  return (
    <PanelPage
      register="ops"
      className="pb-28"
      header={
        <PageHeader
          title="Ekonomi Stüdyosu"
          eyebrow="Ekonomi ve oyun"
          icon={<Coins className="h-5 w-5" />}
          description="Puan kuralları, çarpanlar, tavanlar ve ligler tek yerde. Her değişiklik önce gözden geçirilir, gerçek defter verisiyle etkisi gösterilir, sonra yayınlanır."
        />
      }
    >

      <SectionTabs
        ariaLabel="Ekonomi Stüdyosu bölümleri"
        defaultValue="matrix"
        onValueChange={(v) => setPickedTab(parseEconomyTab(v))}
        tabs={[
          { value: 'matrix', label: dot(matrix.dirty, 'Puan matrisi'), icon: <Disc3 /> },
          { value: 'multipliers', label: dot(multipliers.dirty, 'Çarpan ve tavanlar'), icon: <Gauge /> },
          { value: 'leagues', label: dot(leagues.dirty, 'Ligler'), icon: <Trophy /> },
          { value: 'simulation', label: 'Simülasyon', icon: <FlaskConical /> },
        ]}
      >
        {(tab) => {
          switch (tab) {
            case 'multipliers':
              return (
                <ResourceGate resource={multipliers} title="Çarpanlar">
                  {() => <MultipliersTab resource={multipliers} />}
                </ResourceGate>
              );
            case 'leagues':
              return (
                <ResourceGate resource={leagues} title="Lig ayarları">
                  {() => <LeaguesTab resource={leagues} />}
                </ResourceGate>
              );
            case 'simulation':
              return (
                <SimulationTab
                  draftMatrix={matrix.draft}
                  draftMultipliers={multipliers.draft}
                  matrixDirty={matrix.dirty}
                  multipliersDirty={multipliers.dirty}
                />
              );
            default:
              return (
                <ResourceGate resource={matrix} title="Puan matrisi">
                  {() => <MatrixTab resource={matrix} pointMultiplier={multipliers.baseline?.pointMultiplier ?? null} />}
                </ResourceGate>
              );
          }
        }}
      </SectionTabs>

      {active === 'matrix' && (
        <StudioSaveBar
          resource={matrix}
          title="Puan matrisi"
          validationErrors={matrixErrors}
          labelOf={matrixPathLabel}
          successMessage="Puan matrisi yayınlandı"
          loadImpact={(draft) => impactFor({ matrix: draft })}
        />
      )}
      {active === 'multipliers' && (
        <StudioSaveBar
          resource={multipliers}
          title="Platform çarpanları"
          validationErrors={multErrors}
          labelOf={multipliersPathLabel}
          successMessage="Çarpanlar yayınlandı"
          loadImpact={(draft) => impactFor({ multipliers: draft })}
        />
      )}
      {active === 'leagues' && (
        <StudioSaveBar
          resource={leagues}
          title="Lig eşikleri"
          validationErrors={leagueErrors}
          labelOf={leaguesPathLabel}
          successMessage="Lig ayarları yayınlandı"
          loadImpact={async (draft) => {
            const p = await api.previewLeagues(draft);
            return {
              items: [
                { label: 'Yükselen müşteri', value: fmtInt(p.promoted), emphasis: p.promoted > 0 },
                { label: 'Düşen müşteri', value: fmtInt(p.demoted), emphasis: p.demoted > 0 },
                { label: 'Değişmeyen', value: fmtInt(p.unchanged) },
              ],
              warning: p.demoted > 0 ? `${fmtInt(p.demoted)} müşterinin ligi düşecek; leaderboard'da anında görünür.` : undefined,
            };
          }}
        />
      )}
    </PanelPage>
  );
}
