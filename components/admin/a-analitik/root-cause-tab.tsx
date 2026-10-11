'use client';

/**
 * Kök neden dökümü (B-17: "Konu → Şube → Zaman" nedensellik ima eden zincir yerine dürüst döküm).
 * Pay = konusu belirlenmiş olumsuz QR geri bildirimlerinin %'si (keyfi ×1000 etki puanı yok);
 * gün dilimleri İstanbul saatiyle, "Gece" kovası ayrı (B-4); konu anahtarları Türkçe etiketli;
 * bayi adları o bayinin geri bildirim listesine iner.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ThumbsDown } from 'lucide-react';
import { DataTable, MetricGrid, MetricTile, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { DAY_PARTS, type AdminRootCause, type RootCauseTopic } from '@/lib/admin-analytics/types';
import { fmtNumber, fmtPercent, fmtSigned, topicLabel, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

export function RootCauseTab({ data }: { data: AdminRootCause }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const q = data.query;
  const label = q.compare === 'none' ? null : q.compare === 'yoy' ? copy.vsYoy : copy.vsPrevious;

  const columns = useMemo<ColumnDef<RootCauseTopic>[]>(() => {
    const num = (l: string): DataTableColumnMeta => ({ label: l, numeric: true });
    return [
      {
        id: 'topic',
        accessorFn: (r) => topicLabel(r.key, locale),
        header: copy.colTopic,
        meta: { label: copy.colTopic, mobile: 'title' } satisfies DataTableColumnMeta,
      },
      { accessorKey: 'count', header: copy.colNegative, meta: num(copy.colNegative), cell: ({ getValue }) => fmtNumber(getValue<number>(), locale) },
      { accessorKey: 'share', header: copy.colShare, meta: num(copy.colShare), cell: ({ getValue }) => fmtPercent(getValue<number>(), locale) },
      ...(q.compare !== 'none'
        ? ([
            {
              accessorKey: 'deltaPct',
              header: copy.colChange,
              meta: num(copy.colChange),
              cell: ({ row }) =>
                row.original.deltaPct == null
                  ? row.original.previous === 0
                    ? `${fmtNumber(0, locale)} → ${fmtNumber(row.original.count, locale)}`
                    : '—'
                  : `${fmtSigned(row.original.deltaPct, locale)}%`,
            },
          ] as ColumnDef<RootCauseTopic>[])
        : []),
      ...DAY_PARTS.map(
        (part) =>
          ({
            id: `part-${part}`,
            accessorFn: (r: RootCauseTopic) => r.dayParts[part],
            header: copy.dayParts[part],
            meta: num(copy.dayParts[part]),
            cell: ({ getValue }: { getValue: () => unknown }) => fmtNumber(getValue() as number, locale),
          }) as ColumnDef<RootCauseTopic>,
      ),
      {
        id: 'dealers',
        header: copy.colTopDealers,
        enableSorting: false,
        meta: { label: copy.colTopDealers, interactive: true } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.dealers.length === 0 ? (
            '—'
          ) : (
            <ul className="flex flex-wrap gap-x-2 gap-y-1">
              {row.original.dealers.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/feedbacks?search=${encodeURIComponent(d.name)}`} className="text-brand-text underline-offset-4 hover:underline">
                    {d.name || copy.unnamed}
                  </Link>{' '}
                  <span className="qx-num text-fg-subtle">({fmtNumber(d.count, locale)})</span>
                </li>
              ))}
            </ul>
          ),
      },
    ];
  }, [copy, locale, q.compare]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <MetricGrid cols={2}>
        <MetricTile
          label={copy.rootNegative}
          icon={<ThumbsDown />}
          tone="danger"
          metric={{
            value: data.negative.current,
            delta: label && data.negative.deltaPct != null ? { value: data.negative.deltaPct, kind: 'percent', goodDirection: 'down', label } : null,
          }}
        />
      </MetricGrid>
      {q.source === 'consumption' && (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)} role="note">
          {copy.rootOnlyQr}
        </p>
      )}
      <SectionCard title={copy.rootTitle} description={`${copy.rootDescription} ${copy.rootBase(fmtNumber(data.topicBase, locale))}`} density="flush">
        <DataTable<RootCauseTopic>
          ariaLabel={copy.rootTitle}
          columns={columns}
          data={data.topics}
          getRowId={(r) => r.key}
          getRowLabel={(r) => topicLabel(r.key, locale)}
          empty={{ title: copy.rootEmpty }}
          paginated={false}
        />
      </SectionCard>
    </div>
  );
}
