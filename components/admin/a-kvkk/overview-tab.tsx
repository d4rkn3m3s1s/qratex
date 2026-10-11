'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, Clock, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import type { CheckStatus, PrivacyOverview } from '@/lib/admin-privacy/contract';
import { fetchOverview } from './api';
import { formatDateTime, formatPercent, relativeFromNow } from './format';
import { AdminKvkkText } from './copy';

const CHECK_META: Record<CheckStatus, { tone: Tone; label: string; Icon: typeof CheckCircle2 }> = {
  ok: { tone: 'success', label: 'Uygun', Icon: CheckCircle2 },
  warn: { tone: 'warning', label: 'Dikkat', Icon: AlertTriangle },
  fail: { tone: 'danger', label: 'Aksiyon gerekli', Icon: XCircle },
  unknown: { tone: 'neutral', label: 'Ölçülemedi', Icon: HelpCircle },
};

function Checks({ data }: { data: PrivacyOverview }) {
  return (
    <ul className="divide-y divide-border">
      {data.checks.map((c) => {
        const meta = CHECK_META[c.status];
        const inner = (
          <>
            <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE_CHIP[meta.tone])}>
              <meta.Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{c.title}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[meta.tone])}>{meta.label}</span>
              </span>
              <span className="mt-0.5 block text-sm text-fg-muted">{c.detail}</span>
            </span>
          </>
        );
        return (
          <li key={c.id}>
            {c.href ? (
              <Link
                href={c.href.startsWith('?') ? `/admin/privacy${c.href}` : c.href}
                className="flex min-h-11 items-start gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-muted/60 focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewTab({ initial }: { initial: PrivacyOverview | null }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-privacy', 'overview'],
    queryFn: () => fetchOverview(false),
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });
  const refresh = useMutation({
    mutationFn: () => fetchOverview(true),
    onSuccess: (d) => qc.setQueryData(['admin-privacy', 'overview'], d),
  });

  return (
    <QueryState query={query} skeleton="stats" error={{ title: 'Uyum özeti yüklenemedi' }}>
      {(d) => {
        const failing = d.checks.filter((c) => c.status === 'fail').length;
        const warning = d.checks.filter((c) => c.status === 'warn').length;
        return (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg-muted" aria-live="polite">
                {failing > 0
                  ? `${failing} kontrol aksiyon bekliyor${warning ? `, ${warning} kontrolde dikkat gerekli` : ''}.`
                  : warning > 0
                    ? `${warning} kontrolde dikkat gerekli; aksiyon bekleyen yok.`
                    : 'Ölçülen bütün kontroller uygun.'}{' '}
                <span className="text-fg-subtle">Ölçüm: {formatDateTime(d.generatedAt)}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                aria-busy={refresh.isPending}
              >
                <RefreshCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                Şimdi ölç
              </Button>
            </div>
            {refresh.isError ? (
              <p role="alert" className="text-sm text-danger">
                {refresh.error instanceof Error ? refresh.error.message : 'Yeniden ölçülemedi.'}
              </p>
            ) : null}

            <MetricGrid cols={4}>
              <MetricTile
                label="Açık KVKK talebi"
                metric={{ value: d.dsr.open }}
                tone="brand"
                href="/admin/privacy?tab=talepler"
                hint={d.dsr.completed30 ? `Son 30 günde ${d.dsr.completed30} kapandı` : undefined}
              />
              <MetricTile
                label="Süresi geçen"
                metric={{ value: d.dsr.overdue }}
                tone={d.dsr.overdue > 0 ? 'danger' : 'neutral'}
                href="/admin/privacy?tab=talepler&status=overdue"
                hint={d.dsr.dueSoon ? `${d.dsr.dueSoon} talep 7 gün içinde doluyor` : 'KVKK m.13: 30 gün'}
              />
              <MetricTile
                label="En yakın son tarih"
                metric={{ value: d.dsr.nearestDueDays, unit: 'gün' }}
                icon={<Clock />}
                tone={d.dsr.nearestDueDays == null ? 'neutral' : d.dsr.nearestDueDays < 3 ? 'danger' : d.dsr.nearestDueDays <= 10 ? 'warning' : 'success'}
                hint={d.dsr.nearestDueDays == null ? 'Açık talep yok' : d.dsr.nearestDueDays < 0 ? 'Gecikmiş' : 'Kalan süre'}
              />
              <MetricTile
                label="Açık yüksek/kritik olay"
                metric={{ value: d.suspicious.unresolvedHigh }}
                icon={<ShieldAlert />}
                tone={d.suspicious.unresolvedHigh > 0 ? 'warning' : 'neutral'}
                href="/admin/trust"
                hint={`Toplam çözülmemiş: ${d.suspicious.unresolved.toLocaleString('tr-TR')}`}
              />
            </MetricGrid>

            <SectionCard
              title="Uyum kontrolleri"
              description="Her kontrol canlı veriden ölçülür; ölçülemeyen kontrol “uygun” sayılmaz. Satıra dokunarak ilgili bölüme gidin."
              density="flush"
            >
              <Checks data={d} />
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Denetim kaydı kapsamı" description={`Son ${d.logCoverage.windowDays} gün, kişi aktörlü işlemler`}>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-fg-muted">IP ile</dt>
                    <dd className="text-xl font-semibold tabular-nums text-fg">{formatPercent(d.logCoverage.withIpPercent)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted"><AdminKvkkText k="withBrowser" /></dt>
                    <dd className="text-xl font-semibold tabular-nums text-fg">{formatPercent(d.logCoverage.withUaPercent)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-fg-muted">{d.logCoverage.total.toLocaleString('tr-TR')} kayıt ölçüldü.</p>
                {d.logCoverage.missingIpTop.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-fg"><AdminKvkkText k="noIpWriters" /></p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {d.logCoverage.missingIpTop.map((m) => (
                        <li key={m.action} className="flex justify-between gap-2">
                          <code className="truncate font-mono text-fg-muted">{m.action}</code>
                          <span className="tabular-nums text-fg">{m.count.toLocaleString('tr-TR')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Rıza kanıtı" description="Son 30 gün çerez/izleme kararları">
                <p className="text-2xl font-semibold tabular-nums text-fg">{d.consent.last30.toLocaleString('tr-TR')}</p>
                <p className="text-sm text-fg-muted">
                  karar kaydedildi · güncel sürüm ({d.consent.currentVersion}) payı {formatPercent(d.consent.currentVersionShare)}
                </p>
                <Link href="/admin/privacy?tab=riza" className="mt-3 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline">
                  Rıza istatistikleri
                </Link>
              </SectionCard>

              <SectionCard title="Saklama ve imha" description="Günlük temizlik işi">
                <p className="text-sm text-fg">
                  {d.retention.lastOkAt ? `Son başarılı çalışma ${relativeFromNow(d.retention.lastOkAt)}` : 'Henüz başarılı çalışma kaydı yok'}
                </p>
                {d.retention.consecutiveFailures > 0 ? (
                  <p className="mt-1 text-sm text-danger">Ardışık {d.retention.consecutiveFailures} hata</p>
                ) : null}
                <Link
                  href="/admin/privacy?tab=saklama"
                  className="mt-3 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline"
                >
                  Saklama kuralları
                </Link>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
