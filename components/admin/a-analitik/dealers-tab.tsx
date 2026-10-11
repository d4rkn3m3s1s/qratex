'use client';

/**
 * Bayi kıyası (eski "En İyi Bayiler" + "Tenant Benchmark ve Anomali" tek tabloda).
 * B-1: dönem içi TÜM bayilerden, Bayes düzeltmeli puanla sıralı (az örneklemli bayi listeyi
 * ele geçirmez). B-9: verisi olmayan/az olan bayi kıyasa girmez, ayrı sayılır; sapma bayinin
 * kendisi hariç grupla, simetrik ve açıklanmış eşikle. Sıralanabilir, aranabilir, sayfalı tablo;
 * mobilde kart listesi. Her satır o bayinin geri bildirim listesine iner (drill-down).
 */
import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { DataTable, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import type { Tone } from '@/components/states';
import { Input } from '@/components/ui/input';
import { normalizeText } from '@/lib/places/categories';
import type { AdminDealers, BenchmarkStatus, DealerRow } from '@/lib/admin-analytics/types';
import { fmtNumber, fmtPercent, fmtRating, fmtSigned, sectorLabel, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

const STATUS_TONE: Record<BenchmarkStatus, Tone> = {
  low: 'danger',
  high: 'success',
  normal: 'neutral',
  'no-peers': 'info',
  insufficient: 'warning',
};

export function DealersTab({ data }: { data: AdminDealers }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const [term, setTerm] = useState('');

  const rows = useMemo(() => {
    const t = normalizeText(term);
    if (!t) return data.rows;
    return data.rows.filter((r) => normalizeText(r.name || '').includes(t) || normalizeText(sectorLabel(r.sector, locale)).includes(t));
  }, [data.rows, term, locale]);

  const columns = useMemo<ColumnDef<DealerRow>[]>(() => {
    const num = (label: string, extra: Partial<DataTableColumnMeta> = {}): DataTableColumnMeta => ({ label, numeric: true, ...extra });
    return [
      {
        id: 'name',
        accessorFn: (r) => r.name || copy.unnamed,
        header: copy.colDealer,
        meta: { label: copy.colDealer, mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const name = row.original.name || copy.unnamed;
          return (
            <Link
              href={`/admin/feedbacks?search=${encodeURIComponent(row.original.name)}`}
              className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copy.openFeedbacks(name)}
            >
              {name}
            </Link>
          );
        },
      },
      {
        id: 'sector',
        accessorFn: (r) => sectorLabel(r.sector, locale),
        header: copy.colSector,
        meta: { label: copy.colSector, mobile: 'subtitle' } satisfies DataTableColumnMeta,
      },
      { accessorKey: 'n', header: copy.colN, meta: num(copy.colN), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      { accessorKey: 'avgRating', header: copy.colAvg, meta: num(copy.colAvg), sortUndefined: 'last', cell: ({ getValue }) => fmtRating(getValue<number | null>(), locale) },
      { accessorKey: 'bayesRating', header: copy.colBayes, meta: num(copy.colBayes), cell: ({ getValue }) => fmtRating(getValue<number | null>(), locale) },
      { accessorKey: 'positiveShare', header: copy.colPositive, meta: num(copy.colPositive), cell: ({ getValue }) => fmtPercent(getValue<number | null>(), locale) },
      { accessorKey: 'negativeShare', header: copy.colNegativeShare, meta: num(copy.colNegativeShare), cell: ({ getValue }) => fmtPercent(getValue<number | null>(), locale) },
      ...(data.query.compare !== 'none'
        ? ([
            {
              accessorKey: 'deltaPct',
              header: copy.colChange,
              meta: num(copy.colChange),
              cell: ({ getValue }) => {
                const v = getValue<number | null>();
                return v == null ? '—' : `${fmtSigned(v, locale)}%`;
              },
            },
          ] as ColumnDef<DealerRow>[])
        : []),
      {
        accessorKey: 'segmentAvg',
        header: copy.colSegment,
        meta: num(copy.colSegment),
        cell: ({ row }) =>
          row.original.segmentAvg == null ? (
            '—'
          ) : (
            <span>
              {fmtRating(row.original.segmentAvg, locale)}{' '}
              <span className="qx-caption text-fg-subtle">({row.original.segmentScope === 'sector' ? copy.segmentSector : copy.segmentPlatform})</span>
            </span>
          ),
      },
      { accessorKey: 'z', header: copy.colZ, meta: num(copy.colZ), cell: ({ getValue }) => fmtSigned(getValue<number | null>(), locale, 2) },
      {
        accessorKey: 'status',
        header: copy.colStatus,
        meta: { label: copy.colStatus } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => {
          const s = getValue<BenchmarkStatus>();
          return <StatusBadge label={copy.status[s]} tone={STATUS_TONE[s]} size="sm" />;
        },
      },
    ];
  }, [copy, locale, data.query.compare]);

  const notes: ReactNode[] = [];
  if (data.insufficient > 0) notes.push(copy.dealersInsufficient(fmtNumber(data.insufficient, locale)));
  if (data.silent > 0) notes.push(copy.dealersSilent(fmtNumber(data.silent, locale)));

  return (
    <SectionCard
      title={copy.dealersTitle}
      description={`${copy.dealersDescription(fmtNumber(data.minN, locale), fmtNumber(data.thresholds.minPeers, locale))} ${copy.dealersThresholds(fmtSigned(data.thresholds.low, locale), fmtSigned(data.thresholds.high, locale))}`}
      density="flush"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">{copy.searchDealers}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={copy.searchDealers} className="h-11 pl-9 sm:h-9" type="search" />
        </label>
        <p className="qx-caption text-fg-muted">
          {copy.sectorsPlatformAvg}: <span className="qx-num font-medium text-fg">{fmtRating(data.platformAvg, locale)}</span>
          {notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
        </p>
      </div>
      <DataTable<DealerRow>
        ariaLabel={copy.dealersTitle}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name || copy.unnamed}
        filtered={term.length > 0}
        empty={{ title: copy.dealersEmpty }}
        defaultPageSize={25}
      />
    </SectionCard>
  );
}
