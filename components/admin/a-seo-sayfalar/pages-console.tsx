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
          eyebrow="İçerik"
          title="İçerik sayfaları"
          description="Sitede /sayfa/… adresinde yayınlanan bilgi sayfaları (hakkımızda, iletişim, duyuru vb.). Yayındaki sayfa birkaç saniye içinde canlıya yansır ve sitemap'e eklenir. Yasal metinler sistemden üretilir, burada düzenlenmez."
          icon={<FileText />}
          meta={
            counts ? (
              <div className="flex flex-wrap gap-2 text-sm" aria-label="Sayfa sayıları">
                <StatusBadge label={`${counts.published} yayında`} tone="success" />
                <StatusBadge label={`${counts.draft} taslak`} tone="neutral" />
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
          <div role="tablist" aria-label="Duruma göre filtrele" className="inline-flex rounded-control border border-border bg-surface-1 p-1">
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
                  {t.label}
                  {n != null ? <span className="ml-1.5 tabular-nums text-fg-subtle">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <span className="sr-only">Başlık veya adreste ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Başlık veya adreste ara" className="min-h-11 pl-9 sm:min-h-10" type="search" />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <span>Sırala</span>
              <select
                value={sort}
                onChange={(e) => url.set({ sirala: e.target.value === 'title' ? 'title' : null, sayfa: null })}
                className="min-h-11 rounded-control border border-border bg-surface-1 px-2 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10"
              >
                <option value="updated">Son güncellenen</option>
                <option value="title">Başlık (A–Z)</option>
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
                title: query.q ? `"${query.q}" için sonuç yok` : 'Bu durumda sayfa yok',
                description: 'Filtreyi değiştirin ya da aramayı temizleyin.',
                action: (
                  <Button variant="outline" onClick={() => url.set({ q: null, durum: null, sayfa: null })}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : {
                title: 'Henüz içerik sayfası yok',
                description: 'Hakkımızda, iletişim ya da duyuru gibi bir sayfa oluşturun. Taslak olarak başlar; hazır olduğunda yayına alırsınız.',
                action: (
                  <Button asChild>
                    <Link href="/admin/pages/yeni">
                      <Plus className="h-4 w-4" aria-hidden /> İlk sayfayı oluştur
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
              <nav aria-label="Sayfalama" className="flex items-center justify-between gap-3 text-sm text-fg-muted">
                <span className="tabular-nums">
                  {data.total} sayfadan {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={page <= 1} onClick={() => url.set({ sayfa: page - 1 > 1 ? String(page - 1) : null })}>
                    <ChevronLeft className="h-4 w-4" aria-hidden /> Önceki
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
  const publish = useMutation({
    mutationFn: () => publishPage(page.id, !page.isPublished, page.updatedAt),
    onSuccess: (r) => {
      toast.success(r.page.isPublished ? `Yayına alındı: ${cmsPublicPath(r.page.slug)}` : 'Yayından kaldırıldı; adres artık 404 döner.');
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
          <StatusBadge size="sm" label={page.isPublished ? 'Yayında' : 'Taslak'} tone={page.isPublished ? 'success' : 'neutral'} />
          {page.noindex ? <StatusBadge size="sm" label="Aramada gizli" tone="info" icon={EyeOff} /> : null}
        </div>
        <p className="mt-0.5 font-mono text-xs text-fg-subtle">{cmsPublicPath(page.slug)}</p>
        {page.excerpt ? <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">{page.excerpt}</p> : <p className="mt-1.5 text-sm italic text-fg-subtle">İçerik boş</p>}
        <p className="mt-1.5 text-xs text-fg-subtle">
          {relTime(page.updatedAt)} güncellendi{page.lastEditor ? ` · ${page.lastEditor}` : ''} · {page.length.toLocaleString('tr-TR')} karakter
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <Link href={`/admin/pages/${page.id}`}>
            <PenLine className="h-4 w-4" aria-hidden /> Düzenle
          </Link>
        </Button>
        {page.isPublished ? (
          <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
            <a href={cmsPublicPath(page.slug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden /> Canlı görüntüle<span className="sr-only"> (yeni sekmede açılır)</span>
            </a>
          </Button>
        ) : null}
        {page.isPublished ? (
          <ConfirmAction
            tone="warning"
            title="Yayından kaldırılsın mı?"
            description={`${cmsPublicPath(page.slug)} adresi 404 dönecek ve sitemap'ten çıkacak. İçerik taslak olarak kalır.`}
            confirmLabel="Yayından kaldır"
            irreversibleNote={false}
            onConfirm={() => publish.mutateAsync()}
            trigger={
              <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" disabled={publish.isPending}>
                <EyeOff className="h-4 w-4" aria-hidden /> Yayından kaldır
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
              title={page.length < 20 ? 'İçerik en az 20 karakter olmalı' : undefined}
              onClick={() => publish.mutate()}
            >
              <Globe className="h-4 w-4" aria-hidden /> Yayına al
            </Button>
            <ConfirmAction
              tone="danger"
              title="Taslak silinsin mi?"
              description="Taslak listeden kalıcı olarak kaldırılır. Son içerik denetim kaydında saklanır."
              confirmPhrase={page.slug}
              confirmLabel="Sil"
              onConfirm={async () => {
                await deletePage(page.id, page.updatedAt);
                toast.success('Taslak silindi.');
                await onChanged();
              }}
              trigger={
                <Button variant="ghost" size="sm" className="min-h-11 text-danger sm:min-h-9" aria-label={`${page.title} taslağını sil`}>
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

