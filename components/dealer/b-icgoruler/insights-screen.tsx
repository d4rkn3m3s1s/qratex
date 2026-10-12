'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Bot, Layers, LayoutDashboard, Lightbulb, QrCode, RefreshCw, Settings2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionCard, SectionTabs } from '@/components/ds/page';
import { IconButton } from '@/components/ds/a11y';
import { serializeDateRange, type DateRangeValue } from '@/components/ds/page/date-range';
import {
  AI_SETTINGS_HREF,
  INSIGHTS_DEFAULT_COMPARE,
  INSIGHTS_DEFAULT_PRESET,
  assistantHref,
  inboxHref as buildInboxHref,
  parseInsightsSearch,
} from '@/lib/dealer-insights/params';
import type { InsightAlert, InsightsData } from '@/lib/dealer-insights/types';
import { formatDateTime, formatDay, useInsightsCopy } from './copy';
import { InsightsSkeleton } from './skeleton';
import { InsightsToolbar } from './insights-toolbar';
import { InsightsMetrics } from './metrics-grid';
import { NarrativeCard } from './narrative-card';
import { AlertsPanel } from './alerts-panel';
import { Recommendations } from './recommendations';
import type { RefHandlers } from './refs';
import { useInsights, useRefreshInsights, type EvidenceTarget } from './use-insights';

// İkincil sekmeler ve çekmece ayrı parça: açılış adası küçük kalsın.
const ThemesPanel = dynamic(() => import('./themes-panel').then((m) => m.ThemesPanel), {
  ssr: false,
  loading: () => <InsightsSkeleton />,
});
const SignalsPanel = dynamic(() => import('./signals-panel').then((m) => m.SignalsPanel), {
  ssr: false,
  loading: () => <InsightsSkeleton />,
});
const EvidenceSheet = dynamic(() => import('./evidence-sheet').then((m) => m.EvidenceSheet), { ssr: false });

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
 * İçgörüler istemci adası (`/dealer/analytics/insights`). İlk veri SSR'dan (HydrationBoundary).
 * Ops kaydı: sakin, yoğun; sonsuz animasyon yok; iskelet statik. Hata asla sıfır görünmez.
 * Bilgi mimarisi (rapor Bulgu 9): Özet (ölçülen metrikler + AI anlatısı + öneriler + uyarılar)
 * · Temalar (birleşik tema tablosu + varlıklar, kanıt çekmecesi) · Sinyaller (dağılımlar).
 */
export function InsightsScreen() {
  const { copy, locale, tag } = useInsightsCopy();
  const params = useSearchParams();
  const query = useMemo(() => parseInsightsSearch(params ?? new URLSearchParams()), [params]);
  const q = useInsights(query, locale);
  const refresh = useRefreshInsights(query, locale);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success(copy.page.refreshed);
    } catch {
      toast.error(copy.page.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, copy]);

  const onToolbarChange = useCallback((next: { range?: DateRangeValue; location?: string | null }) => {
    if (next.range) {
      replaceQuery(
        serializeDateRange(next.range, { defaultPreset: INSIGHTS_DEFAULT_PRESET, defaultCompare: INSIGHTS_DEFAULT_COMPARE })
      );
    }
    if (next.location !== undefined) replaceQuery({ location: next.location });
  }, []);

  const data = q.data;
  const meta = data ? (
    <span className="qx-caption text-fg-muted">
      {copy.page.sample(data.sample.total, formatDay(data.query.range.from, tag), formatDay(data.query.range.to, tag))} ·{' '}
      {copy.page.computedAt(formatDateTime(data.generatedAt, tag))}
    </span>
  ) : null;

  return (
    <PanelPage
      register="ops"
      aria-label={copy.page.title}
      header={
        <PageHeader
          title={copy.page.title}
          eyebrow={copy.page.eyebrow}
          description={copy.page.description}
          icon={<Lightbulb className="h-5 w-5" aria-hidden />}
          meta={meta}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <IconButton
                aria-label={refreshing ? copy.page.refreshing : copy.page.refresh}
                icon={<RefreshCw />}
                variant="outline"
                loading={refreshing}
                onClick={() => void onRefresh()}
                tooltip
              />
              <Button asChild variant="outline" className="min-h-11">
                <Link href={assistantHref()}>
                  <Bot className="mr-1.5 h-4 w-4" aria-hidden />
                  {copy.footer.askCta}
                </Link>
              </Button>
            </div>
          }
        />
      }
      toolbar={
        <InsightsToolbar
          query={query}
          locations={data?.locations ?? []}
          disabled={q.isFetching && !data}
          onChange={onToolbarChange}
        />
      }
    >
      <QueryState
        query={q}
        skeleton={<InsightsSkeleton />}
        error={{ title: copy.page.errorTitle, description: copy.page.errorDesc }}
        isEmpty={(d) => d.sample.total === 0}
        empty={
          <EmptyState
            icon={QrCode}
            title={copy.empty.title}
            description={copy.empty.desc}
            headingLevel="h2"
            action={
              <Button asChild className="min-h-11">
                <Link href="/dealer/qr-codes">{copy.empty.qr}</Link>
              </Button>
            }
            secondaryAction={
              query.preset !== 'last90' ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => replaceQuery({ period: 'last90', from: null, to: null })}>
                  {copy.empty.widen}
                </Button>
              ) : undefined
            }
          />
        }
        showRefreshing
        loadingLabel={copy.page.title}
      >
        {(d) => <InsightsBody data={d} lang={locale} onRefresh={onRefresh} />}
      </QueryState>
    </PanelPage>
  );
}

function InsightsBody({ data, lang, onRefresh }: { data: InsightsData; lang: 'tr' | 'en'; onRefresh: () => Promise<void> }) {
  const { copy } = useInsightsCopy();
  const [target, setTarget] = useState<EvidenceTarget | null>(null);

  const inboxHref = useCallback(
    (extra: Record<string, string> = {}) => buildInboxHref(data.query, extra),
    [data.query]
  );

  const handlers: RefHandlers = useMemo(
    () => ({
      openTheme: (key, label) => setTarget({ kind: 'theme', key, label }),
      openRec: (key, label) => setTarget({ kind: 'rec', key, label }),
      openEntity: (key, label) => setTarget({ kind: 'entity', key, label }),
      alertHref: (a: InsightAlert) => (a.target.kind === 'inbox' ? buildInboxHref(data.query, a.target.query) : null),
    }),
    [data.query]
  );

  return (
    <div className="space-y-5">
      {(data.sample.truncated || data.query.location || !data.canWrite) && (
        <div className="space-y-2">
          {data.sample.truncated && <InlineError variant="banner" tone="warning">{copy.page.truncated}</InlineError>}
          {data.query.location && <InlineError variant="banner" tone="info">{copy.page.locationNote}</InlineError>}
          {!data.canWrite && <InlineError variant="banner" tone="info">{copy.page.readOnly}</InlineError>}
        </div>
      )}

      <SectionTabs
        ariaLabel={copy.tabs.aria}
        touchTarget
        tabs={[
          { value: 'overview', label: copy.tabs.overview, icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
          { value: 'themes', label: copy.tabs.themes, icon: <Layers className="h-4 w-4" aria-hidden />, count: data.themes.length || undefined },
          { value: 'signals', label: copy.tabs.signals, icon: <Activity className="h-4 w-4" aria-hidden /> },
        ]}
      >
        {(tab) => (
          <PanelErrorBoundary resetKeys={[tab]}>
            {tab === 'themes' ? (
              <ThemesPanel data={data} handlers={handlers} />
            ) : tab === 'signals' ? (
              <SignalsPanel data={data} />
            ) : (
              <div className="space-y-5">
                <InsightsMetrics data={data} inboxHref={inboxHref} />
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="min-w-0 space-y-4 lg:col-span-2">
                    <NarrativeCard data={data} handlers={handlers} lang={lang} />
                    <Recommendations data={data} handlers={handlers} lang={lang} />
                  </div>
                  <div className="min-w-0 space-y-4">
                    <AlertsPanel data={data} handlers={handlers} />
                    <AskCard />
                  </div>
                </div>
              </div>
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>

      {target && <EvidenceSheet data={data} target={target} onClose={() => setTarget(null)} onChanged={() => void onRefresh()} />}
    </div>
  );
}

/** Sohbet tek yerde (AI Asistan); burada yalnız hazır sorularla geçiş. */
function AskCard() {
  const { copy } = useInsightsCopy();
  return (
    <SectionCard title={copy.footer.askTitle} description={copy.footer.askDesc} icon={<Bot className="h-4 w-4" aria-hidden />} density="compact">
      <ul className="space-y-2">
        {copy.footer.quick.map((question) => (
          <li key={question}>
            <Link
              href={assistantHref(question)}
              className="flex min-h-11 items-center rounded-control border border-subtle bg-surface-1 px-3 py-2 qx-small text-fg hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {question}
            </Link>
          </li>
        ))}
      </ul>
      {/* Öğrenme profili ve düzeltme geçmişi Ayarlar → AI'a taşındı (rapor Bulgu 9/10): tek bağlantı
          için ayrı kart yerine sakin bir alt satır. */}
      <p className="mt-4 border-t border-subtle pt-3 qx-caption text-fg-muted">
        {copy.footer.learnDesc}{' '}
        <Link
          href={AI_SETTINGS_HREF}
          className="inline-flex min-h-6 items-center gap-1 rounded-chip font-medium text-fg underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {copy.footer.learnCta}
        </Link>
      </p>
    </SectionCard>
  );
}
