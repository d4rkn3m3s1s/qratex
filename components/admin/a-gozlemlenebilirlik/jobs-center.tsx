'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, PanelPage, SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { JobRow, JobsView } from '@/lib/observability/contract';
import { JOB_HEALTH_META, JOB_STATUS_LABEL, RUN_OVERALL_META } from '@/lib/observability/contract';
import { errorText, fetchJobs, obsKeys, runJob } from './api';
import { fmtAgo, fmtDateTime, fmtInt, fmtMs } from './format';
import { DataGrid, HealthBadge, NoteText } from './parts';

type Filter = 'all' | 'problems';

export function JobsCenter({ initial }: { initial: JobsView | null }) {
  const q = useQuery({
    queryKey: obsKeys.jobs(),
    queryFn: ({ signal }) => fetchJobs(signal),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: initial ? new Date(initial.generatedAt).getTime() : undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Platform"
          title="Arka plan işleri"
          description="Günlük tek uyanışta çalışan alt işler: son koşu, sonuç, süre, ardışık hata ve koşu geçmişi."
          icon={<CalendarClock className="h-5 w-5" aria-hidden />}
          back={{ href: '/admin/observability', label: 'Gözlemlenebilirlik' }}
          actions={
            <Button variant="outline" className="min-h-11" onClick={() => void q.refetch()} disabled={q.isFetching} aria-busy={q.isFetching}>
              <RefreshCw className={cn('mr-2 h-4 w-4', q.isFetching && 'motion-safe:animate-spin')} aria-hidden />
              Yenile
            </Button>
          }
          meta={q.data ? <span className="text-sm text-fg-muted" aria-live="polite">Son güncelleme {fmtAgo(new Date(q.dataUpdatedAt).toISOString())}</span> : null}
        />
      }
    >
      <QueryState query={q} skeleton="table" isEmpty={() => false}>
        {(data) => <JobsBody data={data} />}
      </QueryState>
    </PanelPage>
  );
}

function JobsBody({ data }: { data: JobsView }) {
  const [filter, setFilter] = useState<Filter>('all');
  const problems = data.jobs.filter((j) => j.health === 'failing' || j.health === 'overdue' || j.health === 'budget');
  const rows = filter === 'problems' ? problems : data.jobs;
  const groups = useMemo(() => {
    const m = new Map<string, JobRow[]>();
    for (const j of rows) m.set(j.group, [...(m.get(j.group) ?? []), j]);
    return [...m.entries()];
  }, [rows]);
  const okCount = data.jobs.filter((j) => j.health === 'ok').length;
  const durations = [...data.history].reverse().map((h) => (h.ms == null ? null : Math.round(h.ms / 1000)));

  return (
    <div className="space-y-6">
      <div role={data.overall === 'error' ? 'alert' : undefined} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-4', data.overall === 'error' ? 'border-danger-border bg-danger-subtle' : data.overall === 'warn' ? 'border-warning-border bg-warning-subtle' : 'border-border bg-surface-1')}>
        <HealthBadge status={data.overall} size="md" />
        <p className="min-w-0 flex-1 text-sm font-medium">{data.overallDetail}</p>
      </div>

      <MetricGrid cols={4}>
        <MetricTile label="Kayıtlı iş" metric={{ value: data.jobs.length, format: 'number' }} hint={`${okCount} sorunsuz`} />
        <MetricTile label="Sorunlu iş" tone={problems.length > 0 ? 'danger' : 'success'} metric={{ value: problems.length, format: 'number' }} hint="Hata, gecikme ya da bütçe" />
        <MetricTile
          label="Son koşu"
          metric={{ value: data.lastRun?.ms != null ? Math.round(data.lastRun.ms / 1000) : null, format: 'number', unit: 'sn', series: durations.length > 1 ? durations : null }}
          sparklineLabel={durations.length > 1 ? `Son ${durations.length} koşunun süresi (sn): ${durations.map((d) => d ?? '—').join(', ')}` : undefined}
          hint={data.lastRun ? `${fmtDateTime(data.lastRun.startedAt)} · ${RUN_OVERALL_META[data.lastRun.overall].label}` : 'Kayıt yok'}
        />
        <MetricTile label="Şu an" metric={{ value: data.running ? 1 : 0, format: 'number', unit: data.running ? 'koşu sürüyor' : 'koşu yok' }} hint={data.running ? `${fmtAgo(data.running.startedAt)} başladı` : 'Boşta'} />
      </MetricGrid>

      <SectionCard
        title="İşler"
        description="Öncelik sırasıyla (ekonomi → temizlik → üretim → teslimat → AI). Bütçe biterse sondakiler ertesi gün telafi edilir."
        actions={
          <ChoiceChips
            aria-label="İş filtresi"
            size="sm"
            options={[
              { value: 'all' as const, label: `Tümü (${data.jobs.length})` },
              { value: 'problems' as const, label: `Sorunlular (${problems.length})` },
            ]}
            value={filter}
            onChange={(v) => v && setFilter(v)}
          />
        }
        density="flush"
      >
        {!data.stateReadable && <p className="px-4 pt-3 text-sm text-warning">İş durumu okunamadı; aşağıda yalnız kayıt defteri görünüyor.</p>}
        {rows.length === 0 ? (
          <EmptyState compact title="Sorunlu iş yok" description="Tüm işler bu dönem için sorunsuz ya da sırasını bekliyor." />
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([group, jobs]) => (
              <div key={group}>
                <h3 className="bg-surface-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{group}</h3>
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <JobItem key={j.name} job={j} running={!!data.running} canRun={data.monitors.cronSecret} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Koşu geçmişi" description="Son 14 günlük koşu (en yeni üstte)." density="flush">
        {data.history.length === 0 ? (
          <EmptyState compact title="Kayıtlı koşu yok" description="Günlük tetikleyici çalıştığında koşular burada listelenir." />
        ) : (
          <DataGrid caption="Günlük koşu geçmişi" head={['Başlangıç', 'Sonuç', 'Çalışan iş', 'Süre', 'Hata / atlanan']}>
            {data.history.map((h) => (
              <tr key={h.startedAt}>
                <td className="px-3 py-2 tabular-nums">{fmtDateTime(h.startedAt)}</td>
                <td className="px-3 py-2 text-right">
                  <StatusBadge size="sm" tone={RUN_OVERALL_META[h.overall].tone} label={RUN_OVERALL_META[h.overall].label} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(h.ran)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMs(h.ms)}</td>
                <td className="max-w-[18rem] px-3 py-2 text-right text-xs text-fg-muted">
                  {[...h.failed.map((f) => `${f} (hata)`), ...h.skippedBudget.map((f) => `${f} (bütçe)`)].join(', ') || '—'}
                </td>
              </tr>
            ))}
          </DataGrid>
        )}
      </SectionCard>

      <SectionCard title="İzleme" description="Koşu hiç gelmezse alarm üretecek dış kanallar." icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
        <ul className="grid gap-3 sm:grid-cols-3">
          <MonitorItem ok={data.monitors.heartbeatUrl} label="Dead-man heartbeat" hint="CRON_HEARTBEAT_URL: koşu gelmezse izleme servisi alarm verir." />
          <MonitorItem ok={data.monitors.sentryCron} label="Sentry cron izleyici" hint="Her koşuda başla/bitir check-in'i (cron-daily)." />
          <MonitorItem ok={data.monitors.cronSecret} label="Tetikleyici sırrı" hint="CRON_SECRET olmadan orkestratör 503 döner." />
        </ul>
        {data.orphaned.length > 0 && (
          <NoteText>Kayıt defterinde artık olmayan eski iş kayıtları: {data.orphaned.join(', ')}.</NoteText>
        )}
      </SectionCard>
      <NoteText>
        Sistem sağlığının geri kalanı için <Link className="text-brand underline-offset-4 hover:underline" href="/admin/observability">Gözlemlenebilirlik</Link> sayfasına bakın.
      </NoteText>
    </div>
  );
}

function MonitorItem({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <StatusBadge size="sm" tone={ok ? 'success' : 'warning'} label={ok ? 'Kurulu' : 'Kurulu değil'} />
      </div>
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    </li>
  );
}

function JobItem({ job, running, canRun }: { job: JobRow; running: boolean; canRun: boolean }) {
  const meta = JOB_HEALTH_META[job.health];
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{job.label}</p>
          <code className="text-xs text-fg-muted">{job.name}</code>
          <StatusBadge size="sm" tone={meta.tone} label={meta.label} />
          {job.consecutiveFailures >= 2 && <StatusBadge size="sm" tone="danger" label={`${job.consecutiveFailures} kez üst üste`} />}
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          {job.cadenceLabel} · zaman aşımı {fmtMs(job.timeoutMs)} · son koşu {job.lastRunAt ? `${fmtDateTime(job.lastRunAt)} (${job.lastStatus ? JOB_STATUS_LABEL[job.lastStatus] : '—'}, ${fmtMs(job.lastMs)})` : 'yok'}
          {job.lastOkAt && job.lastOkAt !== job.lastRunAt ? ` · son başarılı ${fmtDateTime(job.lastOkAt)}` : ''}
        </p>
        {job.lastError && (
          <p className="mt-1 break-words rounded bg-danger-subtle px-2 py-1 font-mono text-xs text-danger">{job.lastError}</p>
        )}
      </div>
      {job.due && job.health !== 'waiting' && job.health !== 'never' && (
        <RunButton job={job} disabled={running || !canRun} disabledReason={running ? 'Günlük koşu sürüyor' : !canRun ? 'CRON_SECRET tanımlı değil' : undefined} />
      )}
    </li>
  );
}

function RunButton({ job, disabled, disabledReason }: { job: JobRow; disabled: boolean; disabledReason?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const fieldId = `run-reason-${job.name}`;
  const mut = useMutation({
    mutationFn: () => runJob({ name: job.name, reason: reason.trim() }),
    onSuccess: (r) => {
      if (r.status === 'ok') toast.success(`${job.label} başarıyla çalıştı (${fmtMs(r.ms)}).`);
      else toast.error(`${job.label}: ${r.error ?? 'iş başarısız oldu'}`);
      void qc.invalidateQueries({ queryKey: obsKeys.jobs() });
      void qc.invalidateQueries({ queryKey: ['admin', 'observability'] });
      setReason('');
      setOpen(false);
    },
  });
  const tooShort = reason.trim().length < 5;

  if (!open) {
    return (
      <Button variant="outline" className="min-h-11" disabled={disabled} title={disabledReason} onClick={() => setOpen(true)} aria-expanded={false} aria-controls={fieldId}>
        <Play className="mr-2 h-4 w-4" aria-hidden /> Şimdi çalıştır
      </Button>
    );
  }
  return (
    <form
      className="w-full space-y-2 rounded-lg border border-warning-border bg-warning-subtle p-3 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !mut.isPending) mut.mutate();
      }}
    >
      <p className="text-sm text-fg">
        İş orkestratör üzerinden aynı zaman aşımı ve durum kaydıyla çalışır; yan etkileri (bildirim, e-posta, puan) gerçekleşir. İstek ve sonuç denetime yazılır.
      </p>
      <label htmlFor={fieldId} className="text-sm font-medium">
        Gerekçe
      </label>
      <Textarea id={fieldId} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="ör. Dünkü koşu SMTP zaman aşımıyla düştü" aria-invalid={reason.length > 0 && tooShort} autoFocus />
      {mut.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorText(mut.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={tooShort || mut.isPending} aria-busy={mut.isPending}>
          <Play className="mr-2 h-4 w-4" aria-hidden /> {mut.isPending ? 'Çalışıyor…' : 'Onayla ve çalıştır'}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)} disabled={mut.isPending}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
