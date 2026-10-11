'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ExternalLink, EyeOff, FileText, Globe, PenLine, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, PanelPage, useUrlState } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, QueryState } from '@/components/states';
import { fadeUp, staggerDelay, useReducedMotionPref } from '@/lib/motion';
import { cmsPublicPath, type CmsListQuery, type CmsPageList, type CmsPageSummary } from '@/lib/cms-pages/contract';
import { cn } from '@/lib/utils';
import { deletePage, errorText, fetchPages, pageKeys, publishPage } from './api';
import { relTime } from './format';
import { useSourceT } from '@/components/ds/page/source-dict';
import { useDsLocale } from '@/components/ds/a11y/copy';
import { SEO_DICT, useSeoCopy } from './copy';

const STATUS_TABS: Array<{ value: CmsListQuery['status']; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'published', label: 'Yayında' },
  { value: 'draft', label: 'Taslak' },
];

/**
 * İçerik sayfaları (/admin/pages) — ops kaydı: sakin, yoğun; 3B yok.
 * Yayın hattı gerçek: "Yayında" sayfa `/sayfa/<slug>` adresinde açılır ve sitemap'e girer.
 */
export function PagesConsole({ initial, initialQuery }: { initial: CmsPageList | null; initialQuery: CmsListQuery }) {
  const fz = useSeoCopy().fx;
  const L = useSourceT(SEO_DICT);
  const uy = useSeoCopy().ui2;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const url = useUrlState();
  const qc = useQueryClient();
  const reduced = useReducedMotionPref();
  const status = (url.get('durum') as CmsListQuery['status']) || 'all';
  const q = url.get('q') ?? '';
  const page = Math.max(1, Number(url.get('sayfa') ?? 1) || 1);
  const sort = url.get('sirala') === 'title' ? 'title' : 'updated';
  const query: CmsListQuery = { status: ['all', 'published', 'draft'].includes(status) ? status : 'all', q: q || undefined, page, pageSize: 20, sort };
  const isInitial = JSON.stringify(query) === JSON.stringify(initialQuery);

  const list = useQuery({
    queryKey: pageKeys.list(query),
    queryFn: ({ signal }) => fetchPages(query, signal),
    initialData: isInitial && initial ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) url.set({ q: search.trim() || null, sayfa: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const refresh = () => qc.invalidateQueries({ queryKey: pageKeys.all });
  const counts = list.data?.counts;
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow={ux.icerik}
          title={ux.icerikSayfalari}
          description={ux.sitedeSayfaAdresindeYayinlanan}
          icon={<FileText />}
          meta={
            counts ? (
              <div className="flex flex-wrap gap-2 text-sm" aria-label={ux.sayfaSayilari}>
                <StatusBadge label={fz.publishedCount(counts.published)} tone="success" />
                <StatusBadge label={fz.draftCount(counts.draft)} tone="neutral" />
              </div>
            ) : null
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild className="min-h-11 sm:min-h-10">
                <Link href="/admin/pages/yeni">
                  <Plus className="h-4 w-4" aria-hidden /> Yeni sayfa
                </Link>
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => void refresh()} disabled={list.isFetching}>
                <RefreshCw className={cn('h-4 w-4', list.isFetching && 'motion-safe:animate-spin')} aria-hidden /> Yenile
              </Button>
            </div>
          }
        />
      }
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label={ux.durumaGoreFiltrele} className="inline-flex rounded-control border border-border bg-surface-1 p-1">
            {STATUS_TABS.map((t) => {
              const active = query.status === t.value;
              const n = t.value === 'all' ? counts?.all : t.value === 'published' ? counts?.published : counts?.draft;
              return (
                <button
                  key={t.value}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => url.set({ durum: t.value === 'all' ? null : t.value, sayfa: null })}
                  className={cn(
                    'min-h-10 rounded-chip px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {L(t.label)}
                  {n != null ? <span className="ml-1.5 tabular-nums text-fg-subtle">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <span className="sr-only">{sx.searchSr}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ux.baslikVeyaAdresteAra} className="min-h-11 pl-9 sm:min-h-10" type="search" />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <span>{sx.sort}</span>
              <select
                value={sort}
                onChange={(e) => url.set({ sirala: e.target.value === 'title' ? 'title' : null, sayfa: null })}
                className="min-h-11 rounded-control border border-border bg-surface-1 px-2 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10"
              >
                <option value="updated">{sx.sortUpdated}</option>
                <option value="title">{sx.sortTitle}</option>
              </select>
            </label>
          </div>
        </div>
      }
    >
      <p className="sr-only" aria-live="polite">
        {list.data ? `${list.data.total} sayfa listeleniyor` : ''}
      </p>
      <QueryState
        query={list}
        skeleton="table"
        isEmpty={(d) => d.items.length === 0}
        empty={
          query.q || query.status !== 'all'
            ? {
                variant: 'filtered',
                title: query.q ? fz.noResultsFor(query.q) : fz.noPagesInStatus,
                description: ux.filtreyiDegistirinYaDa,
                action: (
                  <Button variant="outline" onClick={() => url.set({ q: null, durum: null, sayfa: null })}>
                    {uy.filtreleriTemizle}
                  </Button>
                ),
              }
            : {
                title: ux.henuzIcerikSayfasiYok,
                description: ux.hakkimizdaIletisimYaDa,
                action: (
                  <Button asChild>
                    <Link href="/admin/pages/yeni">
                      <Plus className="h-4 w-4" aria-hidden /> {ux.ilkSayfayiOlustur}
                    </Link>
                  </Button>
                ),
              }
        }
      >
        {(data) => (
          <div className="space-y-4">
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-1">
              {data.items.map((p, i) => (
                <Motion.li key={p.id} variants={fadeUp} initial={reduced ? false : 'hidden'} animate="visible" transition={{ delay: staggerDelay(i) }}>
                  <PageRow page={p} onChanged={refresh} />
                </Motion.li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav aria-label={ux.sayfalama} className="flex items-center justify-between gap-3 text-sm text-fg-muted">
                <span className="tabular-nums">
                  {data.total} sayfadan {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={page <= 1} onClick={() => url.set({ sayfa: page - 1 > 1 ? String(page - 1) : null })}>
                    <ChevronLeft className="h-4 w-4" aria-hidden /> {ux.onceki}
                  </Button>
                  <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={page >= totalPages} onClick={() => url.set({ sayfa: String(page + 1) })}>
                    Sonraki <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </nav>
            ) : null}
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}

function PageRow({ page, onChanged }: { page: CmsPageSummary; onChanged: () => unknown }) {
  const locTag = (useDsLocale() === 'en' ? 'en-US' : 'tr-TR');
  const fz = useSeoCopy().fx;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const publish = useMutation({
    mutationFn: () => publishPage(page.id, !page.isPublished, page.updatedAt),
    onSuccess: (r) => {
      toast.success(r.page.isPublished ? fz.publishedAt(cmsPublicPath(r.page.slug)) : ux.yayindanKaldirildiAdresArtik);
      void onChanged();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/pages/${page.id}`}
            className="truncate text-base font-semibold text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
          >
            {page.title}
          </Link>
          <StatusBadge size="sm" label={page.isPublished ? ux.yayinda : 'Taslak'} tone={page.isPublished ? 'success' : 'neutral'} />
          {page.noindex ? <StatusBadge size="sm" label={ux.aramadaGizli} tone="info" icon={EyeOff} /> : null}
        </div>
        <p className="mt-0.5 font-mono text-xs text-fg-subtle">{cmsPublicPath(page.slug)}</p>
        {page.excerpt ? <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">{page.excerpt}</p> : <p className="mt-1.5 text-sm italic text-fg-subtle">{sx.emptyBody}</p>}
        <p className="mt-1.5 text-xs text-fg-subtle">
          {fz.rowMeta(relTime(page.updatedAt))}{page.lastEditor ? ` · ${page.lastEditor}` : ''} · {fz.chars(page.length.toLocaleString(locTag))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <Link href={`/admin/pages/${page.id}`}>
            <PenLine className="h-4 w-4" aria-hidden /> {ux.duzenle}
          </Link>
        </Button>
        {page.isPublished ? (
          <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
            <a href={cmsPublicPath(page.slug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden /> {sx.viewLive}<span className="sr-only">{sx.newTab}</span>
            </a>
          </Button>
        ) : null}
        {page.isPublished ? (
          <ConfirmAction
            tone="warning"
            title={ux.yayindanKaldirilsinMi}
            description={fz.unpublishDesc(cmsPublicPath(page.slug))}
            confirmLabel={ux.yayindanKaldir}
            irreversibleNote={false}
            onConfirm={() => publish.mutateAsync()}
            trigger={
              <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" disabled={publish.isPending}>
                <EyeOff className="h-4 w-4" aria-hidden /> {ux.yayindanKaldir}
              </Button>
            }
          />
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={publish.isPending || page.length < 20}
              title={page.length < 20 ? ux.icerikEnAz20 : undefined}
              onClick={() => publish.mutate()}
            >
              <Globe className="h-4 w-4" aria-hidden /> {ux.yayinaAl}
            </Button>
            <ConfirmAction
              tone="danger"
              title={ux.taslakSilinsinMi}
              description={ux.taslakListedenKaliciOlarak}
              confirmPhrase={page.slug}
              confirmLabel={ux.sil}
              onConfirm={async () => {
                await deletePage(page.id, page.updatedAt);
                toast.success('Taslak silindi.');
                await onChanged();
              }}
              trigger={
                <Button variant="ghost" size="sm" className="min-h-11 text-danger sm:min-h-9" aria-label={fz.deleteDraft(page.title)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Sil
                </Button>
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

