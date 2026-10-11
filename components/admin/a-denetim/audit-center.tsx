'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileClock, Filter, Radio, RefreshCw, ShieldAlert, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, DetailSheet, MetricGrid, MetricTile, SeverityBadge, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { PageHeader, PanelPage, useUrlState } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES, CATEGORY_LABEL, SEVERITY_LABEL, entityLabel } from '@/lib/admin-audit/catalog';
import {
  ACTOR_KINDS,
  ACTOR_KIND_LABEL,
  ACTOR_ROLES,
  AUDIT_PERIODS,
  FILTER_KEYS,
  PERIOD_LABEL,
  ROLE_LABEL,
  buildAuditQs,
  type AuditPage,
  type AuditRow,
  type AuditSummary,
} from '@/lib/admin-audit/contract';
import { cn } from '@/lib/utils';
import { auditKeys, errorText, exportUrl, fetchAuditFacets, fetchAuditPage, fetchAuditSummary } from './api';
import { actorText, AuditDetailBody } from './audit-detail';
import { CATEGORY_ICON, SEVERITY_TO_DS, fmtAgo, fmtDateTime, fmtFull, fmtNumber } from './format';
import { AdminDenetimText, useAdminDenetimCopy } from './copy';

export type AuditInitial = { summary: AuditSummary | null; page: { qs: string; data: AuditPage } | null };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = [25, 50, 100] as const;

/** Hazır görünümler — yalnız URL; paylaşılabilir. */
const VIEWS: Array<{ label: string; qs: string }> = [
  { label: 'Kritik (24 saat)', qs: 'onem=critical&donem=24s' },
  { label: 'Silme ve arşiv', qs: 'kategori=delete' },
  { label: 'Güvenlik ve yetki', qs: 'kategori=security' },
  { label: 'Ekonomi', qs: 'kategori=economy' },
  { label: 'Ayar değişiklikleri', qs: 'varlik=settings' },
  { label: 'Yönetici işlemleri', qs: 'rol=ADMIN' },
  { label: 'Silinmiş aktörler', qs: 'tur=deleted' },
];

/**
 * Admin → Denetim günlüğü (/admin/audit). "Ne oldu, kim yaptı, neyi değiştirdi, geri alınabilir mi?"
 * Tüm süzgeç durumu URL'de (derin bağlantı), liste imleçli, detay sağdan açılan panelde.
 */
export function AuditCenter({ initial }: { initial: AuditInitial }) {
  const tx = useAdminDenetimCopy();
  const id = useId();
  const qc = useQueryClient();
  const url = useUrlState();
  const sheet = useDetailSheet('kayit');
  const [live, setLive] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const v = (k: string) => url.get(k) ?? '';
  const urlQ = v('q');
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next === urlQ || (next.length > 0 && next.length < 2)) return;
      url.set({ q: next || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = DAY_RE.test(v('from')) ? v('from') : '';
  const to = DAY_RE.test(v('to')) ? v('to') : '';
  const rangeError = from && to && from > to ? 'Başlangıç günü bitişten sonra olamaz.' : null;
  const sort = v('siralama') === 'eski' ? 'eski' : 'yeni';
  const limit = (LIMITS as readonly number[]).includes(Number(v('limit'))) ? Number(v('limit')) : 25;

  const filterQs = buildAuditQs({
    q: urlQ.length >= 2 ? urlQ : undefined,
    varlik: v('varlik'),
    eylem: v('eylem'),
    kategori: (AUDIT_CATEGORIES as readonly string[]).includes(v('kategori')) ? v('kategori') : undefined,
    onem: (AUDIT_SEVERITIES as readonly string[]).includes(v('onem')) ? v('onem') : undefined,
    aktor: v('aktor'),
    rol: (ACTOR_ROLES as readonly string[]).includes(v('rol')) ? v('rol') : undefined,
    tur: (ACTOR_KINDS as readonly string[]).includes(v('tur')) ? v('tur') : undefined,
    donem: (AUDIT_PERIODS as readonly string[]).includes(v('donem')) ? v('donem') : undefined,
    from: rangeError ? undefined : from,
    to: rangeError ? undefined : to,
  });
  const listQs = buildAuditQs({ ...Object.fromEntries(new URLSearchParams(filterQs)), siralama: sort === 'eski' ? 'eski' : undefined });
  const filtered = filterQs.length > 0;
  const activeCount = new URLSearchParams(filterQs).size;

  const seed = initial.page && initial.page.qs === listQs && limit === 25 ? initial.page.data : undefined;
  const list = useInfiniteQuery({
    queryKey: auditKeys.list(listQs, limit),
    queryFn: ({ pageParam, signal }) => fetchAuditPage(`${listQs}${listQs ? '&' : ''}limit=${limit}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: seed ? { pages: [seed], pageParams: [''] } : undefined,
    staleTime: 15_000,
    refetchInterval: live ? 30_000 : false,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? null;

  const summary = useQuery({ queryKey: auditKeys.summary(), queryFn: fetchAuditSummary, initialData: initial.summary ?? undefined, staleTime: 30_000, refetchInterval: live ? 30_000 : false });
  const facets = useQuery({ queryKey: auditKeys.facets(), queryFn: fetchAuditFacets, staleTime: 5 * 60_000 });
  const s = summary.data;

  // Canlı modda yeni gelen kayıtları duyur (ekran okuyucu + görsel vurgu).
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const ids = rows.map((r) => r.id);
    if (seen.current && live) {
      const added = ids.filter((x) => !seen.current!.has(x));
      if (added.length) {
        setFresh(new Set(added));
        setAnnounce(`${added.length} yeni denetim kaydı geldi.`);
      }
    }
    seen.current = new Set(ids);
  }, [rows, live]);
  useEffect(() => {
    seen.current = null;
    setFresh(new Set());
  }, [listQs]);

  const set = (patch: Record<string, string | null>) => url.set({ ...patch, kayit: null });
  const clearAll = () => set(Object.fromEntries([...FILTER_KEYS].map((k) => [k, null])));

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        id: 'at',
        header: 'Zaman',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Zaman', width: '9.5rem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.at} title={fmtFull(row.original.at)} className="block whitespace-nowrap text-sm tabular-nums">
            <span className="block">{fmtAgo(row.original.at)}</span>
            <span className="block text-xs text-fg-muted">{fmtDateTime(row.original.at)}</span>
          </time>
        ),
      },
      {
        id: 'event',
        header: 'Olay',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Olay' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const r = row.original;
          const Icon = CATEGORY_ICON[r.category];
          return (
            <div className={cn('flex min-w-[14rem] items-start gap-2 rounded', fresh.has(r.id) && 'bg-info-subtle')}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0">
                <span className="block font-medium text-fg">{r.label}</span>
                <span className="block truncate font-mono text-xs text-fg-muted" title={r.action}>
                  {r.action}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'actor',
        header: 'Aktör',
        enableSorting: false,
        meta: { label: 'Aktör' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const a = row.original.actor;
          return (
            <div className="min-w-[10rem]">
              <span className={cn('block truncate text-sm', a.deleted ? 'italic text-fg-muted' : 'text-fg')}>{actorText(a)}</span>
              <span className="block truncate text-xs text-fg-muted">
                {a.role ? (ROLE_LABEL[a.role] ?? a.role) : ACTOR_KIND_LABEL[a.kind]}
                {a.email && a.name ? ` · ${a.email}` : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'entity',
        header: 'Varlık',
        enableSorting: false,
        meta: { label: 'Varlık' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[8rem] max-w-[14rem]">
            <span className="block text-sm">{row.original.entityLabel}</span>
            {row.original.entityId ? (
              <span className="block truncate font-mono text-xs text-fg-muted" title={row.original.entityId}>
                {row.original.entityId}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'severity',
        header: 'Önem',
        enableSorting: false,
        meta: { label: 'Önem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <SeverityBadge severity={SEVERITY_TO_DS[row.original.severity]} label={SEVERITY_LABEL[row.original.severity]} emphasize size="sm" />,
      },
    ],
    [fresh]
  );

  const selectCls = 'min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm';
  const varlik = v('varlik');
  const eylem = v('eylem');
  const aktor = v('aktor');
  const entityOpts = facets.data?.entities ?? [];
  const actionOpts = facets.data?.actions ?? [];
  const actorOpts = facets.data?.actors ?? [];

  const chips: Array<{ key: string; label: string }> = [];
  if (urlQ.length >= 2) chips.push({ key: 'q', label: `Arama: ${urlQ}` });
  if (v('donem') && PERIOD_LABEL[v('donem') as keyof typeof PERIOD_LABEL]) chips.push({ key: 'donem', label: PERIOD_LABEL[v('donem') as keyof typeof PERIOD_LABEL] });
  if (from) chips.push({ key: 'from', label: `Başlangıç: ${from}` });
  if (to) chips.push({ key: 'to', label: `Bitiş: ${to}` });
  if (CATEGORY_LABEL[v('kategori') as keyof typeof CATEGORY_LABEL]) chips.push({ key: 'kategori', label: `Kategori: ${CATEGORY_LABEL[v('kategori') as keyof typeof CATEGORY_LABEL]}` });
  if (SEVERITY_LABEL[v('onem') as keyof typeof SEVERITY_LABEL]) chips.push({ key: 'onem', label: `Önem: ${SEVERITY_LABEL[v('onem') as keyof typeof SEVERITY_LABEL]}` });
  if (varlik) chips.push({ key: 'varlik', label: `Varlık: ${varlik.split(',').map(entityLabel).join(', ')}` });
  if (eylem) chips.push({ key: 'eylem', label: `Eylem: ${eylem}` });
  if (aktor) {
    const f = actorOpts.find((x) => x.userId === aktor);
    chips.push({ key: 'aktor', label: `Aktör: ${f ? (f.name ?? f.email ?? aktor) : aktor}` });
  }
  if (ROLE_LABEL[v('rol')]) chips.push({ key: 'rol', label: `Rol: ${ROLE_LABEL[v('rol')]}` });
  if (ACTOR_KIND_LABEL[v('tur') as keyof typeof ACTOR_KIND_LABEL]) chips.push({ key: 'tur', label: `Aktör türü: ${ACTOR_KIND_LABEL[v('tur') as keyof typeof ACTOR_KIND_LABEL]}` });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Denetim günlüğü"
          description="Platformdaki yönetimsel ve hassas değişiklikleri kim, ne zaman, hangi kayıt üzerinde yaptı — ve tam olarak neyi değiştirdi."
          icon={<FileClock />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant={live ? 'default' : 'outline'}
                className="min-h-11 sm:min-h-10"
                aria-pressed={live}
                onClick={() => setLive((x) => !x)}
                title="Açıkken liste ve özet 30 saniyede bir yenilenir"
              >
                <Radio className="h-4 w-4" aria-hidden />
                {live ? 'Canlı: açık' : 'Canlı izle'}
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: auditKeys.all })}>
                <RefreshCw className={cn('h-4 w-4', list.isRefetching && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                Yenile
              </Button>
              <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
                <a href={exportUrl(listQs)} download>
                  <Download className="h-4 w-4" aria-hidden />
                  CSV indir
                </a>
              </Button>
            </div>
          }
        />
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {summary.isError && !s ? (
        <ErrorState title="Denetim özeti yüklenemedi" description={errorText(summary.error)} onRetry={() => summary.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile label="Son 24 saat" metric={{ value: s?.last24h ?? null, unit: 'kayıt' }} hint={s ? `Son 7 gün: ${fmtNumber(s.last7d)}` : undefined} icon={<FileClock />} loading={!s} href="?donem=24s" />
          <MetricTile
            label="Kritik (24 saat)"
            metric={{ value: s?.critical24h ?? null }}
            hint="Toplu silme, rol, API anahtarı, şifre, puan düzeltmesi"
            icon={<ShieldAlert />}
            tone={s && s.critical24h > 0 ? 'danger' : 'neutral'}
            loading={!s}
            href="?onem=critical&donem=24s"
          />
          <MetricTile label="Toplam kayıt" metric={{ value: s?.total ?? null }} hint={s?.oldestAt ? `En eski kayıt: ${fmtDateTime(s.oldestAt)}` : 'Henüz kayıt yok'} icon={<FileClock />} loading={!s} />
          <MetricTile
            label="Silinmiş aktörlü kayıt"
            metric={{ value: s?.deletedActor ?? null }}
            hint="Hesap silinse de iz korunur"
            icon={<UserX />}
            loading={!s}
            href="?tur=deleted"
          />
        </MetricGrid>
      )}

      <nav aria-label="Hazır görünümler" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIEWS.map((view) => {
          const active = filterQs === buildAuditQs(Object.fromEntries(new URLSearchParams(view.qs)));
          return (
            <Link
              key={view.qs}
              href={`?${view.qs}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface text-fg hover:bg-surface-muted'
              )}
            >
              {view.label}
            </Link>
          );
        })}
      </nav>

      <section aria-label="Süzgeçler" className="space-y-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <Label htmlFor={`${id}-q`}>Ara</Label>
            <Input id={`${id}-q`} type="search" className="min-h-11" placeholder="Kayıt kimliği, eylem kodu, varlık ya da aktör e-postası" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label htmlFor={`${id}-p`}><AdminDenetimText k="period" /></Label>
            <select id={`${id}-p`} className={selectCls} value={v('donem')} onChange={(e) => set({ donem: e.target.value || null, from: null, to: null })}>
              <option value="">{tx.allTime}</option>
              {AUDIT_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" className="min-h-11 sm:hidden" aria-expanded={filtersOpen} aria-controls={`${id}-more`} onClick={() => setFiltersOpen((x) => !x)}>
            <Filter className="h-4 w-4" aria-hidden />
            Süzgeçler{activeCount ? ` (${activeCount})` : ''}
          </Button>
        </div>

        <div id={`${id}-more`} className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', !filtersOpen && 'hidden sm:grid')}>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-c`}>Kategori</Label>
            <select id={`${id}-c`} className={selectCls} value={v('kategori')} onChange={(e) => set({ kategori: e.target.value || null })}>
              <option value="">{tx.all}</option>
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-s`}><AdminDenetimText k="severity" /></Label>
            <select id={`${id}-s`} className={selectCls} value={v('onem')} onChange={(e) => set({ onem: e.target.value || null })}>
              <option value="">{tx.all}</option>
              {AUDIT_SEVERITIES.map((x) => (
                <option key={x} value={x}>
                  {SEVERITY_LABEL[x]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-e`}><AdminDenetimText k="entity" /></Label>
            <select id={`${id}-e`} className={selectCls} value={varlik} onChange={(e) => set({ varlik: e.target.value || null })} aria-busy={facets.isLoading}>
              <option value="">{tx.allEntities}</option>
              {varlik && !entityOpts.some((o) => o.value === varlik) ? <option value={varlik}>{varlik.split(',').map(entityLabel).join(', ')}</option> : null}
              {entityOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({fmtNumber(o.count)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-a`}>Eylem</Label>
            <select id={`${id}-a`} className={selectCls} value={eylem} onChange={(e) => set({ eylem: e.target.value || null })} aria-busy={facets.isLoading}>
              <option value="">{tx.allActions}</option>
              {eylem && !actionOpts.some((o) => o.value === eylem) ? <option value={eylem}>{eylem}</option> : null}
              {actionOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label === o.value ? o.value : `${o.label} — ${o.value}`} ({fmtNumber(o.count)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-u`}><AdminDenetimText k="actor" /></Label>
            <select id={`${id}-u`} className={selectCls} value={aktor} onChange={(e) => set({ aktor: e.target.value || null })} aria-busy={facets.isLoading}>
              <option value="">Herkes</option>
              {aktor && !actorOpts.some((o) => o.userId === aktor) ? <option value={aktor}>{tx.selectedUser}</option> : null}
              {actorOpts.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name ?? o.email ?? o.userId}
                  {o.role ? ` · ${ROLE_LABEL[o.role] ?? o.role}` : ''} ({fmtNumber(o.count)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-r`}><AdminDenetimText k="actorRole" /></Label>
            <select id={`${id}-r`} className={selectCls} value={v('rol')} onChange={(e) => set({ rol: e.target.value || null })}>
              <option value="">{tx.allRoles}</option>
              {ACTOR_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-t`}><AdminDenetimText k="actorType" /></Label>
            <select id={`${id}-t`} className={selectCls} value={v('tur')} onChange={(e) => set({ tur: e.target.value || null })}>
              <option value="">{tx.all}</option>
              {ACTOR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACTOR_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-f`}><AdminDenetimText k="start" /></Label>
              <Input id={`${id}-f`} type="date" className="min-h-11 px-2" value={from} max={to || undefined} aria-invalid={!!rangeError} aria-describedby={rangeError ? `${id}-re` : undefined} onChange={(e) => set({ from: e.target.value || null, donem: null })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-to`}><AdminDenetimText k="end" /></Label>
              <Input id={`${id}-to`} type="date" className="min-h-11 px-2" value={to} min={from || undefined} aria-invalid={!!rangeError} onChange={(e) => set({ to: e.target.value || null, donem: null })} />
            </div>
          </div>
        </div>
        {rangeError ? (
          <p id={`${id}-re`} role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        ) : null}
        {facets.isError ? (
          <p role="alert" className="text-sm text-danger">
            Süzgeç seçenekleri yüklenemedi ({errorText(facets.error)}).{' '}
            <button type="button" className="min-h-11 underline underline-offset-2" onClick={() => facets.refetch()}>
              Tekrar dene
            </button>
          </p>
        ) : null}

        {chips.length ? (
          <ul aria-label="Etkin süzgeçler" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => set({ [c.key]: null })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${c.label} süzgecini kaldır`}
                >
                  {c.label}
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
            <li>
              <Button variant="ghost" className="min-h-11" onClick={clearAll}>
                Süzgeçleri temizle
              </Button>
            </li>
          </ul>
        ) : null}
        <p className="text-xs text-fg-muted">
          Tarihler İstanbul saatine göredir; bitiş günü dahildir. Varlık ve eylem eşleşmesi büyük/küçük harfe duyarsızdır; seçenekler son {facets.data?.windowDays ?? 90} günün gerçek kayıtlarından gelir.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {total != null ? (
            <>
              <strong className="font-semibold text-fg">{fmtNumber(total)}</strong> kayıt{filtered ? ' süzgece uyuyor' : ''}
            </>
          ) : list.isLoading ? (
            'Yükleniyor…'
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${id}-sort`} className="text-sm">
            Sıralama
          </Label>
          <select id={`${id}-sort`} className={cn(selectCls, 'w-auto')} value={sort} onChange={(e) => set({ siralama: e.target.value === 'eski' ? 'eski' : null })}>
            <option value="yeni">{tx.newestFirst}</option>
            <option value="eski">{tx.oldestFirst}</option>
          </select>
          <Label htmlFor={`${id}-lim`} className="text-sm">
            Sayfa boyutu
          </Label>
          <select id={`${id}-lim`} className={cn(selectCls, 'w-auto')} value={limit} onChange={(e) => set({ limit: e.target.value === '25' ? null : e.target.value })}>
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        ariaLabel="Denetim kayıtları"
        columns={columns}
        data={rows}
        query={list}
        getRowId={(r) => r.id}
        activeRowId={sheet.id}
        onRowClick={(r) => sheet.open(r.id)}
        filtered={filtered}
        enableColumnVisibility={false}
        empty={
          filtered
            ? { variant: 'filtered', title: 'Süzgece uyan denetim kaydı yok', description: 'Dönemi genişletmeyi ya da süzgeçleri temizlemeyi deneyin.', action: (
                <Button variant="outline" className="min-h-11" onClick={clearAll}>
                  Süzgeçleri temizle
                </Button>
              ) }
            : { title: 'Henüz denetim kaydı yok', description: 'Yönetim panelinde bir ayar, kullanıcı ya da içerik değiştiğinde burada görünür.' }
        }
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
      {list.isFetchNextPageError ? (
        <p role="alert" className="text-center text-sm text-danger">
          Sonraki sayfa yüklenemedi: {errorText(list.error)}
        </p>
      ) : null}

      <DetailSheet paramKey="kayit" size="xl" title="Denetim kaydı" description="Kim, ne zaman, neyi değiştirdi" siblings={rows.map((r) => r.id)}>
        {(rid: string) => <AuditDetailBody id={rid} onOpen={sheet.open} />}
      </DetailSheet>
    </PanelPage>
  );
}
