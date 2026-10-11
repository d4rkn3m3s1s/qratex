'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Inbox, Play, RotateCcw, Eraser, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, MetricGrid, MetricTile, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { ConfirmAction, QueryState } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import { PENDING_STATES, PENDING_STATE_LABEL, type BacklogActionResult, type PendingRow, type PendingState } from '@/lib/admin-ai-ops/contract';
import { cn } from '@/lib/utils';
import { aiOpsKeys, errorText, fetchPending, runBacklog } from './api';
import { useBacklog } from './hooks';
import { fmtAgo, fmtDateTime, fmtInt } from './parts';

function resultText(r: BacklogActionResult): string {
  switch (r.action) {
    case 'process': {
      const x = r.result;
      if (x.processed === 0) return 'İşlenecek uygun kayıt bulunamadı (son 3 dakikadakiler ilk analizi bekliyor).';
      return `${x.processed} kayıt denendi: ${x.upgraded} gerçek analize yükseldi, ${x.stillFallback} yine yedekte kaldı, ${x.skipped} atlandı, ${x.failed + x.timeouts} başarısız${x.stoppedByBudget ? ' (zaman bütçesi doldu, kalanlar sonraki turda)' : ''}.`;
    }
    case 'retry_one':
      return {
        upgraded: 'Analiz tamamlandı.',
        fallback: 'Sağlayıcı yine yanıt vermedi; kayıt yerel yedekle işaretli kaldı.',
        skipped: `Atlandı${r.reason ? ` (${r.reason})` : ''}.`,
        failed: 'Analiz başarısız oldu.',
        timeout: 'Zaman aşımı; analiz arka planda sürebilir.',
      }[r.outcome];
    case 'requeue_exhausted':
      return `${fmtInt(r.count)} kayıt yeniden kuyruğa alındı.`;
    case 'clear_synthetic':
      return `${fmtInt(r.count)} kayıttaki sezgisel sinyal temizlendi; gerçek analiz kuyruğuna girdiler.`;
  }
}

export function BacklogTab() {
  const qc = useQueryClient();
  const backlog = useBacklog();
  const [reason, setReason] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: runBacklog,
    onSuccess: (r) => {
      const msg = resultText(r);
      setLastResult(msg);
      announce(msg);
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: ['admin-ai-ops'] });
    },
  });

  const reasonOk = reason.trim().length >= 5;
  const reasonField = (
    <label className="mt-3 block text-sm">
      <span className="font-medium text-fg">Gerekçe (denetim kaydına yazılır)</span>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className="mt-1" placeholder="Örn. sağlayıcı kesintisi sonrası birikimi eritmek" />
    </label>
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Analiz kuyruğu"
        description="Gerçek AI analizini henüz alamamış geri bildirimler. Otomatik kuyruk günlük orkestratörle çalışır; burada elle tetikleyebilirsiniz. Hiçbir işlem sahte sinyal yazmaz."
        icon={<Inbox />}
      >
        <QueryState query={backlog} skeleton="stats">
          {(b) => (
            <div className="space-y-5">
              <MetricGrid cols={5}>
                <MetricTile label="Kuyrukta" tone={b.eligible ? 'warning' : 'success'} metric={{ value: b.eligible }} hint={b.oldestEligibleAt ? `En eski: ${fmtAgo(b.oldestEligibleAt)}` : 'Bekleyen yok'} />
                <MetricTile label="Hakkı bitmiş" tone={b.exhausted ? 'danger' : 'neutral'} metric={{ value: b.exhausted }} hint={`${b.maxAttempts} deneme sonrası`} />
                <MetricTile label="Bayi AI kapalı" metric={{ value: b.blockedByPolicy }} hint="Bayi ayarı açılınca kuyruğa girer" />
                <MetricTile label="Pencere dışı" metric={{ value: b.stale }} hint={`${b.lookbackDays} günden eski, analizsiz`} />
                <MetricTile label="Sezgisel (sahte)" tone={b.synthetic ? 'danger' : 'neutral'} metric={{ value: b.synthetic }} hint="Gerçek bayilerde eski düğmenin yazdığı" />
              </MetricGrid>

              <div className="flex flex-wrap gap-2">
                <ConfirmAction
                  tone="brand"
                  title="Kuyruğu şimdi işle"
                  description="En eski kayıtlardan en fazla 10 tanesi gerçek AI analizine gönderilir (bayi AI tercihleri ve günlük token tavanları geçerlidir). İşlem en fazla ~25 saniye sürer."
                  impact={[
                    { label: 'Kuyrukta', value: fmtInt(b.eligible) },
                    { label: 'Bu turda en fazla', value: '10 kayıt', emphasis: true },
                    { label: 'Tahmini maliyet', value: 'kayıt başına 1 analiz çağrısı' },
                  ]}
                  confirmLabel="İşle"
                  irreversibleNote={false}
                  disabled={!b.eligible || mutation.isPending}
                  onConfirm={() => mutation.mutateAsync({ action: 'process', limit: 10 })}
                  trigger={
                    <Button disabled={!b.eligible || mutation.isPending} className="min-h-[44px] sm:min-h-10">
                      {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="mr-2 h-4 w-4" aria-hidden />}
                      Şimdi işle
                    </Button>
                  }
                />
                <ConfirmAction
                  tone="warning"
                  title="Hakkı bitmiş kayıtları yeniden kuyruğa al"
                  description={
                    <>
                      Son {b.lookbackDays} gündeki, deneme hakkı bitmiş kayıtların sayacı sıfırlanır; otomatik kuyruk onları yeniden dener.
                      {reasonField}
                    </>
                  }
                  impact={[{ label: 'Etkilenecek kayıt', value: fmtInt(b.exhausted), emphasis: true }]}
                  confirmLabel="Kuyruğa al"
                  irreversibleNote={false}
                  disabled={!b.exhausted || mutation.isPending}
                  onConfirm={async () => {
                    if (!reasonOk) throw new Error('Gerekçe en az 5 karakter olmalı.');
                    await mutation.mutateAsync({ action: 'requeue_exhausted', reason: reason.trim() });
                    setReason('');
                  }}
                  trigger={
                    <Button variant="outline" disabled={!b.exhausted || mutation.isPending} className="min-h-[44px] sm:min-h-10">
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                      Yeniden kuyruğa al ({fmtInt(b.exhausted)})
                    </Button>
                  }
                />
                {b.synthetic > 0 ? (
                  <ConfirmAction
                    tone="danger"
                    title="Sezgisel sinyalleri temizle"
                    description={
                      <>
                        Eski “Veri doldur” düğmesinin gerçek bayilerin geri bildirimlerine yazdığı puandan türetilmiş sinyaller (niyet, aciliyet, kayıp riski, efor) silinir ve kayıtlar gerçek analiz kuyruğuna döner. Yalnız son {b.lookbackDays} gündekiler otomatik olarak yeniden analiz edilir.
                        {reasonField}
                      </>
                    }
                    impact={[{ label: 'Temizlenecek kayıt', value: fmtInt(b.synthetic), emphasis: true }]}
                    confirmPhrase="TEMİZLE"
                    confirmLabel="Temizle"
                    disabled={mutation.isPending}
                    onConfirm={async () => {
                      if (!reasonOk) throw new Error('Gerekçe en az 5 karakter olmalı.');
                      await mutation.mutateAsync({ action: 'clear_synthetic', reason: reason.trim() });
                      setReason('');
                    }}
                    trigger={
                      <Button variant="outline" disabled={mutation.isPending} className="min-h-[44px] sm:min-h-10">
                        <Eraser className="mr-2 h-4 w-4" aria-hidden />
                        Sahte sinyalleri temizle ({fmtInt(b.synthetic)})
                      </Button>
                    }
                  />
                ) : null}
              </div>
              {mutation.isError ? (
                <p role="alert" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.danger)}>
                  {errorText(mutation.error)}
                </p>
              ) : lastResult ? (
                <p className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.info)}>{lastResult}</p>
              ) : null}
            </div>
          )}
        </QueryState>
      </SectionCard>
      <PendingCard />
    </div>
  );
}

function PendingCard() {
  const qc = useQueryClient();
  const [state, setState] = useState<PendingState>('eligible');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const q = { state, page: pagination.pageIndex + 1, size: pagination.pageSize };
  const list = useQuery({ queryKey: aiOpsKeys.pending(q), queryFn: () => fetchPending(q), placeholderData: keepPreviousData });
  const [busyId, setBusyId] = useState<string | null>(null);

  const retry = async (row: PendingRow) => {
    setBusyId(row.id);
    try {
      const r = await runBacklog({ action: 'retry_one', feedbackId: row.id });
      const msg = resultText(r);
      if (r.action === 'retry_one' && r.outcome === 'upgraded') toast.success(msg);
      else toast.message(msg);
      announce(msg);
      void qc.invalidateQueries({ queryKey: ['admin-ai-ops'] });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const columns: ColumnDef<PendingRow>[] = [
    { accessorKey: 'dealerName', header: 'Bayi', meta: { mobile: 'title' } satisfies DataTableColumnMeta },
    { accessorKey: 'preview', header: 'Yorum', cell: ({ getValue }) => <span className="line-clamp-2 text-sm">{getValue<string>()}</span> },
    { accessorKey: 'createdAt', header: 'Geldi', meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta, cell: ({ getValue }) => <time dateTime={getValue<string>()}>{fmtDateTime(getValue<string>())}</time> },
    { accessorKey: 'attempts', header: 'Deneme', meta: { numeric: true }, cell: ({ row }) => `${row.original.attempts}${row.original.lastAttemptAt ? ` · ${fmtAgo(row.original.lastAttemptAt)}` : ''}` },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: { mobile: 'actions', interactive: true, label: 'İşlemler' } satisfies DataTableColumnMeta,
      cell: ({ row }) =>
        state === 'blocked' ? (
          <span className="text-xs text-fg-muted">Bayi ayarı kapalı</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-8"
            disabled={busyId !== null}
            onClick={() => retry(row.original)}
            aria-label={`${row.original.dealerName} yorumunu yeniden analiz et`}
          >
            {busyId === row.original.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
            Yeniden dene
          </Button>
        ),
    },
  ];

  return (
    <SectionCard title="Bekleyen kayıtlar" description="Durum seçerek listeleyin; tek kaydı yeniden deneyebilirsiniz (hakkı bittiyse bir hak daha verilir)." density="flush">
      <div className="px-4 pb-3 pt-1">
        <ChoiceChips
          aria-label="Kuyruk durumu"
          size="sm"
          scroll
          options={PENDING_STATES.map((s) => ({ value: s, label: PENDING_STATE_LABEL[s] }))}
          value={state}
          onChange={(v) => {
            if (!v) return;
            setState(v);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        />
      </div>
      <DataTable
        ariaLabel="Bekleyen analizler"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        manualPagination
        rowCount={list.data?.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        empty={{ title: 'Bu durumda kayıt yok', description: 'Kuyruk temiz.' }}
      />
    </SectionCard>
  );
}
