'use client';

/**
 * /admin/dealers-health istemci adası — KPI bant kutuları (tıklayınca süzer), URL'de kalıcı
 * filtre/sıralama/sayfa, yoğun tablo (mobilde kart), detay çekmecesi (?dealer=), playbook
 * kütüphanesi sekmesi ve bağlamlı uygula diyaloğu. İlk sayfa sunucuda hesaplanıp gelir.
 */
import { Suspense, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, Download, Eye, Gauge, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader, FilterBar, SectionTabs, useFilterState, type FilterField } from '@/components/ds/page';
import { DataTable, DetailSheet, MetricGrid, MetricTile, StatusBadge, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { useDsLocale, announce } from '@/components/ds/a11y';
import { getPlaybookById } from '@/lib/growth-playbooks';
import {
  BAND_KEYS,
  FLAG_KEYS,
  SORT_KEYS,
  isBand,
  listKey,
  parseWindow,
  type HealthBand,
  type HealthFlag,
  type HealthRow,
  type HealthWindow,
} from '../domain';
import { HEALTH_COPY, type HealthCopy } from '../copy';
import { exportUrl, fetchHealthList, type HealthListResult, type ListParamsInput } from '../client/api';
import { ScoreBadge, DeltaChip, MiniStack, BAND_TONE } from './score-parts';
import { DealerDetail } from './dealer-detail';
import { ApplyPlaybookDialog, type ApplyTarget } from './apply-dialog';
import { PlaybookLibraryView } from './playbook-library';

export interface InitialList {
  key: string;
  data: HealthListResult;
}


const BAND_ICON = { critical: AlertOctagon, at_risk: AlertTriangle, watch: Eye, healthy: CheckCircle2 } as const;

export function DealersHealthClient({ initial }: { initial: InitialList | null }) {
  return (
    <Suspense fallback={null}>
      <Inner initial={initial} />
    </Suspense>
  );
}

function fmtTime(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));
}

function Inner({ initial }: { initial: InitialList | null }) {
  const locale = useDsLocale();
  const c = HEALTH_COPY[locale];
  const sp = useSearchParams();
  const pathname = usePathname();
  const sheet = useDetailSheet('dealer', { history: 'push' });
  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);

  const period = parseWindow(sp.get('window'));
  const header = (
    <PageHeader
      eyebrow={c.eyebrow}
      title={c.title}
      description={c.description}
      icon={<Activity className="h-5 w-5" />}
    />
  );

  return (
    <PanelPage register="ops" width="wide" header={header}>
      <SectionTabs
        ariaLabel={c.title}
        resetKeys={['page', 'dealer']}
        tabs={[
          { value: 'dealers', label: c.tabs.dealers },
          { value: 'playbooks', label: c.tabs.playbooks },
        ]}
      >
        {(active) =>
          active === 'playbooks' ? (
            <PlaybookLibraryView c={c} onApply={setApplyTarget} onOpenDealer={(id) => sheet.open(id)} />
          ) : (
            <DealersTab c={c} locale={locale} initial={initial} period={period} onOpen={(id) => sheet.open(id)} activeId={sheet.id} pathname={pathname} />
          )
        }
      </SectionTabs>

      <DetailSheet paramKey="dealer" size="lg" title={c.detail.title}>
        {(id) => <DealerDetail dealerId={id} window={period} c={c} locale={locale} onApply={setApplyTarget} />}
      </DetailSheet>

      <ApplyPlaybookDialog target={applyTarget} onClose={() => setApplyTarget(null)} c={c} />
    </PanelPage>
  );
}

function DealersTab({
  c,
  locale,
  initial,
  period,
  onOpen,
  activeId,
  pathname,
}: {
  c: HealthCopy;
  locale: 'tr' | 'en';
  initial: InitialList | null;
  period: HealthWindow;
  onOpen: (id: string) => void;
  activeId: string | null;
  pathname: string;
}) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: c.search.label, placeholder: c.search.placeholder, debounceMs: 300 },
      {
        type: 'select',
        key: 'window',
        label: c.window.label,
        options: [
          { value: '7', label: c.window.d7 },
          { value: '30', label: c.window.d30 },
          { value: '90', label: c.window.d90 },
        ],
        allLabel: null,
        defaultValue: '30',
      },
      { type: 'select', key: 'band', label: c.bandFilter, options: BAND_KEYS.map((b) => ({ value: b, label: c.bands[b] })) },
      { type: 'select', key: 'flag', label: c.flagFilter, options: FLAG_KEYS.map((f) => ({ value: f, label: c.flags[f] })) },
    ],
    [c]
  );
  const filters = useFilterState(fields);
  const table = useUrlTableState({ defaultSort: [{ id: 'score', desc: false }], sortableIds: SORT_KEYS });

  const band = typeof filters.values.band === 'string' && isBand(filters.values.band) ? (filters.values.band as HealthBand) : '';
  const flagRaw = typeof filters.values.flag === 'string' ? filters.values.flag : '';
  const flag = (FLAG_KEYS as readonly string[]).includes(flagRaw) ? (flagRaw as HealthFlag) : '';
  const params: ListParamsInput = {
    window: period,
    q: typeof filters.values.q === 'string' ? filters.values.q : '',
    band,
    flag,
    sort: table.params.sort,
    page: table.params.page,
    size: table.params.pageSize,
  };
  const key = listKey(params);
  const q = useQuery({
    queryKey: ['dealer-health', 'list', key],
    queryFn: ({ signal }) => fetchHealthList(params, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.key === key ? initial.data : undefined,
    staleTime: 30_000,
  });

  const [recomputing, setRecomputing] = useState(false);
  const recompute = async () => {
    setRecomputing(true);
    try {
      const fresh = await fetchHealthList({ ...params, fresh: true });
      qc.setQueryData(['dealer-health', 'list', key], fresh);
      void qc.invalidateQueries({ queryKey: ['dealer-health'], predicate: (qq) => qq.queryKey[1] !== 'list' || qq.queryKey[2] !== key });
      announce(c.computedAt(fmtTime(fresh.computedAt, locale)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecomputing(false);
    }
  };

  const bandHref = (b: HealthBand) => {
    const next = new URLSearchParams(sp.toString());
    if (band === b) next.delete('band');
    else next.set('band', b);
    next.delete('page');
    next.delete('dealer');
    return `${pathname}?${next.toString()}`;
  };

  const columns = useMemo<ColumnDef<HealthRow>[]>(() => buildColumns(c, onOpen), [c, onOpen]);
  const data = q.data;
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted" aria-live="polite">
          {data ? c.computedAt(fmtTime(data.computedAt, locale)) : ' '}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={recompute} disabled={recomputing}>
            {recomputing ? (
              <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
            )}
            {recomputing ? c.refreshing : c.refresh}
          </Button>
          <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <a href={exportUrl(params)} download>
              <Download aria-hidden className="mr-1.5 h-4 w-4" />
              {c.exportCsv}
            </a>
          </Button>
        </div>
      </div>

      <MetricGrid cols={5}>
        {BAND_KEYS.map((b) => {
          const Icon = BAND_ICON[b];
          return (
            <MetricTile
              key={b}
              label={c.bands[b]}
              icon={<Icon className="h-4 w-4" />}
              tone={BAND_TONE[b]}
              metric={{ value: summary ? summary.bands[b] : null }}
              hint={c.kpi.bandHint(c.bandRange[b])}
              href={bandHref(b)}
              loading={!summary}
              size="compact"
              className={band === b ? 'ring-2 ring-focus' : undefined}
            />
          );
        })}
        <MetricTile
          label={c.kpi.avg}
          icon={<Gauge className="h-4 w-4" />}
          metric={{
            value: summary?.avgScore ?? null,
            fractionDigits: 1,
            delta: summary?.avgDelta != null ? { value: summary.avgDelta, kind: 'absolute', label: c.kpi.deltaLabel } : null,
          }}
          hint={summary ? `${c.kpi.avgHint(summary.total)} · ${c.kpi.silent}: ${summary.silent} · ${c.kpi.playbook}: ${summary.withPlaybook}` : undefined}
          loading={!summary}
          size="compact"
        />
      </MetricGrid>

      <FilterBar fields={fields} resetKeys={['page', 'dealer']} ariaLabel={c.flagFilter} />

      <DataTable
        ariaLabel={c.table.aria}
        columns={columns}
        data={data?.items}
        query={q}
        getRowId={(r) => r.dealerId}
        getRowLabel={(r) => r.label}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: c.empty.filtered, description: c.empty.filteredHint, action: <Button variant="outline" onClick={filters.clear} className="min-h-11">{locale === 'en' ? 'Clear filters' : 'Süzgeçleri temizle'}</Button> }
            : { variant: 'first-use', title: c.empty.none, description: c.empty.noneHint }
        }
        errorProps={{ title: c.errors.load }}
        onRowClick={(r) => onOpen(r.dealerId)}
        activeRowId={activeId}
        density="compact"
      />
    </div>
  );
}

function buildColumns(c: HealthCopy, onOpen: (id: string) => void): ColumnDef<HealthRow>[] {
  const meta = (m: DataTableColumnMeta) => m;
  const pct = (v: number | null) => (v == null ? c.table.none : c.pct(Math.round(v)));
  return [
    {
      id: 'label',
      accessorKey: 'label',
      header: c.table.dealer,
      meta: meta({ mobile: 'title' }),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.original.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {row.original.silent && <StatusBadge size="sm" tone="warning" label={c.table.silent} />}
            {row.original.confidence === 'low' && !row.original.silent && (
              <StatusBadge size="sm" tone="neutral" icon={null} label={c.table.lowConfidence} title={c.table.lowConfidenceHint(row.original.reviews)} />
            )}
            {row.original.fraudStatus !== 'clean' && <StatusBadge size="sm" tone="danger" label={c.fraud[row.original.fraudStatus] ?? row.original.fraudStatus} />}
          </div>
        </div>
      ),
    },
    {
      id: 'score',
      accessorKey: 'score',
      header: c.table.score,
      meta: meta({ mobile: 'subtitle' }),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <ScoreBadge score={row.original.score} band={row.original.band} c={c} size="sm" />
          <MiniStack components={row.original.components} />
        </div>
      ),
    },
    {
      id: 'delta',
      accessorKey: 'delta',
      header: c.table.delta,
      meta: meta({ numeric: true, mobile: 'field', label: c.table.delta }),
      cell: ({ row }) => <DeltaChip delta={row.original.delta} c={c} />,
    },
    {
      id: 'reason',
      header: c.table.reason,
      enableSorting: false,
      meta: meta({ mobile: 'field', label: c.table.reason }),
      cell: ({ row }) =>
        row.original.topLoss ? (
          <span className="text-sm text-fg">
            {c.components[row.original.topLoss.key]} <span className="tabular-nums text-fg-muted">−{row.original.topLoss.lost}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">{c.table.none}</span>
        ),
    },
    {
      id: 'reviews',
      accessorKey: 'reviews',
      header: c.table.reviews,
      meta: meta({ numeric: true, mobile: 'hidden' }),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.reviews}
          {row.original.rawRating != null && <span className="ml-1 text-fg-muted">· {row.original.rawRating.toFixed(1)}★</span>}
        </span>
      ),
    },
    {
      id: 'replyRate',
      accessorKey: 'replyRate',
      header: c.table.reply,
      meta: meta({ numeric: true, mobile: 'hidden' }),
      cell: ({ row }) => <span className="tabular-nums">{pct(row.original.replyRate)}</span>,
    },
    {
      id: 'activity',
      accessorKey: 'activity',
      header: c.table.activity,
      meta: meta({ numeric: true, mobile: 'hidden' }),
      cell: ({ row }) => (
        <span className="tabular-nums" title={`${row.original.prevActivity} → ${row.original.activity}`}>
          {row.original.activity}
        </span>
      ),
    },
    {
      id: 'openIncidents',
      accessorKey: 'openIncidents',
      header: c.table.incidents,
      meta: meta({ numeric: true, mobile: 'field', label: c.table.incidents }),
      cell: ({ row }) => (
        <span className={row.original.severeIncidents > 0 ? 'font-semibold tabular-nums text-danger' : 'tabular-nums'}>{row.original.openIncidents}</span>
      ),
    },
    {
      id: 'remedyQueue',
      accessorKey: 'remedyQueue',
      header: c.table.remedy,
      meta: meta({ numeric: true, mobile: 'hidden' }),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.remedyQueue}
          {row.original.remedyOldestHours != null && <span className="ml-1 text-xs text-fg-muted">({c.table.hours(row.original.remedyOldestHours)})</span>}
        </span>
      ),
    },
    {
      id: 'next',
      header: c.table.next,
      enableSorting: false,
      meta: meta({ mobile: 'field', label: c.table.next }),
      cell: ({ row }) => {
        const rec = row.original.recommendations[0];
        if (!rec) return <span className="text-fg-subtle">{c.table.none}</span>;
        const label = rec.kind === 'playbook' ? (getPlaybookById(rec.id)?.title ?? rec.id) : c.recos.action[rec.id].title;
        return <span className="line-clamp-2 text-sm text-fg">{label}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: meta({ mobile: 'actions', interactive: true, label: c.table.open }),
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" aria-label={`${c.table.open}: ${row.original.label}`} onClick={() => onOpen(row.original.dealerId)}>
          {c.table.open}
        </Button>
      ),
    },
  ];
}
