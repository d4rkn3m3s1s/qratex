'use client';

/**
 * Admin Platform Analitiği — istemci adası. İlk sekme verisi SSR'dan (HydrationBoundary).
 *
 * Yerleşim (yeniden tasarım vizyonu): yapışkan süzgeç çubuğu (dönem + karşılaştırma, kaynak,
 * sektör, temiz veri — hepsi URL'de, paylaşılabilir) · başlıkta tazelik + Yenile + Dışa aktar ·
 * sekmeler (URL `?tab=`; mobilde yatay kayan etiketli çipler — B-12) · her sekme kendi ucu.
 * Süzgeç değişirken eski veri %60 opaklıkla kalır ve "Güncelleniyor…" duyurulur (B-8, B-11).
 */
import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilterBar, PageHeader, PageToolbar, PanelErrorBoundary, PanelPage, SectionTabs, formatDayRange, type FilterField } from '@/components/ds/page';
import { InlineError, QueryState, SkeletonStats, SkeletonTable } from '@/components/states';
import { cn } from '@/lib/utils';
import { PLACE_CATEGORIES } from '@/lib/places/categories';
import { ADMIN_ANALYTICS_MAX_DAYS, ADMIN_ANALYTICS_PRESETS, parseSection } from '@/lib/admin-analytics/params';
import { adminCsvFileName, cardsCsv, dealersCsv, overviewSeriesCsv, rootCauseCsv, sectorsCsv } from '@/lib/admin-analytics/csv';
import type { AdminAnalyticsQuery, AdminAnalyticsSection, SectionData } from '@/lib/admin-analytics/types';
import { localeTag, sectorLabel, topicLabel, useAdminAnalyticsCopy, useAdminAnalyticsLocale, type AdminAnalyticsCopy } from './copy';
import { ExportMenu, RefreshButton, UpdatedAt, type ExportItem } from './toolbar-actions';
import { useAdminQueryFromUrl, useFreshRefresh, usePrefetchSection, useSection } from './use-admin-analytics';
import { OverviewTab } from './overview-tab';
import { DealersTab } from './dealers-tab';
import { SectorsTab } from './sectors-tab';
import { RootCauseTab } from './root-cause-tab';
import { CardsTab } from './cards-tab';

function useFields(copy: AdminAnalyticsCopy, locale: 'tr' | 'en'): FilterField[] {
  return useMemo(
    () => [
      {
        type: 'dateRange',
        key: 'period',
        label: copy.period,
        defaultPreset: 'last30',
        defaultCompare: 'previous',
        presets: ADMIN_ANALYTICS_PRESETS,
        maxDays: ADMIN_ANALYTICS_MAX_DAYS,
      },
      {
        type: 'select',
        key: 'source',
        label: copy.source,
        allLabel: copy.sources.all,
        options: [
          { value: 'qr', label: copy.sources.qr },
          { value: 'consumption', label: copy.sources.consumption },
        ],
      },
      {
        type: 'select',
        key: 'sector',
        label: copy.sector,
        allLabel: copy.allSectors,
        options: [...PLACE_CATEGORIES.map((c) => ({ value: c.slug, label: c.label[locale] })), { value: 'none', label: copy.noSector }],
      },
      {
        type: 'select',
        key: 'clean',
        label: copy.data,
        allLabel: null,
        defaultValue: '1',
        options: [
          { value: '1', label: copy.cleanOn },
          { value: '0', label: copy.cleanOff },
        ],
      },
    ],
    [copy, locale],
  );
}

function exportItemsFor<S extends AdminAnalyticsSection>(section: S, data: SectionData[S] | undefined, copy: AdminAnalyticsCopy, locale: 'tr' | 'en'): ExportItem[] {
  if (!data) return [];
  const { from, to } = data.query.range;
  const sector = (s: string | null) => sectorLabel(s, locale);
  switch (section) {
    case 'overview': {
      const d = data as SectionData['overview'];
      return [
        {
          key: 'series',
          label: `${copy.trendTitle} (CSV)`,
          csv: () => ({
            fileName: adminCsvFileName('gunluk', from, to),
            content: overviewSeriesCsv(d, [copy.colDay, copy.colReviews, copy.colAvg, copy.colNegative, copy.colNewUsers, copy.colScans, copy.colCompareDay, copy.colCompare]),
          }),
        },
      ];
    }
    case 'dealers': {
      const d = data as SectionData['dealers'];
      return [
        {
          key: 'dealers',
          label: `${copy.dealersTitle} (CSV)`,
          csv: d.rows.length
            ? () => ({
                fileName: adminCsvFileName('bayiler', from, to),
                content: dealersCsv(
                  d,
                  [copy.colDealer, copy.colSector, copy.colN, copy.colAvg, copy.colBayes, copy.colPositive, copy.colNegativeShare, copy.colCompare, `${copy.colChange} %`, copy.colSegment, copy.colZ, copy.colStatus],
                  sector,
                  (s) => copy.status[s as keyof typeof copy.status] ?? s,
                ),
              })
            : null,
        },
      ];
    }
    case 'sectors': {
      const d = data as SectionData['sectors'];
      return [
        {
          key: 'sectors',
          label: `${copy.sectorsTitle} (CSV)`,
          csv: d.rows.length
            ? () => ({
                fileName: adminCsvFileName('sektorler', from, to),
                content: sectorsCsv(
                  d,
                  [copy.colSector, copy.colDealers, copy.colActiveDealers, copy.colN, copy.colAvg, copy.colDealerAvg, copy.colScans, copy.colCompare, `${copy.colChange} %`, copy.colAvgDelta, copy.colZ, copy.lowSample],
                  sector,
                ),
              })
            : null,
        },
      ];
    }
    case 'root-cause': {
      const d = data as SectionData['root-cause'];
      return [
        {
          key: 'topics',
          label: `${copy.rootTitle} (CSV)`,
          csv: d.topics.length
            ? () => ({
                fileName: adminCsvFileName('kok-neden', from, to),
                content: rootCauseCsv(
                  d,
                  [copy.colTopic, copy.colNegative, `${copy.colShare} %`, copy.colCompare, `${copy.colChange} %`, copy.dayParts.night, copy.dayParts.morning, copy.dayParts.afternoon, copy.dayParts.evening, copy.colTopDealers],
                  (k) => topicLabel(k, locale),
                ),
              })
            : null,
        },
      ];
    }
    case 'cards': {
      const d = data as SectionData['cards'];
      return [
        {
          key: 'cards',
          label: `${copy.cardsTitle} (CSV)`,
          csv: () => ({
            fileName: adminCsvFileName('kartlar', from, to),
            content: cardsCsv(d, ['', copy.cardsPeriod, copy.colCompare, copy.colChange, `${copy.colChange} %`], {
              activated: copy.cardsActivated,
              blocked: copy.cardsBlocked,
              consumptions: copy.cardsConsumptions,
              reviews: copy.cardsReviews,
              reviewRate: `${copy.cardsReviewRate} %`,
            }),
          }),
        },
      ];
    }
    default:
      return [];
  }
}

function SectionView({ section, q }: { section: AdminAnalyticsSection; q: AdminAnalyticsQuery }) {
  const query = useSection(section, q);
  const updating = query.isPlaceholderData || (query.isFetching && !query.isLoading);
  return (
    <div aria-busy={updating || undefined} className={cn('transition-opacity duration-base ease-standard motion-reduce:transition-none', updating && 'opacity-60')}>
      <QueryState query={query} skeleton={section === 'overview' || section === 'cards' ? <SkeletonStats /> : <SkeletonTable />} isEmpty={() => false}>
        {(d) => {
          switch (section) {
            case 'overview':
              return <OverviewTab data={d as SectionData['overview']} />;
            case 'dealers':
              return <DealersTab data={d as SectionData['dealers']} />;
            case 'sectors':
              return <SectorsTab data={d as SectionData['sectors']} />;
            case 'root-cause':
              return <RootCauseTab data={d as SectionData['root-cause']} />;
            case 'cards':
              return <CardsTab data={d as SectionData['cards']} />;
            default:
              return null;
          }
        }}
      </QueryState>
    </div>
  );
}

function Screen({ sectorsEnabled }: { sectorsEnabled: boolean }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const sp = useSearchParams();
  const q = useAdminQueryFromUrl();
  const requested = parseSection(sp?.get('tab'));
  const active: AdminAnalyticsSection = requested === 'sectors' && !sectorsEnabled ? 'overview' : requested;
  const fields = useFields(copy, locale);
  const activeQuery = useSection(active, q);
  const fresh = useFreshRefresh(active, q);
  const prefetch = usePrefetchSection(q);
  const updating = activeQuery.isPlaceholderData || (activeQuery.isFetching && !activeQuery.isLoading);
  const exportItems = useMemo(() => exportItemsFor(active, activeQuery.data, copy, locale), [active, activeQuery.data, copy, locale]);

  const sections: AdminAnalyticsSection[] = ['overview', 'dealers', ...(sectorsEnabled ? (['sectors'] as const) : []), 'root-cause', 'cards'];
  const tabs = sections.map((s) => ({
    value: s,
    label: (
      <span onPointerEnter={() => prefetch(s)} onFocus={() => prefetch(s)}>
        {copy.tabs[s]}
      </span>
    ),
  }));

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          title={copy.title}
          description={copy.description}
          meta={<UpdatedAt iso={activeQuery.data?.generatedAt} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <RefreshButton onRefresh={fresh.refresh} pending={fresh.pending} disabled={!activeQuery.data} />
              <ExportMenu items={exportItems} disabled={!activeQuery.data} />
            </div>
          }
        />
      }
      toolbar={
        <PageToolbar sticky ariaLabel={copy.filtersLabel} summary={updating ? copy.updating : formatDayRange(q.range, localeTag(locale))}>
          <FilterBar fields={fields} ariaLabel={copy.filtersLabel} />
        </PageToolbar>
      }
    >
      {fresh.error != null && (
        <InlineError variant="banner" onRetry={fresh.refresh}>
          {fresh.error instanceof Error && fresh.error.message ? fresh.error.message : copy.refreshFailed}
        </InlineError>
      )}
      <SectionTabs tabs={tabs} defaultValue="overview" ariaLabel={copy.tabsLabel} variant="pill" touchTarget>
        {(tab) => (
          <PanelErrorBoundary resetKeys={[tab]}>
            <SectionView section={parseSection(tab) === 'sectors' && !sectorsEnabled ? 'overview' : parseSection(tab)} q={q} />
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}

export function AdminAnalyticsScreen({ sectorsEnabled }: { sectorsEnabled: boolean }) {
  return (
    <Suspense fallback={<SkeletonStats />}>
      <Screen sectorsEnabled={sectorsEnabled} />
    </Suspense>
  );
}
