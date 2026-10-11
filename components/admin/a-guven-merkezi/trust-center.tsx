'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, BellRing, FileLock2, Gavel, Radar, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Sliders, UserX, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage, PanelErrorBoundary, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState, TONE_CALLOUT } from '@/components/states';
import type { AlertItem, CaseListItem, Paged, TrustOverview } from '@/lib/admin-trust/contract';
import { cn } from '@/lib/utils';
import { errorText, fetchOverview, runScan, trustKeys } from './api';
import { fmtNum, fmtRel, fmtAbs } from './format';
import { CasesTab } from './cases-tab';
import { AlertsTab } from './alerts-tab';
import { RulesTab } from './rules-tab';
import { AuditTab } from './audit-tab';

export type TrustInitial = {
  overview: TrustOverview | null;
  cases: { qs: string; page: Paged<CaseListItem> } | null;
  alerts: { qs: string; page: Paged<AlertItem> } | null;
};

const RESET_KEYS = ['page', 'size', 'sort', 'status', 'severity', 'type', 'window', 'q', 'case', 'astatus', 'apage', 'asize', 'hwindow', 'hpage'];

/**
 * Güven Merkezi — Trust & Safety iş kuyruğu. ops kaydı: sakin, yoğun; 3B ve sonsuz animasyon yok.
 * Kritik veri sunucuda ön yüklenir; KPI'lar 60 sn'de bir tazelenir (canlı ama sahte değil).
 */
export function TrustCenter({ initial }: { initial: TrustInitial }) {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: trustKeys.overview(),
    queryFn: ({ signal }) => fetchOverview(signal),
    initialData: initial.overview ?? undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const scan = useMutation({
    mutationFn: runScan,
    onSuccess: (s) => {
      toast.success(s.created > 0 ? `${fmtNum(s.created)} yeni vaka açıldı.` : 'Tarama tamamlandı; yeni sinyal yok.');
      void qc.invalidateQueries({ queryKey: trustKeys.all });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const o = overview.data;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Güven Merkezi"
          description="Sahtekârlık sinyalleri, güvenlik uyarıları ve hassas işlemler tek kuyrukta: incele, karar ver, kayda geçsin."
          icon={<ShieldCheck />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 sm:min-h-10" onClick={() => scan.mutate()} disabled={scan.isPending} aria-busy={scan.isPending}>
                <Radar className={cn('h-4 w-4', scan.isPending && 'motion-safe:animate-spin')} aria-hidden />
                {scan.isPending ? 'Taranıyor…' : 'Sinyalleri tara'}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 sm:min-h-10"
                onClick={() => void qc.invalidateQueries({ queryKey: trustKeys.all })}
                disabled={overview.isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'motion-safe:animate-spin')} aria-hidden />
                Yenile
              </Button>
            </div>
          }
        />
      }
    >
      <QueryState query={overview} skeleton="stats" onRetry={() => overview.refetch()}>
        {(data) => <OverviewBlock data={data} />}
      </QueryState>

      <SectionTabs
        ariaLabel="Güven Merkezi bölümleri"
        defaultValue="vakalar"
        resetKeys={RESET_KEYS}
        tabs={[
          { value: 'vakalar', label: 'Vaka kuyruğu', icon: <ShieldAlert />, count: o?.openCases.total },
          { value: 'uyarilar', label: 'Güvenlik uyarıları', icon: <BellRing />, count: o?.alerts.unread },
          { value: 'kurallar', label: 'Kurallar', icon: <Sliders /> },
          { value: 'hassas', label: 'Hassas işlemler', icon: <ScrollText /> },
        ]}
      >
        {(t) => (
          <PanelErrorBoundary resetKeys={[t]}>
            {t === 'uyarilar' ? (
              <AlertsTab initial={initial.alerts} />
            ) : t === 'kurallar' ? (
              <RulesTab />
            ) : t === 'hassas' ? (
              <AuditTab />
            ) : (
              <CasesTab initial={initial.cases} />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}

function OverviewBlock({ data: o }: { data: TrustOverview }) {
  const crit = o.openCases.bySeverity.CRITICAL;
  const high = o.openCases.bySeverity.HIGH;
  const flaggedTotal = o.accounts.flagged.customer + o.accounts.flagged.dealer + o.accounts.flagged.other;
  const shadowTotal = o.accounts.shadowBan.customer + o.accounts.shadowBan.dealer + o.accounts.shadowBan.other;
  const scanned = o.lastScan;
  const shieldTone = !scanned || o.rulesEnabled === 0 ? 'warning' : crit > 0 || o.alerts.criticalOpen > 0 ? 'danger' : 'success';

  return (
    <div className="space-y-4">
      <div
        role="status"
        aria-live="polite"
        className={cn('flex flex-col gap-2 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', TONE_CALLOUT[shieldTone])}
      >
        <p className="flex items-start gap-2 font-medium">
          <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {crit > 0 ? `${fmtNum(crit)} kritik açık vaka · ` : ''}
            {o.alerts.criticalOpen > 0 ? `${fmtNum(o.alerts.criticalOpen)} kritik uyarı · ` : ''}
            Kalkan: {o.rulesEnabled}/3 kural etkin ·{' '}
            {scanned ? (
              <>
                son tarama <time dateTime={scanned.at} title={fmtAbs(scanned.at)}>{fmtRel(scanned.at)}</time> ({fmtNum(scanned.created)} yeni vaka)
              </>
            ) : (
              'henüz tarama yapılmadı — "Sinyalleri tara" ile ilk taramayı başlatın'
            )}
          </span>
        </p>
        <p className="text-xs text-fg-muted">
          Veri: <time dateTime={o.generatedAt}>{fmtAbs(o.generatedAt)}</time> · 60 sn'de bir yenilenir
        </p>
      </div>

      <MetricGrid cols={5}>
        <MetricTile
          label="Açık vaka"
          icon={<Gavel />}
          tone={crit > 0 ? 'danger' : high > 0 ? 'warning' : 'neutral'}
          metric={{ value: o.openCases.total, series: o.caseSeries.map((d) => d.count) }}
          sparklineLabel={`Son 14 günde açılan vakalar; bugün ${fmtNum(o.caseSeries.at(-1)?.count ?? 0)}`}
          hint={`Kritik ${fmtNum(crit)} · Yüksek ${fmtNum(high)} · 24 saatte yeni ${fmtNum(o.newCases24h)}`}
          href="/admin/trust?tab=vakalar&severity=CRITICAL,HIGH"
          animate
        />
        <MetricTile
          label="Güvenlik uyarısı (24 sa)"
          icon={<BellRing />}
          tone={o.alerts.criticalOpen > 0 ? 'danger' : o.alerts.unread > 0 ? 'warning' : 'neutral'}
          metric={{ value: o.alerts.last24h }}
          hint={`Okunmamış ${fmtNum(o.alerts.unread)} · Açık kritik ${fmtNum(o.alerts.criticalOpen)}`}
          href="/admin/trust?tab=uyarilar&astatus=unread"
          animate
        />
        <MetricTile
          label="Bayraklı hesap"
          icon={<UserX />}
          tone={flaggedTotal + shadowTotal > 0 ? 'warning' : 'neutral'}
          metric={{ value: flaggedTotal + shadowTotal }}
          hint={`İşaretli: müşteri ${fmtNum(o.accounts.flagged.customer)}, bayi ${fmtNum(o.accounts.flagged.dealer)} · Gölge yasak ${fmtNum(shadowTotal)} · Askıda ${fmtNum(o.accounts.suspended)}`}
          animate
        />
        <MetricTile
          label="Korunan puan (7 gün)"
          icon={<Coins />}
          tone="success"
          metric={{ value: o.voidedPoints7d, unit: 'puan', compact: true }}
          hint={`Gölge yasaklı hesaplara yazılmayan puan · 30 günde geri alınan ${fmtNum(o.reversedPoints30d)}`}
          animate
        />
        <MetricTile
          label="Hassas işlem (24 sa)"
          icon={<FileLock2 />}
          metric={{ value: o.sensitiveActions24h }}
          hint="Askıya alma, rol, puan düzeltme, güven aksiyonları"
          href="/admin/trust?tab=hassas&hwindow=24h"
          animate
        />
      </MetricGrid>
    </div>
  );
}
