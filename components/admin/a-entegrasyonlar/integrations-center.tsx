'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Cable, Briefcase, KeyRound, ListTree, Plug, RefreshCw, Send, Webhook as WebhookIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState, SkeletonTable, TONE_CALLOUT } from '@/components/states';
import type { ApiKeyItem, IntegrationsOverview, Paged, PartnerItem, WebhookItem } from '@/lib/integrations/contract';
import { cn } from '@/lib/utils';
import { fetchOverview, intKeys } from './api';
import { fmtAbs, fmtNum } from './format';
import { KeysTab } from './keys-tab';
import { WebhooksTab } from './webhooks-tab';
import { PartnersTab } from './partners-tab';

const CatalogTab = dynamic(() => import('./catalog-tab').then((m) => m.CatalogTab), { loading: () => <SkeletonTable /> });
const DocsTab = dynamic(() => import('./docs-tab').then((m) => m.DocsTab), { loading: () => <SkeletonTable /> });

export type IntegrationsInitial = {
  overview: IntegrationsOverview | null;
  keys: { qs: string; page: Paged<ApiKeyItem> } | null;
  webhooks: { qs: string; items: WebhookItem[] } | null;
  partners: { qs: string; items: PartnerItem[] } | null;
};

const RESET_KEYS = ['create', 'partner', 'key', 'webhook', 'partnerId', 'kq', 'kstatus', 'kpage', 'ksize', 'wq', 'wstatus', 'pq', 'pstatus', 'ptype', 'cq', 'cdomain', 'cmethod', 'cauth', 'page', 'size'];

/**
 * Entegrasyon Merkezi — API anahtarları, webhook'lar, partnerler, admin API kataloğu ve
 * partner dokümantasyonu tek yerde. ops kaydı: sakin, yoğun; 3B ve sürekli animasyon yok.
 */
export function IntegrationsCenter({ initial }: { initial: IntegrationsInitial }) {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: intKeys.overview(),
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
          title="Entegrasyonlar"
          description="Dış sistemlerin Qratex'e erişimi (API anahtarları, partnerler) ve Qratex'ten giden olaylar (webhook'lar) — tek merkezden, denetim kaydıyla."
          icon={<Plug />}
          actions={
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => void qc.invalidateQueries({ queryKey: intKeys.all })} disabled={overview.isFetching}>
              <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'motion-safe:animate-spin')} aria-hidden />
              Yenile
            </Button>
          }
        />
      }
    >
      <QueryState query={overview} skeleton="stats" onRetry={() => overview.refetch()}>
        {(data) => <OverviewBlock data={data} />}
      </QueryState>

      <SectionTabs
        ariaLabel="Entegrasyon bölümleri"
        defaultValue="anahtarlar"
        resetKeys={RESET_KEYS}
        tabs={[
          { value: 'anahtarlar', label: 'API anahtarları', icon: <KeyRound />, count: o?.keys.active },
          { value: 'webhooklar', label: "Webhook'lar", icon: <WebhookIcon />, count: o?.webhooks.active },
          { value: 'partnerler', label: 'Partnerler', icon: <Briefcase />, count: o?.partners.active },
          { value: 'katalog', label: 'API kataloğu', icon: <ListTree /> },
          { value: 'dokumantasyon', label: 'Dokümantasyon', icon: <BookOpen /> },
        ]}
      >
        {(t) => (
          <PanelErrorBoundary resetKeys={[t]}>
            {t === 'webhooklar' ? (
              <WebhooksTab initial={initial.webhooks} />
            ) : t === 'partnerler' ? (
              <PartnersTab initial={initial.partners} />
            ) : t === 'katalog' ? (
              <CatalogTab />
            ) : t === 'dokumantasyon' ? (
              <DocsTab />
            ) : (
              <KeysTab initial={initial.keys} />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}

function OverviewBlock({ data: o }: { data: IntegrationsOverview }) {
  const apiTone = !o.externalApi.enabled ? 'danger' : o.keys.scopeless > 0 || !o.externalApi.digestEnabled ? 'warning' : 'success';
  const rate = o.webhooks.successRate24h;
  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className={cn('flex flex-col gap-2 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', TONE_CALLOUT[apiTone])}>
        <p className="flex items-start gap-2 font-medium">
          <Cable className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Dış API: {o.externalApi.enabled ? 'açık' : 'KAPALI — tüm partner istekleri 503 alıyor'}
            {o.externalApi.enabled && !o.externalApi.digestEnabled ? ' · bayi özeti ucu kapalı (İnovasyon ayarı)' : ''}
            {o.keys.scopeless > 0 ? ` · ${fmtNum(o.keys.scopeless)} kapsamsız eski anahtar korumalı uçlarda çalışmıyor` : ''}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-3 text-xs">
          <Link href="/admin/modules" className="underline underline-offset-2 hover:no-underline">
            Dış API anahtarını yönet
          </Link>
          <span className="text-fg-muted">
            Veri: <time dateTime={o.generatedAt}>{fmtAbs(o.generatedAt)}</time>
          </span>
        </p>
      </div>

      <MetricGrid cols={4}>
        <MetricTile
          label="Etkin API anahtarı"
          icon={<KeyRound />}
          metric={{ value: o.keys.active }}
          hint={`7 günde kullanılan ${fmtNum(o.keys.used7d)} · 90+ gün atıl ${fmtNum(o.keys.idle90d)}`}
          tone={o.keys.idle90d > 0 ? 'warning' : 'neutral'}
          href="/admin/integrations?tab=anahtarlar"
          animate
        />
        <MetricTile
          label="30 günde süresi dolacak"
          icon={<KeyRound />}
          metric={{ value: o.keys.expiring30d }}
          hint="Kesintisiz geçiş için “Döndür” kullanın"
          tone={o.keys.expiring30d > 0 ? 'warning' : 'neutral'}
          animate
        />
        <MetricTile
          label="Webhook teslimi (24 sa)"
          icon={<Send />}
          metric={{ value: o.webhooks.deliveries24h, series: o.webhooks.series7d }}
          sparklineLabel={`Son 7 günde günlük teslim; bugün ${fmtNum(o.webhooks.series7d.at(-1) ?? 0)}`}
          hint={rate === null ? 'Son 24 saatte teslim yok' : `Başarı %${String(rate).replace('.', ',')} · başarısız ${fmtNum(o.webhooks.failed24h)}`}
          tone={o.webhooks.failed24h > 0 ? (rate !== null && rate < 80 ? 'danger' : 'warning') : 'neutral'}
          href="/admin/integrations?tab=webhooklar"
          animate
        />
        <MetricTile
          label="Etkin partner"
          icon={<Briefcase />}
          metric={{ value: o.partners.active }}
          hint={`Pasif ${fmtNum(o.partners.inactive)} · etkin webhook ${fmtNum(o.webhooks.active)}, duraklatılan ${fmtNum(o.webhooks.paused)}`}
          href="/admin/integrations?tab=partnerler"
          animate
        />
      </MetricGrid>
    </div>
  );
}
