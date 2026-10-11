'use client';

import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, Cpu, FileText, History, MessageSquareQuote, RefreshCw, Store, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { ErrorState, SkeletonDetail } from '@/components/states';
import type { LearningState, ModelsState, PromptsState, StudioOverview, StudioTab, TonesState } from '@/lib/ai-studio/contract';
import { errorText, fetchOverview, studioKeys } from './api';
import type { DealersInitial } from './dealers-tab';
import { fmtNumber, percent } from './format';
import { usePromptStudioCopy } from './copy';

const loading = () => <SkeletonDetail />;
const PromptsTab = dynamic(() => import('./prompts-tab'), { loading });
const LearningTab = dynamic(() => import('./learning-tab'), { loading });
const TonesTab = dynamic(() => import('./tones-tab'), { loading });
const DealersTab = dynamic(() => import('./dealers-tab'), { loading });
const ModelsTab = dynamic(() => import('./models-tab'), { loading });
const HistoryTab = dynamic(() => import('./history-tab'), { ssr: false, loading });

export type StudioInitial = {
  tab: StudioTab;
  overview: StudioOverview | null;
  prompts?: PromptsState | null;
  learning?: LearningState | null;
  tones?: TonesState | null;
  dealers?: DealersInitial;
  models?: ModelsState | null;
};

/**
 * Prompt ve Model Stüdyosu (/admin/ai/studio) — eski /admin/ai-learning, /admin/ai-settings ve
 * /admin/modules/ai-tones tek yönetişim modelinde: temel prompt kodda sabit; notlar, öğrenilen kurallar,
 * üsluplar, bayi politikası ve model seçimi gerekçeli, sürüm kontrollü ve denetimli.
 */
export function StudioCenter({ initial }: { initial: StudioInitial }) {
  const fz = usePromptStudioCopy().fx;
  const uy = usePromptStudioCopy().ui2;
  const ux = usePromptStudioCopy().ui;
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: studioKeys.overview(), queryFn: fetchOverview, initialData: initial.overview ?? undefined, staleTime: 30_000 });
  const o = overview.data;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={ux.promptVeModelStudyosu}
          description={ux.aiInHangiTalimatlarla}
          icon={<Wand2 />}
          actions={
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: studioKeys.all })}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {uy.yenile}
            </Button>
          }
        />
      }
    >
      {overview.isError && !o ? (
        <ErrorState title={ux.studyoGostergeleriYuklenemedi} description={errorText(overview.error)} onRetry={() => overview.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label={ux.bayi}
            metric={{ value: o?.dealers ?? null }}
            hint={o ? fz.dealersAiOff(fmtNumber(o.aiOff), fmtNumber(o.customPrompts)) : undefined}
            icon={<Store />}
            loading={!o}
            href="?tab=bayiler"
          />
          <MetricTile
            label={ux.ogrenmeProfili}
            metric={{ value: o?.profiles ?? null }}
            hint={o ? (o.pendingProposal ? ux.onayBekleyenSistemOnerisi : ux.bekleyenSistemOnerisiYok) : undefined}
            tone={o?.pendingProposal ? 'warning' : undefined}
            icon={<BrainCircuit />}
            loading={!o}
            href="?tab=ogrenme"
          />
          <MetricTile label={ux.aktifUslup} metric={{ value: o?.activeTones ?? null }} hint={ux.bayiKuralSecicisindeGorunen} icon={<MessageSquareQuote />} loading={!o} href="?tab=usluplar" />
          <MetricTile
            label={ux.aiCagrisi7Gun}
            metric={{ value: o?.calls7d ?? null }}
            hint={o ? fz.failures(fmtNumber(o.failures7d), percent(o.failures7d, o.calls7d), o.provider === 'none' ? fz.noProvider : o.provider === 'groq' ? 'Groq' : 'OpenAI') : undefined}
            tone={o && o.provider === 'none' ? 'danger' : undefined}
            icon={<Cpu />}
            loading={!o}
            href="?tab=modeller"
          />
        </MetricGrid>
      )}

      <SectionTabs
        ariaLabel={ux.studyoBolumleri}
        defaultValue="promptlar"
        resetKeys={['bayi', 'page', 'size', 'q', 'durum']}
        tabs={[
          { value: 'promptlar', label: ux.promptlar, icon: <FileText /> },
          { value: 'ogrenme', label: ux.ogrenilenKurallar, icon: <BrainCircuit />, count: o?.pendingProposal ? 1 : undefined },
          { value: 'usluplar', label: ux.usluplar, icon: <MessageSquareQuote /> },
          { value: 'bayiler', label: ux.bayiler, icon: <Store /> },
          { value: 'modeller', label: ux.modeller, icon: <Cpu /> },
          { value: 'gecmis', label: ux.gecmis, icon: <History /> },
        ]}
      >
        {(tab) =>
          tab === 'ogrenme' ? (
            <LearningTab initial={initial.learning} />
          ) : tab === 'usluplar' ? (
            <TonesTab initial={initial.tones} />
          ) : tab === 'bayiler' ? (
            <DealersTab initial={initial.dealers} />
          ) : tab === 'modeller' ? (
            <ModelsTab initial={initial.models} />
          ) : tab === 'gecmis' ? (
            <HistoryTab />
          ) : (
            <PromptsTab initial={initial.prompts} />
          )
        }
      </SectionTabs>
    </PanelPage>
  );
}
