'use client';

/**
 * Admin › Komuta Merkezi — istemci adası. İlk veri SSR'dan (HydrationBoundary) gelir;
 * bu ada yalnız dönem seçimi, tazeleme ve etkileşimi yönetir.
 *
 * Bilgi sırası (rapor vizyonu): 1) dikkat/kuyruklar → 2) KPI şeridi → 3) nabız şeridi +
 * sağlık → 4) son olaylar + ekosistem + bayi sıralaması. Hızlı erişim ızgaraları kaldırıldı
 * (sidebar + ⌘K yeterli). ops kaydı: düz yüzey, sonsuz animasyon yok.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, HeartPulse, ListChecks, RefreshCw, Store, Users, MessageSquare, Smile, ShoppingBag, Coins, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader, SectionCard, PageGrid } from '@/components/ds/page';
import { MetricTile } from '@/components/ds/data/metric-tile';
import { StatusBadge } from '@/components/ds/data/status-badge';
import { ChoiceChips } from '@/components/ds/a11y/choice-chips';
import { ErrorState, QueryState, SkeletonBlock, SkeletonStats } from '@/components/states';
import { COMMAND_RANGES, type CommandRange, type KpiKey, type SectionResult } from '@/lib/admin-command/types';
import { useCommandHealth, useCommandOverview, useRefreshCommand } from './use-command';
import { PulseStrip } from './pulse-strip';
import { QueuePanel } from './queue-panel';
import { HEALTH_META, HealthPanel } from './health-panel';
import { EventsFeed } from './events-feed';
import { EcosystemCard, TopDealersCard } from './side-cards';
import { formatClock } from './format';
import { relativeFor, useAdminKomutaCopy, useServerLabel } from './copy';

const KPI_META: Record<KpiKey, { icon: ReactNode; href: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'neutral' }> = {
  newUsers: { icon: <UserPlus className="h-4 w-4" />, href: '/admin/users', tone: 'brand' },
  feedback: { icon: <MessageSquare className="h-4 w-4" />, href: '/admin/feedbacks', tone: 'info' },
  csat: { icon: <Smile className="h-4 w-4" />, href: '/admin/analytics', tone: 'success' },
  consumptions: { icon: <ShoppingBag className="h-4 w-4" />, href: '/admin/analytics', tone: 'neutral' },
  pointsMinted: { icon: <Coins className="h-4 w-4" />, href: '/admin/economy', tone: 'warning' },
  activeDealers: { icon: <Store className="h-4 w-4" />, href: '/admin/dealers-health', tone: 'brand' },
};


/** "x önce" etiketi kendi başına yenilenir; bütün ağaç her saniye render edilmez (admin B13). */
function Ago({ iso }: { iso: string }) {
  const c = useAdminKomutaCopy();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={formatClock(iso)}>
      {relativeFor(iso, c.locale)}
    </time>
  );
}

function Section<T>({ result, onRetry, children }: { result: SectionResult<T>; onRetry: () => void; children: (data: T) => ReactNode }) {
  if (!result.ok) return <ErrorState variant="section" description={result.error} onRetry={onRetry} headingLevel="h3" />;
  return <>{children(result.data)}</>;
}

export function CommandScreen({ initialRange }: { initialRange: CommandRange }) {
  const c = useAdminKomutaCopy();
  const sl = useServerLabel();
  const RANGE_LABEL = c.rangeLabel;
  const RANGE_OPTIONS = COMMAND_RANGES.map((r) => ({ value: r, label: c.rangeShort[r], textLabel: c.rangeLabel[r] }));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<CommandRange>(initialRange);
  const overview = useCommandOverview(range);
  const health = useCommandHealth();
  const refresh = useRefreshCommand(range);
  const [refreshing, setRefreshing] = useState(false);

  const changeRange = (next: CommandRange) => {
    setRange(next);
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === '7d') sp.delete('range');
    else sp.set('range', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : c.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const data = overview.data;
  const retryOverview = () => void overview.refetch();
  const healthMeta = health.data ? { ...HEALTH_META[health.data.overall], label: c.healthStatus[health.data.overall] } : null;

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          variant="compact"
          eyebrow={c.eyebrow}
          title={c.title}
          description={c.description}
          meta={
            <span className="inline-flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              {healthMeta ? <StatusBadge label={`${c.platform}: ${healthMeta.label}`} tone={healthMeta.tone} size="sm" /> : null}
              {data ? (
                <span>
                  {c.computedPrefix} <Ago iso={data.generatedAt} />{c.computedSuffix ? ` ${c.computedSuffix}` : ''}{overview.isFetching ? c.updating : ''}
                </span>
              ) : null}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ChoiceChips aria-label={c.period} size="sm" options={RANGE_OPTIONS} value={range} onChange={(v) => v && changeRange(v)} />
              <Button variant="outline" size="sm" className="min-h-[44px] gap-1.5" onClick={() => void onRefresh()} disabled={refreshing} aria-busy={refreshing}>
                <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4'} aria-hidden />
                {c.refresh}
              </Button>
            </div>
          }
        />
      }
    >
      <QueryState
        query={{ data, error: overview.error, isLoading: overview.isLoading, isFetching: overview.isFetching, refetch: overview.refetch }}
        skeleton={
          <div className="space-y-4">
            <SkeletonStats />
            <SkeletonBlock />
          </div>
        }
        onRetry={retryOverview}
      >
        {data ? (
          <div className="space-y-4">
            <SectionCard title={c.queues} description={c.queuesDesc} icon={<ListChecks className="h-4 w-4" />}>
              <Section result={data.queues} onRetry={retryOverview}>
                {(q) => <QueuePanel data={q} />}
              </Section>
            </SectionCard>

            <section aria-labelledby="kpi-heading" className="space-y-2">
              <h2 id="kpi-heading" className="text-sm font-semibold text-fg">
                {RANGE_LABEL[range]} · {c.metrics}
              </h2>
              <Section result={data.kpis} onRetry={retryOverview}>
                {(k) => (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                    {k.kpis.map((e) => (
                      <MetricTile
                        key={e.key}
                        label={c.kpi[e.key]}
                        icon={KPI_META[e.key].icon}
                        tone={KPI_META[e.key].tone}
                        href={KPI_META[e.key].href}
                        metric={e.metric}
                        hint={e.footnote ? sl.t('footnote', e.footnote, e.footnote) : undefined}
                        sparklineLabel={c.trend(c.kpi[e.key], RANGE_LABEL[range].toLocaleLowerCase(c.locale))}
                        size="compact"
                      />
                    ))}
                  </div>
                )}
              </Section>
            </section>

            <PageGrid cols={3}>
              <SectionCard
                className="lg:col-span-2"
                title={c.pulse}
                description={c.pulseDesc(RANGE_LABEL[range], data.window.unit === 'hour')}
                icon={<Activity className="h-4 w-4" />}
              >
                <Section result={data.kpis} onRetry={retryOverview}>
                  {(k) => <PulseStrip keys={data.window.keys} unit={data.window.unit} series={k.pulse} />}
                </Section>
              </SectionCard>
              <SectionCard title={c.health} description={c.healthDesc} icon={<HeartPulse className="h-4 w-4" />}>
                <QueryState
                  query={{ data: health.data, error: health.error, isLoading: health.isLoading, isFetching: health.isFetching, refetch: health.refetch }}
                  skeleton="list"
                  onRetry={() => void health.refetch()}
                >
                  {(h) => <HealthPanel data={h} />}
                </QueryState>
              </SectionCard>
            </PageGrid>

            <PageGrid cols={3}>
              <SectionCard className="lg:col-span-2" title={c.events} description={c.eventsDesc} icon={<Activity className="h-4 w-4" />}>
                <EventsFeed />
              </SectionCard>
              <div className="space-y-4">
                <SectionCard title={c.ecosystem} description={c.ecosystemDesc} icon={<Users className="h-4 w-4" />}>
                  <Section result={data.ecosystem} onRetry={retryOverview}>
                    {(e) => <EcosystemCard data={e} />}
                  </Section>
                </SectionCard>
                <SectionCard title={c.topDealers} description={c.topDealersDesc(RANGE_LABEL[range])} icon={<Store className="h-4 w-4" />}>
                  <Section result={data.topDealers} onRetry={retryOverview}>
                    {(t) => <TopDealersCard data={t} rangeLabel={RANGE_LABEL[range].toLocaleLowerCase(c.locale)} />}
                  </Section>
                </SectionCard>
              </div>
            </PageGrid>
          </div>
        ) : null}
      </QueryState>
    </PanelPage>
  );
}
