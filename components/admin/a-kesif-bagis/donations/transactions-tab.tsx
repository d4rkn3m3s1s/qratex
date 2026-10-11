'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { useUrlState } from '@/components/ds/page';
import { buildTxQs, type TransactionRow } from '@/lib/admin-donations/contract';
import { donationKeys, exportUrl, fetchProjects, fetchTransactions } from '../api';
import { fmtDateTime, fmtNumber } from '../format';
import { AdminKesifBagisText, useAdminKesifBagisCopy } from '../copy';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * İşlemler — imleçli bağış gezgini (kampanya / kullanıcı / İstanbul tarih aralığı / en az puan /
 * görünürlük), satır → makbuz. CSV aynı süzgeçle sunucuda üretilir (BOM'lu, tüm kayıtlar).
 */
export function TransactionsTab() {
  const tx = useAdminKesifBagisCopy();
  const id = useId();
  const url = useUrlState();
  const projectId = url.get('proje') ?? '';
  const from = url.get('from') ?? '';
  const to = url.get('to') ?? '';
  const visibility = url.get('gorunurluk') ?? '';
  const minPoints = url.get('min') ?? '';
  const urlQ = url.get('kisi') ?? '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      const v = q.trim();
      if (v === urlQ || (v.length > 0 && v.length < 2)) return;
      url.set({ kisi: v || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const receipt = useDetailSheet('makbuz');

  const projects = useQuery({ queryKey: donationKeys.list('sort=name&page=1&size=100'), queryFn: () => fetchProjects('sort=name&page=1&size=100'), staleTime: 60_000 });

  const filterQs = buildTxQs({
    projectId: projectId || undefined,
    q: urlQ.length >= 2 ? urlQ : undefined,
    from: DAY_RE.test(from) ? from : undefined,
    to: DAY_RE.test(to) ? to : undefined,
    minPoints: /^\d+$/.test(minPoints) && Number(minPoints) > 0 ? minPoints : undefined,
    visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
  });
  const list = useInfiniteQuery({
    queryKey: donationKeys.transactions(filterQs),
    queryFn: ({ pageParam, signal }) => fetchTransactions(`${filterQs}${filterQs ? '&' : ''}limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const filtered = filterQs.length > 0;

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        id: 'at',
        header: 'Tarih',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Tarih' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div>
            <time dateTime={row.original.at} className="block text-sm">
              {fmtDateTime(row.original.at)}
            </time>
            <span className="block font-mono text-xs text-fg-muted">{row.original.receiptNo}</span>
          </div>
        ),
      },
      {
        id: 'user',
        header: 'Bağışçı',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Bağışçı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[10rem]">
            <span className="block truncate font-medium text-fg">{row.original.user.name ?? 'Adsız kullanıcı'}</span>
            <span className="block truncate text-xs text-fg-muted">{row.original.user.email ?? ''}</span>
          </div>
        ),
      },
      {
        id: 'project',
        header: 'Kampanya',
        enableSorting: false,
        meta: { label: 'Kampanya' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm">
            <span aria-hidden>{row.original.project.icon}</span> {row.original.project.name}
          </span>
        ),
      },
      {
        id: 'points',
        header: 'Puan',
        enableSorting: false,
        meta: { numeric: true, label: 'Puan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="tabular-nums">{fmtNumber(row.original.points)}</span>,
      },
      {
        id: 'visibility',
        header: 'Görünürlük',
        enableSorting: false,
        meta: { label: 'Görünürlük' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.isPublic ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Herkese açık
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              Gizli
            </span>
          ),
      },
      {
        id: 'message',
        header: 'Mesaj',
        enableSorting: false,
        meta: { label: 'Mesaj' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="line-clamp-2 max-w-[16rem] text-sm text-fg-muted">{row.original.message ?? '—'}</span>,
      },
    ],
    []
  );

  const selectCls = 'min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm';
  return (
    <div className="space-y-4 pt-4">
      <div role="search" aria-label="Bağış işlemi süzgeçleri" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor={`${id}-q`}><AdminKesifBagisText k="donor" /></Label>
          <Input id={`${id}-q`} className="min-h-11" placeholder="Ad ya da e-posta (en az 2 harf)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor={`${id}-p`}>Kampanya</Label>
          <select id={`${id}-p`} className={selectCls} value={projectId} onChange={(e) => url.set({ proje: e.target.value || null })}>
            <option value="">{tx.allCampaigns}</option>
            {projectId && !projects.data?.items.some((p) => p.id === projectId) ? <option value={projectId}>{tx.selectedCampaign}</option> : null}
            {(projects.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-v`}><AdminKesifBagisText k="visibility" /></Label>
          <select id={`${id}-v`} className={selectCls} value={visibility} onChange={(e) => url.set({ gorunurluk: e.target.value || null })}>
            <option value="">{tx.all}</option>
            <option value="public">{tx.public}</option>
            <option value="private">Gizli</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-m`}>En az puan</Label>
          <Input id={`${id}-m`} className="min-h-11" inputMode="numeric" value={minPoints} onChange={(e) => url.set({ min: e.target.value.replace(/\D/g, '') || null })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-f`}><AdminKesifBagisText k="startDay" /></Label>
          <Input id={`${id}-f`} type="date" className="min-h-11" value={from} max={to || undefined} onChange={(e) => url.set({ from: e.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-t`}><AdminKesifBagisText k="endDay" /></Label>
          <Input id={`${id}-t`} type="date" className="min-h-11" value={to} min={from || undefined} onChange={(e) => url.set({ to: e.target.value || null })} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          {filtered ? (
            <Button variant="ghost" className="min-h-11" onClick={() => url.set({ proje: null, from: null, to: null, gorunurluk: null, min: null, kisi: null })}>
              Süzgeçleri temizle
            </Button>
          ) : null}
          <Button asChild variant="outline" className="ml-auto min-h-11">
            <a href={exportUrl(filterQs)} download>
              <Download className="h-4 w-4" aria-hidden />
              CSV indir
            </a>
          </Button>
        </div>
      </div>
      <p className="text-xs text-fg-muted"><AdminKesifBagisText k="csvNote" /></p>
      <DataTable
        ariaLabel="Bağış işlemleri"
        columns={columns}
        data={rows}
        query={list}
        getRowId={(r) => r.id}
        activeRowId={receipt.id}
        onRowClick={(r) => receipt.open(r.id)}
        filtered={filtered}
        empty={filtered ? { variant: 'filtered', title: 'Süzgece uyan bağış yok' } : { title: 'Henüz bağış yapılmadı', description: 'Müşteriler Cüzdan → Bağış ekranından puan bağışladığında burada görünür.' }}
      />
      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-11" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} aria-busy={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla göster'}
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <p className="text-center text-xs text-fg-muted">Tüm kayıtlar gösteriliyor ({fmtNumber(rows.length)}).</p>
      ) : null}
    </div>
  );
}
