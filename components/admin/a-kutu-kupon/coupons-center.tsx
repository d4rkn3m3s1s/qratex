'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Download, Gift, Info, Layers, Plus, RefreshCw, Ticket, TimerOff, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ds/a11y';
import {
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  statusBadgeProps,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { FilterBar, PageHeader, PanelPage, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { DURATION, useMotionPolicy } from '@/lib/motion';
import {
  COUPON_PAGE_SIZE,
  COUPON_STATUS_FILTERS,
  STATUS_LABEL,
  couponQueryString,
  formatCouponValue,
  type CouponListItem,
  type CouponListPage,
  type CouponSort,
  type CouponStats,
  type CouponStatusFilter,
} from '@/lib/admin-coupons/contract';
import { couponKeys, errorText, exportUrl, fetchCouponStats, fetchCoupons } from './api';
import { CouponActions } from './coupon-actions';
import { CouponBatchDialog } from './coupon-batch-dialog';
import { CouponDetailBody } from './coupon-detail';
import { CouponEditor, type CouponEditorTarget } from './coupon-editor';
import { COUPON_STATUS_MAP, fmtDateTime, fmtNumber, pct } from './format';
import { AdminKutuKuponText } from './copy';

export type CouponsInitial = {
  stats: CouponStats | null;
  list: { qs: string; page: CouponListPage } | null;
};

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Kod ara', placeholder: 'Kupon kodu', minLength: 2 },
  {
    type: 'select',
    key: 'sort',
    label: 'Sıralama',
    allLabel: null,
    defaultValue: 'new',
    options: [
      { value: 'new', label: 'En yeni' },
      { value: 'used', label: 'En çok kullanılan' },
      { value: 'expiring', label: 'Bitişi yakın' },
    ],
  },
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const policy = useMotionPolicy();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Kopyalanamadı; kodu elle seçin.');
    }
  };
  return (
    <IconButton
      aria-label={done ? `${code} kopyalandı` : `${code} kodunu kopyala`}
      size="sm"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      icon={
        <AnimatePresence mode="wait" initial={false}>
          <Motion.span
            key={done ? 'ok' : 'copy'}
            initial={policy.reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={policy.reduce ? undefined : { scale: 0.6, opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            className="inline-flex"
          >
            {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Motion.span>
        </AnimatePresence>
      }
    />
  );
}

// Sunucu varsayılanı 25; DS varsayılan seçenekleri (10/20/50/100) 25'i içermediği için 'Sayfa başına' seçicisi boş görünüyordu.
const COUPON_PAGE_SIZES: readonly number[] = [10, COUPON_PAGE_SIZE, 50, 100];

export function CouponsCenter({ initial }: { initial: CouponsInitial }) {
  const qc = useQueryClient();
  const { get } = useUrlState();
  const stats = useQuery({ queryKey: couponKeys.stats(), queryFn: fetchCouponStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const s = stats.data;
  const sheet = useDetailSheet('kupon', { history: 'push' });
  const [editor, setEditor] = useState<CouponEditorTarget | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultPageSize: COUPON_PAGE_SIZE, pageSizeOptions: COUPON_PAGE_SIZES, defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: [] });
  const statusRaw = get('status');
  const status = ((COUPON_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? '') ? statusRaw : 'usable') as CouponStatusFilter;
  const sort = (str(filters.values.sort) || 'new') as CouponSort;
  const qs = couponQueryString({ q: str(filters.values.q), status, sort, page: table.params.page, size: table.params.pageSize });
  const list = useQuery({
    queryKey: couponKeys.list(qs),
    queryFn: ({ signal }) => fetchCoupons(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial.list && initial.list.qs === qs ? initial.list.page : undefined,
    staleTime: 15_000,
  });
  const counts = list.data?.counts ?? s?.counts;

  const columns = useMemo<ColumnDef<CouponListItem>[]>(
    () => [
      {
        id: 'code',
        header: 'Kod',
        enableHiding: false,
        enableSorting: false,
        meta: { mobile: 'title', label: 'Kod', interactive: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono font-semibold tracking-wider text-fg">{row.original.code}</span>
            <CopyCode code={row.original.code} />
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(COUPON_STATUS_MAP, row.original.status)} />,
      },
      {
        id: 'value',
        header: 'Değer',
        enableSorting: false,
        meta: { label: 'Değer', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="qx-num whitespace-nowrap text-sm">{formatCouponValue(row.original.type, row.original.value)}</span>,
      },
      {
        id: 'usage',
        header: 'Kod girişi',
        enableSorting: false,
        meta: { label: 'Kod girişi' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="min-w-[7rem] space-y-1 text-sm">
              <span className="qx-num block">
                {fmtNumber(c.usedCount)}
                <span className="text-fg-muted"> / {c.maxUses == null ? 'sınırsız' : fmtNumber(c.maxUses)}</span>
              </span>
              {c.maxUses != null ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className={`h-full rounded-full ${c.status === 'exhausted' ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${pct(c.usedCount, c.maxUses)}%` }} />
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'expiresAt',
        header: 'Son kullanım',
        enableSorting: false,
        meta: { label: 'Son kullanım' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.expiresAt ? (
            <time dateTime={row.original.expiresAt} className="whitespace-nowrap text-sm">
              {fmtDateTime(row.original.expiresAt)}
            </time>
          ) : (
            <span className="text-sm text-fg-muted"><AdminKutuKuponText k="noExpiry" /></span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only"><AdminKutuKuponText k="actions" /></span>,
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'actions', interactive: true, align: 'end', label: 'İşlemler' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <CouponActions coupon={row.original} compact />,
      },
    ],
    []
  );

  const filtered = !!str(filters.values.q);
  const exportHref = exportUrl(couponQueryString({ q: str(filters.values.q), status, sort }));

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Kuponlar"
          description="Kampanya kodlarını oluşturun, sürpriz kutuyla dağıtın, kullanımını ve geçmişini izleyin."
          icon={<Ticket />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: couponKeys.all })} aria-label="Kuponları yenile">
                <RefreshCw className={`h-4 w-4 ${list.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                Yenile
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" asChild>
                <a href={exportHref} download>
                  <Download className="h-4 w-4" aria-hidden />
                  CSV
                </a>
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setBatchOpen(true)}>
                <Layers className="h-4 w-4" aria-hidden />
                Toplu üret
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="h-4 w-4" aria-hidden />
                Yeni kupon
              </Button>
            </div>
          }
        />
      }
    >
      <div role="note" className="qx-small flex items-start gap-2 rounded-card border border-info-border bg-info-subtle px-4 py-3 text-fg">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <span className="min-w-0 flex-1">
          Qratex’te ödeme akışı yok: kupon indirimi otomatik uygulanmaz. Kod müşteriye{' '}
          <Link href="/admin/surprise-boxes" className="font-medium underline underline-offset-4">
            sürpriz kutuyla
          </Link>{' '}
          ulaşır, Ödüllerim’de saklanır ve kasada gösterilir; indirimi işletme uygular.
        </span>
      </div>

      {stats.isError ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile label="Kullanılabilir kod" metric={{ value: s?.counts.usable ?? null }} icon={<Ticket />} tone="success" loading={!s} animate href="?status=usable" />
          <MetricTile
            label="Kod girişi (7 gün)"
            metric={{ value: s?.redemptions7d ?? null, series: s?.redemptions14d }}
            icon={<TrendingUp />}
            tone="brand"
            loading={!s}
            sparklineLabel={s ? `Son 14 günün günlük kod girişi; toplam ${fmtNumber(s.redemptions14d.reduce((a, b) => a + b, 0))}` : undefined}
          />
          <MetricTile label="7 gün içinde bitecek" metric={{ value: s?.expiringSoon ?? null }} icon={<TimerOff />} tone={s && s.expiringSoon > 0 ? 'warning' : 'neutral'} loading={!s} hint="Kullanılabilir ve son kullanımı yaklaşan" />
          <MetricTile
            label="Kutuda bekleyen kupon"
            metric={{ value: s?.boxesPending ?? null }}
            icon={<Gift />}
            tone="info"
            loading={!s}
            hint={s ? `${fmtNumber(s.boxesOpened)} kutu açıldı` : undefined}
            href="/admin/surprise-boxes?status=pending"
          />
        </MetricGrid>
      )}

      <div className="space-y-4">
        <SectionTabs
          variant="pill"
          paramKey="status"
          defaultValue="usable"
          resetKeys={['page']}
          ariaLabel="Kupon durumu"
          tabs={[
            ...(['usable', 'exhausted', 'expired', 'inactive'] as const).map((v) => ({ value: v, label: STATUS_LABEL[v], count: counts?.[v] })),
            { value: 'all', label: 'Tümü', count: counts ? counts.usable + counts.exhausted + counts.expired + counts.inactive : undefined },
          ]}
        />
        <FilterBar fields={FIELDS} ariaLabel="Kupon filtreleri" resetKeys={['page']} />
        <p className="sr-only" aria-live="polite">
          {list.data ? `${fmtNumber(list.data.total)} kupon bulundu` : ''}
        </p>
        <DataTable
          ariaLabel="Kuponlar"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.code}
          manualPagination
          manualSorting
          manualFiltering
          rowCount={list.data?.total}
          pageSizeOptions={COUPON_PAGE_SIZES}
          {...table}
          filtered={filtered}
          activeRowId={sheet.id}
          onRowClick={(r) => sheet.open(r.id)}
          empty={
            filtered
              ? {
                  variant: 'filtered',
                  title: 'Aramaya uyan kupon yok',
                  secondaryAction: (
                    <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                      Aramayı temizle
                    </Button>
                  ),
                }
              : status === 'usable'
                ? {
                    title: 'Kullanılabilir kupon yok',
                    description: 'Yeni bir kampanya kodu oluşturun ya da tek kullanımlık kodları toplu üretin.',
                    secondaryAction: (
                      <Button className="min-h-11" onClick={() => setEditor({ mode: 'create' })}>
                        <Plus className="h-4 w-4" aria-hidden />
                        Yeni kupon
                      </Button>
                    ),
                  }
                : { title: status === 'all' ? 'Henüz kupon yok' : `“${STATUS_LABEL[status as Exclude<CouponStatusFilter, 'all'>]}” durumunda kupon yok` }
          }
        />
      </div>

      <DetailSheet paramKey="kupon" size="lg" history="push" title="Kupon ayrıntısı" description="Kullanım, dağıtım ve değişiklik geçmişi">
        {(id) => <CouponDetailBody id={id} onEdit={(cid) => setEditor({ mode: 'edit', id: cid })} />}
      </DetailSheet>

      <CouponEditor
        target={editor}
        onOpenChange={(o) => !o && setEditor(null)}
        onSaved={(id, mode) => {
          void qc.invalidateQueries({ queryKey: couponKeys.all });
          if (mode === 'create') sheet.open(id);
        }}
      />

      <CouponBatchDialog open={batchOpen} onOpenChange={setBatchOpen} onDone={() => void qc.invalidateQueries({ queryKey: couponKeys.all })} />
    </PanelPage>
  );
}
