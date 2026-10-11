'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Store, Search, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction } from '@/components/states';
import {
  DEALER_AI_FILTERS,
  DEALER_AI_FILTER_LABEL,
  PERIOD_LABEL,
  type DealerAiFilter,
  type DealerAiRow,
  type DealerAiSort,
} from '@/lib/admin-ai-ops/contract';
import { aiOpsKeys, errorText, fetchDealers, patchDealerAi } from './api';
import { useAiOps } from './hooks';
import { Meter, budgetTone, fmtCompact, fmtInt, fmtPct } from './parts';

const SORTS: Array<{ value: DealerAiSort; label: string }> = [
  { value: 'usage', label: 'Dönem tokenı' },
  { value: 'today', label: 'Bugünkü kota' },
  { value: 'failures', label: 'Hata' },
  { value: 'name', label: 'Ad' },
];

type Pending = { row: DealerAiRow; field: 'aiEnabled' | 'autoAnalyze'; next: boolean } | null;

export function DealersTab() {
  const { period, openSignal } = useAiOps();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DealerAiFilter>('all');
  const [sort, setSort] = useState<DealerAiSort>('usage');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const q = { period, filter, sort, q: debounced.length >= 2 ? debounced : undefined, page: pagination.pageIndex + 1, size: pagination.pageSize };
  const list = useQuery({ queryKey: aiOpsKeys.dealers(q), queryFn: () => fetchDealers(q), placeholderData: keepPreviousData });

  const mutation = useMutation({
    mutationFn: patchDealerAi,
    onSuccess: (r) => {
      toast.success(`Ayar kaydedildi: AI ${r.aiEnabled ? 'açık' : 'kapalı'}, otomatik analiz ${r.autoAnalyze ? 'açık' : 'kapalı'}. Tüm yollara en geç 30 saniyede yansır.`);
      void qc.invalidateQueries({ queryKey: ['admin-ai-ops'] });
    },
  });

  const toggle = (row: DealerAiRow, field: 'aiEnabled' | 'autoAnalyze', next: boolean) => {
    setReason('');
    setPending({ row, field, next });
  };

  const columns: ColumnDef<DealerAiRow>[] = [
    {
      accessorKey: 'name',
      header: 'Bayi',
      enableSorting: false,
      meta: { mobile: 'title' } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-fg">{row.original.name}</span>
          {row.original.isDemo ? <StatusBadge size="sm" icon={null} label="Demo" tone="neutral" /> : null}
          {row.original.source === 'default' ? <span className="text-xs text-fg-muted">(varsayılan ayar)</span> : null}
        </span>
      ),
    },
    {
      id: 'ai',
      header: 'AI',
      enableSorting: false,
      meta: { interactive: true, label: 'AI ana anahtarı' } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <Switch
          checked={row.original.aiEnabled}
          onCheckedChange={(v) => toggle(row.original, 'aiEnabled', v)}
          aria-label={`${row.original.name}: AI ${row.original.aiEnabled ? 'açık' : 'kapalı'}`}
          disabled={mutation.isPending}
        />
      ),
    },
    {
      id: 'auto',
      header: 'Otomatik analiz',
      enableSorting: false,
      meta: { interactive: true, label: 'Otomatik analiz' } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <Switch
          checked={row.original.autoAnalyze}
          onCheckedChange={(v) => toggle(row.original, 'autoAnalyze', v)}
          aria-label={`${row.original.name}: otomatik analiz ${row.original.autoAnalyze ? 'açık' : 'kapalı'}`}
          disabled={mutation.isPending || !row.original.aiEnabled}
        />
      ),
    },
    { accessorKey: 'calls', header: 'Çağrı', enableSorting: false, meta: { numeric: true }, cell: ({ row }) => `${fmtInt(row.original.calls)}${row.original.failures ? ` (${fmtInt(row.original.failures)} hata)` : ''}` },
    { accessorKey: 'tokens', header: 'Token', enableSorting: false, meta: { numeric: true }, cell: ({ getValue }) => fmtCompact(getValue<number>()) },
    {
      accessorKey: 'todayPercent',
      header: 'Bugünkü kota',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-[7rem]">
          <span className="text-xs tabular-nums text-fg-muted">
            {fmtCompact(row.original.todayTokens)} · {fmtPct(row.original.todayPercent)}
          </span>
          <Meter value={row.original.todayPercent} tone={budgetTone(row.original.todayPercent)} label={`${row.original.name}: günlük kotanın ${fmtPct(row.original.todayPercent)} kadarı`} className="mt-1" />
        </div>
      ),
    },
    {
      accessorKey: 'pending',
      header: 'Bekleyen',
      enableSorting: false,
      meta: { numeric: true, interactive: true } satisfies DataTableColumnMeta,
      cell: ({ row }) => fmtInt(row.original.pending),
    },
    {
      id: 'links',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: { mobile: 'actions', interactive: true, label: 'Bağlantılar' } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-2 text-xs">
          <button type="button" className="min-h-[44px] rounded px-1 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8" onClick={() => openSignal({ signal: 'negative', dealerId: row.original.id, label: `${row.original.name} · olumsuz` })}>
            Olumsuzlar
          </button>
          <Link href={`/admin/dealers-health?q=${encodeURIComponent(row.original.name)}`} className="inline-flex min-h-[44px] items-center rounded px-1 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8">
            Sağlık
          </Link>
        </span>
      ),
    },
  ];

  const p = pending;
  const fieldLabel = p?.field === 'aiEnabled' ? 'AI ana anahtarı' : 'Otomatik analiz';

  return (
    <SectionCard
      title="Bayi bazlı AI durumu"
      description={`Ana anahtar kapalıysa o bayi adına hiçbir LLM çağrısı yapılmaz; otomatik analiz kapalıysa yalnız arka plan analizi durur. Kullanım: ${PERIOD_LABEL[period].toLocaleLowerCase('tr-TR')}.`}
      icon={<Store />}
      density="flush"
      actions={
        <Link href="/admin/ai/studio" className="inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9">
          <Settings2 className="h-4 w-4" aria-hidden /> Ayrıntılı ayarlar
        </Link>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
        <ChoiceChips
          aria-label="Bayi süzgeci"
          size="sm"
          scroll
          options={DEALER_AI_FILTERS.map((f) => ({
            value: f,
            label:
              f === 'off' && list.data ? `${DEALER_AI_FILTER_LABEL[f]} (${fmtInt(list.data.counts.off)})` : f === 'auto_off' && list.data ? `${DEALER_AI_FILTER_LABEL[f]} (${fmtInt(list.data.counts.autoOff)})` : DEALER_AI_FILTER_LABEL[f],
          }))}
          value={filter}
          onChange={(v) => {
            if (!v) return;
            setFilter(v);
            setPagination((x) => ({ ...x, pageIndex: 0 }));
          }}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block">
            <span className="sr-only">Bayi ara</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bayi adı ya da e-posta" className="min-h-[44px] pl-9 sm:min-h-9 sm:w-60" />
          </label>
          <ChoiceChips aria-label="Sıralama" size="sm" options={SORTS} value={sort} onChange={(v) => v && setSort(v)} />
        </div>
      </div>
      <DataTable
        ariaLabel="Bayi bazlı AI durumu"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        manualPagination
        rowCount={list.data?.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        filtered={filter !== 'all' || !!q.q}
        empty={{ title: 'Bayi bulunamadı', description: 'Süzgeci ya da aramayı değiştirin.' }}
      />

      <ConfirmAction
        open={!!p}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        tone={p && !p.next ? 'warning' : 'brand'}
        title={p ? `${p.row.name}: ${fieldLabel} ${p.next ? 'açılsın' : 'kapatılsın'} mı?` : ''}
        description={
          p ? (
            <>
              {p.field === 'aiEnabled'
                ? p.next
                  ? 'Bayi adına analiz, sohbet, içgörü ve yanıt önerileri yeniden çalışır.'
                  : 'Bu bayi adına hiçbir LLM çağrısı yapılmaz; bekleyen analizler kuyrukta bekler.'
                : p.next
                  ? 'Yeni geri bildirimler arka planda otomatik analiz edilir.'
                  : 'Arka plan analizi durur; bayinin kendi başlattığı AI özellikleri çalışmaya devam eder.'}{' '}
              Bayinin kendi ayar ekranında da bu değişiklik görünür.
              <label className="mt-3 block text-sm">
                <span className="font-medium text-fg">Gerekçe (denetim kaydına yazılır)</span>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className="mt-1" placeholder="Örn. bayinin talebi, kota aşımı" />
              </label>
            </>
          ) : null
        }
        confirmLabel="Kaydet"
        irreversibleNote={false}
        onConfirm={async () => {
          if (!p) return;
          if (reason.trim().length < 5) throw new Error('Gerekçe en az 5 karakter olmalı.');
          try {
            await mutation.mutateAsync({ dealerId: p.row.id, [p.field]: p.next, reason: reason.trim() });
          } catch (e) {
            throw new Error(errorText(e));
          }
          setPending(null);
        }}
      />
    </SectionCard>
  );
}
