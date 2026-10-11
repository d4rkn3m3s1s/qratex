'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, useUrlState, type FilterField } from '@/components/ds/page';
import { DataTable, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { QueryState, TONE_CALLOUT, type Tone } from '@/components/states';
import { AUTH_LABEL, type CatalogPayload, type CatalogRoute } from '@/lib/integrations/catalog';
import { cn } from '@/lib/utils';
import { copyText, fetchCatalog, intKeys } from './api';
import { fmtAbs, fmtNum, fmtRel } from './format';
import { AdminEntegrasyonlarText } from './copy';

const METHOD_TONE: Record<string, Tone> = { GET: 'info', POST: 'success', PUT: 'warning', PATCH: 'warning', DELETE: 'danger' };
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function CopyPath({ path }: { path: string }) {
  const [s, setS] = useState<'idle' | 'ok' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-2 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
      aria-label={`Yolu kopyala: ${path}`}
      onClick={async () => {
        setS((await copyText(path)) ? 'ok' : 'failed');
        window.setTimeout(() => setS('idle'), 1500);
      }}
    >
      {s === 'ok' ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {s === 'ok' ? 'Kopyalandı' : s === 'failed' ? 'Kopyalanamadı' : ''}
      </span>
    </button>
  );
}

function PathText({ path }: { path: string }) {
  return (
    <span className="break-all font-mono text-sm">
      {path.split(/(\[[^\]]+\])/).map((seg, i) =>
        /^\[.+\]$/.test(seg) ? (
          <span key={i} className="rounded bg-brand-subtle px-0.5 text-brand">
            {seg}
          </span>
        ) : (
          <span key={i}>{seg}</span>
        )
      )}
    </span>
  );
}

/** Admin API kataloğu: alan/yöntem/erişim filtresi, URL durumu, filtrelenmiş JSON dışa aktarımı. */
export function CatalogTab() {
  const q = useQuery({ queryKey: intKeys.catalog(), queryFn: ({ signal }) => fetchCatalog(signal), staleTime: Infinity });
  return (
    <QueryState query={q} skeleton="table">
      {(data) => <CatalogView data={data} />}
    </QueryState>
  );
}

function CatalogView({ data }: { data: CatalogPayload }) {
  const { get } = useUrlState();
  const search = (get('cq') ?? '').toLowerCase();
  const domain = get('cdomain') ?? '';
  const methods = (get('cmethod') ?? '').split(',').filter(Boolean);
  const access = get('cauth') ?? '';

  const domains = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.routes) m.set(r.domain, (m.get(r.domain) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [data.routes]);

  const fields: FilterField[] = [
    { type: 'search', key: 'cq', label: 'Yol ya da dosya ara', placeholder: 'ör. users/[id]' },
    { type: 'select', key: 'cdomain', label: 'Alan', allLabel: 'Tüm alanlar', options: domains.map(([d, n]) => ({ value: d, label: `${d} (${n})` })) },
    { type: 'select', key: 'cmethod', label: 'Yöntem', multiple: true, options: METHODS.map((m) => ({ value: m, label: m })) },
    ...(data.hasAuthInfo
      ? [
          {
            type: 'select' as const,
            key: 'cauth',
            label: 'Erişim',
            allLabel: 'Tüm erişimler',
            options: (['role', 'team', 'cron', 'public', 'none'] as const).map((k) => ({ value: k, label: AUTH_LABEL[k] })),
          },
        ]
      : []),
  ];

  const rows = useMemo(
    () =>
      data.routes.filter(
        (r) =>
          (!search || r.path.toLowerCase().includes(search) || r.file.toLowerCase().includes(search)) &&
          (!domain || r.domain === domain) &&
          (methods.length === 0 || methods.some((m) => r.methods.includes(m))) &&
          (!access || r.auth.kind === access)
      ),
    [data.routes, search, domain, methods, access]
  );

  const unprotected = data.routes.filter((r) => r.auth.kind === 'none').length;
  const undetected = data.routes.filter((r) => r.undetected).length;
  const writes = data.routes.filter((r) => r.methods.some((m) => m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS')).length;

  const columns = useMemo<ColumnDef<CatalogRoute>[]>(
    () => [
      {
        id: 'methods',
        header: 'Yöntem',
        meta: { mobile: 'field', label: 'Yöntem' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.undetected ? (
            <StatusBadge size="sm" tone="warning" label="Tespit edilemedi" />
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.methods.map((m) => (
                <StatusBadge key={m} size="sm" tone={METHOD_TONE[m] ?? 'neutral'} icon={null} label={m} />
              ))}
            </div>
          ),
      },
      {
        id: 'path',
        header: 'Yol',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <PathText path={row.original.path} />
            <p className="truncate font-mono text-xs text-fg-muted" title={row.original.file}>
              {row.original.file}
            </p>
          </div>
        ),
      },
      {
        id: 'auth',
        header: 'Erişim',
        meta: { mobile: 'field', label: 'Erişim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const a = row.original.auth;
          const tone: Tone = a.kind === 'none' ? 'danger' : a.kind === 'unknown' ? 'neutral' : a.kind === 'public' ? 'warning' : 'info';
          return <StatusBadge size="sm" tone={tone} icon={null} label={a.roles?.length ? a.roles.join(', ') : AUTH_LABEL[a.kind]} />;
        },
      },
      {
        id: 'usedBy',
        header: 'Kullanan',
        meta: { mobile: 'field', label: 'Kullanan' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          data.hasUsageInfo ? (
            row.original.usedBy.length ? (
              <span className="text-xs text-fg-muted" title={row.original.usedBy.join('\n')}>
                {row.original.usedBy.length} dosya
              </span>
            ) : (
              <span className="text-xs text-warning"><AdminEntegrasyonlarText k="noAdminRef" /></span>
            )
          ) : (
            <span className="text-xs text-fg-muted">—</span>
          ),
      },
      {
        id: 'copy',
        header: '',
        enableHiding: false,
        meta: { mobile: 'actions', interactive: true, label: 'Kopyala' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <CopyPath path={row.original.path} />,
      },
    ],
    [data.hasUsageInfo]
  );

  const download = () => {
    const blob = new Blob([JSON.stringify({ generatedAt: data.generatedAt, filtered: rows.length !== data.routes.length, routes: rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-api-katalogu-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard
      title="Admin API kataloğu"
      description="app/api/admin altındaki uçların canlı haritası: yöntem, erişim modeli ve kullanan panel dosyaları. Katalog her dağıtımda (prebuild) yeniden üretilir; admin uçları OpenAPI'de belgelenmemiştir."
      actions={
        <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={download}>
          <Download className="h-4 w-4" aria-hidden />
          JSON indir {rows.length !== data.routes.length ? `(${fmtNum(rows.length)})` : ''}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge tone="neutral" icon={null} label={`${fmtNum(rows.length)} / ${fmtNum(data.routes.length)} uç`} />
          <StatusBadge tone="info" icon={null} label={`${fmtNum(writes)} yazma ucu`} />
          {data.hasAuthInfo ? <StatusBadge tone={unprotected ? 'danger' : 'success'} label={unprotected ? `${unprotected} korumasız uç` : 'Korumasız uç yok'} /> : null}
          {undetected ? <StatusBadge tone="warning" label={`${undetected} uçta yöntem tespit edilemedi`} /> : null}
          {data.generatedAt ? (
            <span className="self-center text-xs text-fg-muted">
              Üretim: <time dateTime={data.generatedAt} title={fmtAbs(data.generatedAt)}>{fmtRel(data.generatedAt)}</time>
            </span>
          ) : null}
        </div>
        {!data.hasAuthInfo ? (
          <p className={cn('rounded-card border p-3 text-sm', TONE_CALLOUT.info)}>
            Bu katalog eski üreticiyle oluşturuldu; erişim modeli ve “kullanan” bilgisi bir sonraki dağıtımda otomatik eklenecek.
          </p>
        ) : null}
        <FilterBar fields={fields} />
        <DataTable
          ariaLabel="Admin API uçları"
          columns={columns}
          data={rows}
          getRowId={(r) => r.path}
          filtered={Boolean(search || domain || methods.length || access)}
          defaultPageSize={50}
          empty={{ title: 'Eşleşen uç yok', description: 'Filtreleri gevşetin ya da aramayı temizleyin.' }}
        />
      </div>
    </SectionCard>
  );
}
