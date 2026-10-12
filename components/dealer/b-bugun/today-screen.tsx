'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarRange, LayoutDashboard, QrCode, RefreshCw, ScanLine, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/states';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { IconButton } from '@/components/ds/a11y';
import { TODAY_LINKS } from '@/lib/dealer-today/core';
import type { DealerTodayData, Greeting } from '@/lib/dealer-today/types';
import { useTodayCopy } from './copy';
import { useDealerToday, useRefreshToday } from './use-today';
import { TodaySkeleton } from './today-skeleton';
import { SetupCard } from './setup-card';
import { MetricsRow } from './metrics-row';
import { NextActions, WaitingList } from './attention';
import { Todos } from './todos';
import { OpsSummary } from './ops-summary';

// Haftalık rapor ayrı parça: yalnız sekme açılınca yüklenir (istemci adası küçük kalsın).
const WeeklyReportPanel = dynamic(() => import('./weekly-report'), {
  ssr: false,
  loading: () => <TodaySkeleton compact />,
});

type Tab = 'today' | 'weekly';

/** Sorgu dizgisini sunucu turu olmadan günceller (Next, history API'yi useSearchParams ile eşler). */
function replaceQuery(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Bayi "Bugün" istemci adası. İlk veri SSR'dan (HydrationBoundary) gelir. Sakin operasyon
 * kokpiti (ops kaydı): sonsuz animasyon yok, tek sayfa girişi, sayılar deterministik.
 * Hata asla "sıfır" ya da "boş" görünmez (QueryState).
 */
export function TodayScreen() {
  const { copy } = useTodayCopy();
  const query = useDealerToday();
  return (
    <PanelPage register="ops" aria-label={copy.pageTitle}>
      <QueryState
        query={query}
        skeleton={<TodaySkeleton />}
        error={{ title: copy.errorTitle, description: copy.errorDesc }}
        isEmpty={() => false}
        loadingLabel={copy.pageTitle}
      >
        {(data) => <TodayContent data={data} />}
      </QueryState>
    </PanelPage>
  );
}

function TodayContent({ data }: { data: DealerTodayData }) {
  const { copy } = useTodayCopy();
  const params = useSearchParams();
  const refresh = useRefreshToday();
  const [refreshing, setRefreshing] = useState(false);
  const tab: Tab = params?.get('tab') === 'weekly' ? 'weekly' : 'today';
  const week = params?.get('week') ?? null;
  const now = new Date(data.generatedAt);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      toast.error(copy.errorTitle);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, copy.errorTitle]);

  const setTab = (next: string) => replaceQuery({ tab: next === 'weekly' ? 'weekly' : null, week: next === 'weekly' ? week : null });
  const setWeek = (next: string | null) => replaceQuery({ tab: 'weekly', week: next });

  return (
    <div className="space-y-5">
      <TodayHeader
        heading={{ name: data.dealer.name, greeting: data.greeting, generatedAt: data.generatedAt }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      <SetupCard setup={data.setup} />

      <SectionTabs
        value={tab}
        onValueChange={setTab}
        ariaLabel={copy.tabs.aria}
        touchTarget
        tabs={[
          { value: 'today', label: copy.tabs.today, icon: <LayoutDashboard aria-hidden className="h-4 w-4" /> },
          { value: 'weekly', label: copy.tabs.weekly, icon: <CalendarRange aria-hidden className="h-4 w-4" /> },
        ]}
        contentClassName="pt-4"
      >
        {(active) =>
          active === 'weekly' ? (
            <WeeklyReportPanel week={week ?? data.latestCompletedWeek} onWeekChange={setWeek} />
          ) : (
            <div className="space-y-4">
              <MetricsRow metrics={data.metrics} />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="min-w-0 space-y-4 lg:col-span-2">
                  <NextActions actions={data.nextActions} />
                  <WaitingList waiting={data.waiting} now={now} />
                </div>
                <div className="min-w-0">
                  <Todos todos={data.todos} />
                </div>
              </div>
              <OpsSummary ops={data.ops} />
            </div>
          )
        }
      </SectionTabs>
    </div>
  );
}

/** Başlığın ihtiyaç duyduğu, ağır Bugün verisinden önce sunucuda bilinen alanlar. */
export interface TodayHeading {
  name: string | null;
  greeting: Greeting;
  generatedAt: string;
}

/**
 * Selamlama başlığı (sayfanın LCP öğesi). Veri gelmeden de çizilebilir: `onRefresh` yoksa
 * bekleme durumundadır (yenile düğmesi yükleniyor, "yenileniyor" etiketi).
 */
function TodayHeader({ heading, refreshing = false, onRefresh }: { heading: TodayHeading; refreshing?: boolean; onRefresh?: () => void }) {
  const { copy, tag } = useTodayCopy();
  const pending = !onRefresh;
  const now = new Date(heading.generatedAt);
  const dateLabel = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' }).format(now);
  const timeLabel = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(now);
  return (
    <PageHeader
      variant="hero"
      eyebrow={copy.eyebrow}
      icon={<Store />}
      title={`${copy.greeting[heading.greeting]}, ${heading.name ?? copy.fallbackName}`}
      description={dateLabel}
      meta={
        <span className="inline-flex items-center gap-1 text-xs text-fg-muted" aria-live="polite">
          {pending || refreshing ? copy.refreshing : copy.updatedAt(timeLabel)}
        </span>
      }
      actions={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button asChild className="flex-1 shadow-none sm:flex-none">
            <Link href={TODAY_LINKS.scan} prefetch={false}>
              <ScanLine aria-hidden className="h-4 w-4" />
              {copy.scan}
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 shadow-none sm:flex-none">
            <Link href={TODAY_LINKS.qrCodes} prefetch={false}>
              <QrCode aria-hidden className="h-4 w-4" />
              {copy.newQr}
            </Link>
          </Button>
          <IconButton aria-label={copy.refresh} icon={<RefreshCw />} variant="outline" tooltip loading={pending || refreshing} onClick={onRefresh} />
        </div>
      }
    />
  );
}

/**
 * Bugün verisi sunucuda yüklenirken akışla önce giden kabuk: gerçek selamlama başlığı (bayi adı +
 * İstanbul saatine göre selam) + iskelet. Başlık, ağır veri turunu beklemeden boyanır (LCP);
 * veri gelince Suspense bu kabuğu aynı başlıklı gerçek ekranla değiştirir.
 */
export function TodayPending({ heading }: { heading: TodayHeading }) {
  const { copy } = useTodayCopy();
  return (
    <PanelPage register="ops" aria-label={copy.pageTitle} aria-busy>
      <div className="space-y-5">
        <TodayHeader heading={heading} />
        <TodaySkeleton compact />
      </div>
    </PanelPage>
  );
}
