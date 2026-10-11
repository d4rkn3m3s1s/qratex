'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Brain, RefreshCw, LayoutDashboard, Activity, Inbox, Store, MessagesSquare, Bot, Eye, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { SkeletonCards } from '@/components/states';
import { AI_OPS_PERIODS, DEFAULT_AI_OPS_PERIOD, HEALTH_META, PERIOD_LABEL, periodSchema, type AiOpsPeriod, type BacklogSummary, type SignalsReport, type UsageReport } from '@/lib/admin-ai-ops/contract';
import { aiOpsKeys, errorText, fetchSignals, fetchUsage } from './api';
import { AiOpsContext, useAiOps, useBacklog, useUsage, type AiOpsCtx } from './hooks';
import { OverviewTab } from './overview-tab';
import { UsageTab } from './usage-tab';
import { BacklogTab } from './backlog-tab';
import { DealersTab } from './dealers-tab';
import { SignalsTab } from './signals-tab';
import { SignalSheet, type SignalPick } from './signal-sheet';
import { fmtAgo, fmtTime } from './parts';

// Asistan yalnız sekmesi açılınca yüklenir (sohbet kodu ilk boyamada yok).
const AssistantTab = dynamic(() => import('./assistant-tab'), { ssr: false, loading: () => <SkeletonCards /> });

export type AiOpsInitial = {
  period: AiOpsPeriod;
  usage: UsageReport | null;
  signals: SignalsReport | null;
  backlog: BacklogSummary | null;
};

/**
 * Admin → AI Operasyon Merkezi (/admin/ai). Eski /admin/ai-dashboard + /admin/ai-detailed'in yerine.
 * Sayfa açılışında LLM çağrısı yok; her sayı seçili döneme bağlı ve kaynağı belli.
 */
export function AiOpsCenter({ initial }: { initial: AiOpsInitial }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const period = periodSchema.parse(sp.get('period') ?? initial.period ?? DEFAULT_AI_OPS_PERIOD);
  const [pick, setPick] = useState<SignalPick>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value == null) next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, sp]
  );

  const ctx: AiOpsCtx = useMemo(
    () => ({
      period,
      initial,
      openSignal: (p) => setPick(p),
      goTab: (tab) => setParam('tab', tab),
    }),
    [period, initial, setParam]
  );

  return (
    <AiOpsContext.Provider value={ctx}>
      <PanelPage register="ops" header={<Header onPeriod={(p) => setParam('period', p === DEFAULT_AI_OPS_PERIOD ? null : p)} />}>
        <Tabs />
        <SignalSheet pick={pick} period={period} onClose={() => setPick(null)} />
      </PanelPage>
    </AiOpsContext.Provider>
  );
}

function Tabs() {
  const backlog = useBacklog();
  const pendingCount = backlog.data ? backlog.data.eligible + backlog.data.exhausted : undefined;
  return (
    <SectionTabs
      ariaLabel="AI operasyon bölümleri"
      resetKeys={['page']}
      tabs={[
        { value: 'genel', label: 'Genel bakış', icon: <LayoutDashboard />, content: <OverviewTab /> },
        { value: 'kullanim', label: 'Kullanım ve maliyet', icon: <Activity />, content: <UsageTab /> },
        { value: 'kuyruk', label: 'Kuyruk', icon: <Inbox />, count: pendingCount || undefined, content: <BacklogTab /> },
        { value: 'bayiler', label: 'Bayiler', icon: <Store />, content: <DealersTab /> },
        { value: 'sinyaller', label: 'Müşteri sesi', icon: <MessagesSquare />, content: <SignalsTab /> },
        { value: 'asistan', label: 'Asistan', icon: <Bot />, content: <AssistantTab /> },
      ]}
    />
  );
}

function Header({ onPeriod }: { onPeriod: (p: AiOpsPeriod) => void }) {
  const qc = useQueryClient();
  const { period } = useAiOps();
  const usage = useUsage();
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);

  // "x sn önce" metni canlı kalsın (yalnız metin; veri yeniden çekilmez).
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      // Önbelleği atlayarak taze hesapla; sonra diğer parçaları tazele.
      const [u, s] = await Promise.all([fetchUsage(period, true), fetchSignals(period, true)]);
      qc.setQueryData(aiOpsKeys.usage(period), u);
      qc.setQueryData(aiOpsKeys.signals(period), s);
      await qc.invalidateQueries({
        queryKey: aiOpsKeys.all,
        predicate: (q) => q.queryKey[1] !== 'usage' && q.queryKey[1] !== 'signals',
      });
      toast.success('Veriler güncellendi.');
    } catch (e) {
      toast.error(errorText(e, 'Veriler güncellenemedi.'));
    } finally {
      setRefreshing(false);
    }
  };

  const generatedAt = usage.data?.generatedAt;
  return (
    <PageHeader
      title="AI Operasyon"
      eyebrow="Yapay zekâ"
      description="AI motorunun sağlığı, maliyet ve kota, analiz kuyruğu, bayi bazlı AI durumu ve müşteri sesi tek yerde."
      icon={<Brain />}
      meta={
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {usage.data ? <StatusBadge size="sm" srPrefix="AI motoru" label={HEALTH_META[usage.data.health].label} tone={HEALTH_META[usage.data.health].tone} /> : null}
          {generatedAt ? (
            <span>
              Son hesaplama <time dateTime={generatedAt}>{fmtTime(generatedAt)}</time> ({fmtAgo(generatedAt)}) · en fazla 60 sn önbellek
            </span>
          ) : null}
          <span className="hidden sm:inline" aria-hidden>·</span>
          <Link href="/admin/ai/quality" className="inline-flex items-center gap-1 text-brand hover:underline">
            <Eye className="h-3.5 w-3.5" aria-hidden /> AI kalite
          </Link>
          <Link href="/admin/ai/studio" className="inline-flex items-center gap-1 text-brand hover:underline">
            <Wand2 className="h-3.5 w-3.5" aria-hidden /> Prompt stüdyosu
          </Link>
        </span>
      }
      actions={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ChoiceChips aria-label="Dönem" size="sm" scroll options={AI_OPS_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} value={period} onChange={(v) => v && onPeriod(v)} />
          <Button variant="outline" onClick={refresh} disabled={refreshing} className="min-h-[44px] sm:min-h-9">
            <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin motion-reduce:animate-none' : 'mr-2 h-4 w-4'} aria-hidden />
            {refreshing ? 'Yenileniyor…' : 'Yenile'}
          </Button>
        </div>
      }
    />
  );
}
