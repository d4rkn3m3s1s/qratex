'use client';

/**
 * Sektör karşılaştırması (eski /admin/insights burada bir kırılım boyutu — yol haritası §6.3).
 * insights B3: sektör `categorizeDealer` ile türetilir; "sektörü belirsiz" oranı en üstte.
 * B5: odak önerisi açıklanabilir kural (z ≤ −2, n ≥ 30, ≥ 3 aktif bayi) ve gerekçesiyle.
 * B6: puan yoksa "—", sayılar `Intl` ile. B7: k < 3 bayi "örneklem küçük" (soluk, dışa açılmaz).
 */
import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Lightbulb, Shapes, Star, Tags } from 'lucide-react';
import { DataTable, MetricGrid, MetricTile, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { adminAnalyticsSearchString } from '@/lib/admin-analytics/params';
import type { AdminSectors, SectorRow } from '@/lib/admin-analytics/types';
import { fmtNumber, fmtRating, fmtSigned, sectorLabel, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

export function SectorsTab({ data }: { data: AdminSectors }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const hasCompare = data.query.compare !== 'none';

  const columns = useMemo<ColumnDef<SectorRow>[]>(() => {
    const num = (label: string): DataTableColumnMeta => ({ label, numeric: true });
    return [
      {
        id: 'sector',
        accessorFn: (r) => sectorLabel(r.sector === 'none' ? null : r.sector, locale),
        header: copy.colSector,
        meta: { label: copy.colSector, mobile: 'title', interactive: true } satisfies DataTableColumnMeta,
        cell: ({ row, getValue }) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/analytics?${adminAnalyticsSearchString({ ...data.query, sector: row.original.sector }, { tab: 'dealers' })}`}
              className={cn('font-medium underline-offset-4 hover:underline', row.original.lowSample ? 'text-fg-muted' : 'text-fg')}
            >
              {getValue<string>()}
            </Link>
            {row.original.lowSample && <StatusBadge label={copy.lowSample} tone="warning" size="sm" title={copy.lowSampleHint(fmtNumber(data.kMin, locale))} />}
          </span>
        ),
      },
      { accessorKey: 'dealerCount', header: copy.colDealers, meta: num(copy.colDealers), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      { accessorKey: 'activeDealers', header: copy.colActiveDealers, meta: num(copy.colActiveDealers), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      { accessorKey: 'n', header: copy.colN, meta: num(copy.colN), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      { accessorKey: 'avgRating', header: copy.colAvg, meta: num(copy.colAvg), cell: ({ getValue }) => fmtRating(getValue<number | null>(), locale) },
      { accessorKey: 'dealerAvgRating', header: copy.colDealerAvg, meta: num(copy.colDealerAvg), cell: ({ getValue }) => fmtRating(getValue<number | null>(), locale) },
      { accessorKey: 'scans', header: copy.colScans, meta: num(copy.colScans), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      ...(hasCompare
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
            { accessorKey: 'deltaAvg', header: copy.colAvgDelta, meta: num(copy.colAvgDelta), cell: ({ getValue }) => fmtSigned(getValue<number | null>(), locale, 2) },
          ] as ColumnDef<SectorRow>[])
        : []),
      { accessorKey: 'z', header: copy.colZ, meta: num(copy.colZ), cell: ({ getValue }) => fmtSigned(getValue<number | null>(), locale, 2) },
    ];
  }, [copy, locale, hasCompare, data.kMin, data.query]);

  const focus = data.focus;

  return (
    <div className="space-y-4 sm:space-y-6">
      {data.query.sector && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {copy.sectorsNoFilter}
        </p>
      )}
      <MetricGrid cols={3}>
        <MetricTile
          label={copy.sectorsUncategorized}
          icon={<Tags />}
          tone={data.uncategorized > 0 ? 'warning' : 'success'}
          metric={{ value: data.uncategorized }}
          hint={copy.assignHint}
        />
        <MetricTile label={copy.sectorsCategorized} icon={<Shapes />} tone="brand" metric={{ value: data.categorizedShare, format: 'percent' }} hint={`${fmtNumber(data.totalDealers, locale)} ${copy.colDealers.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')}`} />
        <MetricTile label={copy.sectorsPlatformAvg} icon={<Star />} tone="warning" metric={{ value: data.platformAvg, fractionDigits: 2 }} />
      </MetricGrid>

      <SectionCard title={copy.focusTitle} icon={<Lightbulb className="h-4 w-4" aria-hidden />} tone={focus ? 'warning' : 'neutral'}>
        {focus ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="qx-small text-fg">
              {copy.focusText(
                sectorLabel(focus.sector, locale),
                fmtRating(focus.avgRating, locale),
                fmtRating(focus.platformAvg, locale),
                fmtNumber(focus.n, locale),
                fmtNumber(focus.dealers, locale),
              )}
            </p>
            <Button asChild variant="outline" size="sm" className="h-11 shrink-0 sm:h-9">
              <Link href="/admin/playbooks">{copy.focusAction}</Link>
            </Button>
          </div>
        ) : (
          <p className="qx-small text-fg-muted">{copy.focusNone}</p>
        )}
      </SectionCard>

      <SectionCard title={copy.sectorsTitle} description={copy.sectorsDescription} density="flush">
        <DataTable<SectorRow>
          ariaLabel={copy.sectorsTitle}
          columns={columns}
          data={data.rows}
          getRowId={(r) => r.sector}
          getRowLabel={(r) => sectorLabel(r.sector === 'none' ? null : r.sector, locale)}
          empty={{ title: copy.sectorsEmpty }}
          paginated={false}
        />
      </SectionCard>
    </div>
  );
}
