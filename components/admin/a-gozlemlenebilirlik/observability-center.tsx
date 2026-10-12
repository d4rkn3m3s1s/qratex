'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import { toast } from 'sonner';
import { Activity, AlertTriangle, ClipboardCopy, ExternalLink, RefreshCw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { SeverityBadge, StatusBadge } from '@/components/ds/data';
import { SkeletonCards, SkeletonStats } from '@/components/states';
import { useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { HealthStatus, ObsWindow, ObservabilitySnapshot } from '@/lib/observability/contract';
import { HEALTH_LABEL, OBS_WINDOWS, OBS_WINDOW_LABEL, obsWindowSchema } from '@/lib/observability/contract';
import { errorText, fetchSnapshot, obsKeys } from './api';
import { fmtAgo, fmtInt, fmtPct } from './format';
import { HealthBadge } from './parts';
import { GuideSection, HealthSection, PlatformSection, TrafficSection, VitalsSection } from './sections';
import { AdminGozlemlenebilirlikText } from './copy';

type Interval = '30' | '60' | 'off';
const INTERVAL_KEY = 'qx.obs.refresh';
const INTERVAL_OPTIONS = [
  { value: '30' as const, label: '30 sn' },
  { value: '60' as const, label: '60 sn' },
  { value: 'off' as const, label: 'Kapalı' },
];

type Conn = 'live' | 'stale' | 'paused' | 'offline' | 'loading';
const CONN_META: Record<Conn, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  live: { label: 'Canlı', tone: 'success' },
  stale: { label: 'Bayat', tone: 'warning' },
  paused: { label: 'Otomatik yenileme kapalı', tone: 'neutral' },
  offline: { label: 'Bağlantı yok', tone: 'danger' },
  loading: { label: 'Yükleniyor', tone: 'neutral' },
};

function readInterval(): Interval {
  try {
    const v = window.localStorage.getItem(INTERVAL_KEY);
    return v === '30' || v === '60' || v === 'off' ? v : '60';
  } catch {
    return '60';
  }
}

export function ObservabilityCenter({ initial }: { initial: ObservabilitySnapshot | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const win: ObsWindow = obsWindowSchema.catch('24h').parse(sp.get('window') ?? initial?.window ?? '24h');
  const reduced = useReducedMotionPref();

  const [interval, setIntervalState] = useState<Interval>('60');
  useEffect(() => setIntervalState(readInterval()), []);
  const setInterval_ = (v: Interval) => {
    setIntervalState(v);
    try {
      window.localStorage.setItem(INTERVAL_KEY, v);
    } catch {
      /* tercih kaydedilemedi; oturum boyunca geçerli */
    }
  };
  const intervalMs = interval === 'off' ? false : Number(interval) * 1000;

  // Elle yenilemede sunucu önbelleği atlanır (`fresh=1`); otomatik yenileme önbellekten okur.
  const freshRef = useRef(false);
  const q = useQuery({
    queryKey: obsKeys.snapshot(win),
    queryFn: ({ signal }) => {
      const fresh = freshRef.current;
      freshRef.current = false;
      return fetchSnapshot(win, { signal, fresh });
    },
    initialData: initial && initial.window === win ? initial : undefined,
    initialDataUpdatedAt: initial ? new Date(initial.generatedAt).getTime() : undefined,
    staleTime: 15_000,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  // Göreli zaman metni için hafif saat (yalnız başlık meta'sını yeniden çizer).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const conn: Conn = useMemo(() => {
    if (!q.data) return q.isError ? 'offline' : 'loading';
    if (q.isError) return 'offline';
    if (interval === 'off') return 'paused';
    const age = now - q.dataUpdatedAt;
    return age > 2 * (intervalMs || 60_000) + 5_000 ? 'stale' : 'live';
  }, [q.data, q.isError, q.dataUpdatedAt, interval, intervalMs, now]);

  const setWindow = useCallback(
    (w: ObsWindow) => {
      const next = new URLSearchParams(sp.toString());
      if (w === '24h') next.delete('window');
      else next.set('window', w);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp]
  );

  const refresh = () => {
    freshRef.current = true;
    void q.refetch();
  };

  const data = q.data ?? null;
  const overall = useMemo(() => overallOf(data), [data]);

  const copySnapshot = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(toMarkdown(data));
      toast.success('Durum özeti panoya kopyalandı.');
    } catch {
      toast.error('Panoya kopyalanamadı. Tarayıcı izni gerekebilir.');
    }
  };

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Platform"
          title="Gözlemlenebilirlik"
          description="Sistem şu an sağlıklı mı? Sorunlar önce, ayrıntı sonra: bağımlılıklar, API hata oranı ve yavaş uçlar, sayfa performansı, barındırma platformu."
          icon={<Activity className="h-5 w-5" aria-hidden />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="min-h-11" onClick={copySnapshot} disabled={!data}>
                <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden /> Özeti kopyala
              </Button>
              <Button className="min-h-11" onClick={refresh} disabled={q.isFetching} aria-busy={q.isFetching}>
                <RefreshCw className={cn('mr-2 h-4 w-4', q.isFetching && 'motion-safe:animate-spin')} aria-hidden />
                {q.isFetching ? 'Yenileniyor' : 'Yenile'}
              </Button>
            </div>
          }
          meta={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
                  {conn === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
                  <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', conn === 'live' ? 'bg-success' : conn === 'stale' ? 'bg-warning' : conn === 'offline' ? 'bg-danger' : 'bg-fg-subtle')} />
                </span>
                <StatusBadge size="sm" tone={CONN_META[conn].tone} label={CONN_META[conn].label} icon={null} srPrefix="Bağlantı:" />
              </span>
              <span className="text-fg-muted" aria-live="polite">
                {data ? `Son güncelleme ${fmtAgo(new Date(q.dataUpdatedAt).toISOString(), now)}` : ''}
              </span>
            </div>
          }
        />
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ChoiceChips aria-label="Uç metrikleri penceresi" size="sm" options={OBS_WINDOWS.map((w) => ({ value: w, label: OBS_WINDOW_LABEL[w] }))} value={win} onChange={(v) => v && setWindow(v)} />
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-fg-muted" aria-hidden />
            <span id="obs-interval" className="text-sm text-fg-muted">Otomatik yenile</span>
            <ChoiceChips aria-labelledby="obs-interval" size="sm" options={INTERVAL_OPTIONS} value={interval} onChange={(v) => v && setInterval_(v)} />
          </div>
        </div>
      }
    >
      {q.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger-border bg-danger-subtle p-4 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {errorText(q.error, 'Veriler alınamadı.')} {data ? 'Aşağıdaki değerler en son başarılı okumadan.' : ''}
          </p>
          <Button variant="outline" className="min-h-11" onClick={refresh} disabled={q.isFetching}>
            Tekrar dene
          </Button>
        </div>
      )}

      {!data ? (
        q.isError ? null : (
          <div className="space-y-6" aria-busy="true">
            <SkeletonStats />
            <SkeletonCards />
          </div>
        )
      ) : (
        <div className="space-y-6">
          <StatusBanner overall={overall} issueCount={data.issues.length} />
          <IssuesList data={data} reduced={reduced} />
          <HealthSection section={data.health} onRetry={refresh} jobs={<JobsCard section={data.jobs} />} />
          <TrafficSection section={data.traffic} window={win} onRetry={refresh} />
          <VitalsSection section={data.vitals} onRetry={refresh} />
          <PlatformSection section={data.platform} onRetry={refresh} />
          <GuideSection />
        </div>
      )}
    </PanelPage>
  );
}

function overallOf(d: ObservabilitySnapshot | null): HealthStatus {
  if (!d) return 'unknown';
  if (d.issues.some((i) => i.severity === 'critical' || i.severity === 'high')) return 'error';
  if (d.issues.length > 0) return 'warn';
  const anyFailed = [d.health, d.traffic, d.vitals, d.platform, d.jobs].some((s) => !s.ok);
  return anyFailed ? 'unknown' : 'ok';
}

const BANNER_CLASS: Record<HealthStatus, string> = {
  ok: 'border-success-border bg-success-subtle text-success',
  warn: 'border-warning-border bg-warning-subtle text-warning',
  error: 'border-danger-border bg-danger-subtle text-danger',
  unknown: 'border-border bg-surface-muted text-fg',
};

function StatusBanner({ overall, issueCount }: { overall: HealthStatus; issueCount: number }) {
  const sentence =
    overall === 'ok'
      ? 'Tüm sistemler çalışıyor.'
      : overall === 'unknown'
        ? 'Bilinen bir sorun yok, ancak bazı bölümler okunamadı.'
        : `${issueCount} sorun var.`;
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-4 transition-colors duration-base', BANNER_CLASS[overall])}>
      <HealthBadge status={overall} size="md" label={HEALTH_LABEL[overall]} />
      <p className="text-base font-semibold">{sentence}</p>
    </div>
  );
}

function IssuesList({ data, reduced }: { data: ObservabilitySnapshot; reduced: boolean }) {
  if (data.issues.length === 0) return null;
  return (
    <section aria-labelledby="obs-issues" className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 id="obs-issues" className="mb-3 text-sm font-semibold">
        Sorunlar
      </h2>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {data.issues.map((i) => (
            <m.li
              key={i.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <SeverityBadge severity={i.severity} size="sm" emphasize />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-sm text-fg-muted">{i.detail}</p>
                </div>
                {i.external ? (
                  <a href={i.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {i.actionLabel} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only"><AdminGozlemlenebilirlikText k="newTab" /></span>
                  </a>
                ) : (
                  <Link href={i.href} className="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {i.actionLabel}
                  </Link>
                )}
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function JobsCard({ section }: { section: ObservabilitySnapshot['jobs'] }) {
  return (
    <div className="h-full rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium"><AdminGozlemlenebilirlikText k="backgroundJobs" /></p>
        <HealthBadge status={section.ok ? section.data.overall : 'unknown'} />
      </div>
      <p className="mt-1 text-sm text-fg-muted">{section.ok ? section.data.detail : section.error}</p>
      <Link href="/admin/jobs" className="mt-2 inline-flex min-h-11 items-center rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        İşleri aç
      </Link>
    </div>
  );
}

/** Olay kanalına yapıştırılabilir durum özeti (Markdown). */
function toMarkdown(d: ObservabilitySnapshot): string {
  const lines: string[] = [];
  const when = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.generatedAt));
  lines.push(`## Qratex sistem durumu · ${when}`);
  lines.push('');
  lines.push(d.issues.length === 0 ? 'Bilinen sorun yok.' : `**${d.issues.length} sorun:**`);
  for (const i of d.issues) lines.push(`- [${i.severity}] ${i.title}: ${i.detail}`);
  if (d.health.ok) {
    lines.push('', '**Bağımlılıklar**');
    for (const c of d.health.data.checks) lines.push(`- ${c.label}: ${HEALTH_LABEL[c.status]} (${c.detail})`);
  }
  if (d.traffic.ok && d.traffic.data.collecting) {
    const t = d.traffic.data.totals;
    lines.push('', `**API (${OBS_WINDOW_LABEL[d.window]})**: ${fmtInt(t.requests)} istek, 5xx ${fmtPct(t.errorRatePct)}, p95 ${t.p95Ms ?? '—'} ms`);
  }
  if (d.vitals.ok && d.vitals.data.collecting) {
    lines.push('', `**Web Vitals p75 (24 sa)**: ${d.vitals.data.metrics.map((m) => `${m.name} ${m.p75 ?? '—'}`).join(' · ')}`);
  }
  if (d.platform.ok) lines.push('', `**Vercel**: ${d.platform.data.indicator.label}`);
  return lines.join('\n');
}
