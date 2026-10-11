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
import { relativeTr } from '@/lib/admin-command/core';
import { COMMAND_RANGES, type CommandRange, type KpiKey, type SectionResult } from '@/lib/admin-command/types';
import { useCommandHealth, useCommandOverview, useRefreshCommand } from './use-command';
import { PulseStrip } from './pulse-strip';
import { QueuePanel } from './queue-panel';
import { HEALTH_META, HealthPanel } from './health-panel';
import { EventsFeed } from './events-feed';
import { EcosystemCard, TopDealersCard } from './side-cards';
import { RANGE_LABEL, formatClock } from './format';

const KPI_META: Record<KpiKey, { label: string; icon: ReactNode; href: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'neutral' }> = {
  newUsers: { label: 'Yeni kullanıcı', icon: <UserPlus className="h-4 w-4" />, href: '/admin/users', tone: 'brand' },
  feedback: { label: 'Geri bildirim', icon: <MessageSquare className="h-4 w-4" />, href: '/admin/feedbacks', tone: 'info' },
  csat: { label: 'Memnuniyet (CSAT)', icon: <Smile className="h-4 w-4" />, href: '/admin/analytics', tone: 'success' },
  consumptions: { label: 'Tüketim', icon: <ShoppingBag className="h-4 w-4" />, href: '/admin/analytics', tone: 'neutral' },
  pointsMinted: { label: 'Basılan puan', icon: <Coins className="h-4 w-4" />, href: '/admin/economy', tone: 'warning' },
  activeDealers: { label: 'Aktif bayi', icon: <Store className="h-4 w-4" />, href: '/admin/dealers-health', tone: 'brand' },
};

const RANGE_OPTIONS = COMMAND_RANGES.map((r) => ({ value: r, label: r === '24h' ? '24 sa' : r === '7d' ? '7 gün' : '30 gün', textLabel: RANGE_LABEL[r] }));

/** "x önce" etiketi kendi başına yenilenir; bütün ağaç her saniye render edilmez (admin B13). */
function Ago({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={formatClock(iso)}>
      {relativeTr(iso)}
    </time>
  );
}

function Section<T>({ result, onRetry, children }: { result: SectionResult<T>; onRetry: () => void; children: (data: T) => ReactNode }) {
  if (!result.ok) return <ErrorState variant="section" description={result.error} onRetry={onRetry} headingLevel="h3" />;
  return <>{children(result.data)}</>;
}

export function CommandScreen({ initialRange }: { initialRange: CommandRange }) {
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
      toast.error(e instanceof Error ? e.message : 'Yenileme başarısız oldu.');
    } finally {
      setRefreshing(false);
    }
  };

  const data = overview.data;
  const retryOverview = () => void overview.refetch();
  const healthMeta = health.data ? HEALTH_META[health.data.overall] : null;

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          variant="compact"
          eyebrow="Genel bakış"
          title="Komuta Merkezi"
          description="Bir şey yanıyor mu, ne değişti, bugün neyi ele almalı: platform sağlığı, kuyruklar ve son olaylar tek ekranda."
          meta={
            <span className="inline-flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              {healthMeta ? <StatusBadge label={`Platform: ${healthMeta.label}`} tone={healthMeta.tone} size="sm" /> : null}
              {data ? (
                <span>
                  Veri <Ago iso={data.generatedAt} /> hesaplandı{overview.isFetching ? ' · güncelleniyor…' : ''}
                </span>
              ) : null}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ChoiceChips aria-label="Dönem" size="sm" options={RANGE_OPTIONS} value={range} onChange={(v) => v && changeRange(v)} />
              <Button variant="outline" size="sm" className="min-h-[44px] gap-1.5" onClick={() => void onRefresh()} disabled={refreshing} aria-busy={refreshing}>
                <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4'} aria-hidden />
                Yenile
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
            <SectionCard title="Kuyruklar" description="İnsan kararı bekleyen işler; her satır ilgili kuyruğa gider." icon={<ListChecks className="h-4 w-4" />}>
              <Section result={data.queues} onRetry={retryOverview}>
                {(q) => <QueuePanel data={q} />}
              </Section>
            </SectionCard>

            <section aria-labelledby="kpi-heading" className="space-y-2">
              <h2 id="kpi-heading" className="text-sm font-semibold text-fg">
                {RANGE_LABEL[range]} · metrikler
              </h2>
              <Section result={data.kpis} onRetry={retryOverview}>
                {(k) => (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                    {k.kpis.map((e) => (
                      <MetricTile
                        key={e.key}
                        label={KPI_META[e.key].label}
                        icon={KPI_META[e.key].icon}
                        tone={KPI_META[e.key].tone}
                        href={KPI_META[e.key].href}
                        metric={e.metric}
                        hint={e.footnote ?? undefined}
                        sparklineLabel={`${KPI_META[e.key].label} eğilimi, ${RANGE_LABEL[range].toLocaleLowerCase('tr-TR')}`}
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
                title="Platform nabzı"
                description={`${RANGE_LABEL[range]} · ${data.window.unit === 'hour' ? 'saatlik' : 'günlük'} kovalar, İstanbul saati`}
                icon={<Activity className="h-4 w-4" />}
              >
                <Section result={data.kpis} onRetry={retryOverview}>
                  {(k) => <PulseStrip keys={data.window.keys} unit={data.window.unit} series={k.pulse} />}
                </Section>
              </SectionCard>
              <SectionCard title="Platform sağlığı" description="30 sn'de bir yoklanır (sekme açıkken)." icon={<HeartPulse className="h-4 w-4" />}>
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
              <SectionCard className="lg:col-span-2" title="Son olaylar" description="Denetim kayıtları, insan diliyle." icon={<Activity className="h-4 w-4" />}>
                <EventsFeed />
              </SectionCard>
              <div className="space-y-4">
                <SectionCard title="Ekosistem" description="Kayıtlı hesapların rol dağılımı." icon={<Users className="h-4 w-4" />}>
                  <Section result={data.ecosystem} onRetry={retryOverview}>
                    {(e) => <EcosystemCard data={e} />}
                  </Section>
                </SectionCard>
                <SectionCard title="En çok geri bildirim alan bayiler" description={`${RANGE_LABEL[range]} · QR + tüketim yorumu`} icon={<Store className="h-4 w-4" />}>
                  <Section result={data.topDealers} onRetry={retryOverview}>
                    {(t) => <TopDealersCard data={t} rangeLabel={RANGE_LABEL[range].toLocaleLowerCase('tr-TR')} />}
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
