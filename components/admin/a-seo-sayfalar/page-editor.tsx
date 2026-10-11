'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, FileText, History, RotateCcw } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { DirtyBar, Form, FormRootError, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { QueryState } from '@/components/states';
import { toSlugInput } from '@/app/admin/pages/slug';
import {
  cmsPageFormSchema,
  cmsPublicPath,
  plainExcerpt,
  type CmsPageDetail,
  type CmsPageFormParsed,
} from '@/lib/cms-pages/contract';
import { cn } from '@/lib/utils';
import { CmsContent } from './cms-content';
import { createPage, fetchPage, fetchPageHistory, pageKeys, updatePage } from './api';
import { fmtAbs, relTime } from './format';
import { useSeoCopy } from './copy';

const EMPTY: CmsPageFormParsed = { title: '', slug: '', body: '', seoTitle: '', description: '', noindex: false, isPublished: false };

function toForm(p: CmsPageDetail): CmsPageFormParsed {
  return {
    title: p.title,
    slug: p.slug,
    body: p.body,
    seoTitle: p.meta.seoTitle ?? '',
    description: p.meta.description ?? '',
    noindex: p.meta.noindex === true,
    isPublished: p.isPublished,
  };
}

/**
 * İçerik sayfası editörü (/admin/pages/[id], yeni için `yeni`). Ayrı rota: derin bağlantı,
 * geri tuşu, kaydedilmemiş değişiklik uyarısı (DirtyBar). Sağda canlı önizleme = public
 * sayfanın AYNI render bileşeni. Kayıt iyimser kilitli (409 → "güncel hali yükle").
 */
export function PageEditor({ id, initial }: { id: string | null; initial: CmsPageDetail | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: pageKeys.detail(id ?? 'yeni'),
    queryFn: ({ signal }) => fetchPage(id as string, signal).then((r) => r.page),
    enabled: !!id,
    initialData: initial ?? undefined,
    staleTime: 10_000,
  });

  if (id) {
    return (
      <PanelPage register="ops" header={<EditorHeader page={detail.data ?? null} />}>
        <QueryState query={detail} skeleton="form">
          {(page) => <EditorBody key={page.id} page={page} onSaved={(p) => qc.setQueryData(pageKeys.detail(p.id), p)} reload={() => detail.refetch().then((r) => r.data ?? null)} />}
        </QueryState>
      </PanelPage>
    );
  }
  return (
    <PanelPage register="ops" header={<EditorHeader page={null} />}>
      <EditorBody
        page={null}
        onSaved={(p) => {
          qc.setQueryData(pageKeys.detail(p.id), p);
          void qc.invalidateQueries({ queryKey: pageKeys.all });
          router.replace(`/admin/pages/${p.id}`);
        }}
        reload={async () => null}
      />
    </PanelPage>
  );
}

function EditorHeader({ page }: { page: CmsPageDetail | null }) {
  const fz = useSeoCopy().fx;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  return (
    <PageHeader
      eyebrow={ux.icerikSayfalari}
      title={page ? page.title : fz.newPage}
      back={{ href: '/admin/pages', label: ux.sayfalaraDon }}
      icon={<FileText />}
      description={
        page
          ? fz.updatedLine(cmsPublicPath(page.slug), relTime(page.updatedAt))
          : ux.taslakOlarakBaslarHazir
      }
      meta={page ? <StatusBadge label={page.isPublished ? ux.yayinda : fz.draft} tone={page.isPublished ? 'success' : 'neutral'} /> : null}
      actions={
        page?.isPublished ? (
          <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
            <a href={cmsPublicPath(page.slug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden /> {sx.viewLive}<span className="sr-only">{sx.newTab}</span>
            </a>
          </Button>
        ) : null
      }
    />
  );
}

function EditorBody({
  page,
  onSaved,
  reload,
}: {
  page: CmsPageDetail | null;
  onSaved: (p: CmsPageDetail) => void;
  reload: () => Promise<CmsPageDetail | null>;
}) {
  const fz = useSeoCopy().fx;
  const uy = useSeoCopy().ui2;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const form = useZodForm(cmsPageFormSchema, { defaultValues: page ? toForm(page) : EMPTY });
  const [version, setVersion] = useState(page?.updatedAt ?? null);
  const [slugTouched, setSlugTouched] = useState(!!page);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const values = useWatch({ control: form.control }) as CmsPageFormParsed;

  // Yeni sayfada slug, elle değiştirilene kadar başlıktan türetilir (Türkçe transliterasyon).
  useEffect(() => {
    if (!slugTouched) form.setValue('slug', toSlugInput(values.title ?? '').replace(/^-+|-+$/g, ''), { shouldDirty: true });
  }, [values.title, slugTouched, form]);

  // Adres yazarken Türkçe harf/boşluk anında slug biçimine çevrilir.
  useEffect(() => {
    const raw = values.slug ?? '';
    const next = toSlugInput(raw);
    if (next !== raw) form.setValue('slug', next, { shouldDirty: true, shouldValidate: false });
  }, [values.slug, form]);

  const save = async (v: CmsPageFormParsed) => {
    if (page && version) {
      const r = await updatePage(page.id, v, version);
      setVersion(r.page.updatedAt);
      onSaved(r.page);
      toast.success(r.changed.length ? (r.page.isPublished ? ux.kaydedildiVeYayinaYansidi : 'Taslak kaydedildi.') : ux.degisiklikYoktu);
      return r.page;
    }
    const r = await createPage(v);
    toast.success(r.page.isPublished ? fz.createdLive(cmsPublicPath(r.page.slug)) : ux.taslakOlusturuldu);
    onSaved(r.page);
    return r.page;
  };

  const reloadLatest = async () => {
    const latest = await reload();
    if (latest) {
      setVersion(latest.updatedAt);
      form.reset(toForm(latest));
      toast.message(ux.guncelSurumYuklendiDegisikliklerinizi);
    }
  };

  const desc = values.description || plainExcerpt(values.body ?? '', 160);

  return (
    <Form form={form} onSubmit={save} resetOnSuccess={(saved) => toForm(saved as CmsPageDetail)} className="pb-28">
      {page?.legacyFormat ? (
        <p className="mb-4 rounded-control border border-info-border bg-info-subtle p-3 text-sm text-fg">
          {ux.buSayfaEskiBicimde}
        </p>
      ) : null}
      <div className="mb-4 inline-flex rounded-control border border-border bg-surface-1 p-1 lg:hidden" role="tablist" aria-label={ux.gorunum}>
        {(['edit', 'preview'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cn('min-h-10 rounded-chip px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', view === k ? 'bg-surface-3 text-fg' : 'text-fg-muted')}
          >
            {k === 'edit' ? ux.duzenle : ux.onizleme}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={ux.sayfaIcerigi} className={cn('space-y-5', view === 'preview' && 'hidden lg:block')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="title" label={ux.baslik} required maxLength={180} />
            <TextField
              control={form.control}
              name="slug"
              label={ux.adres}
              required
              description={fz.publicAt(cmsPublicPath(values.slug || fz.addressFallback))}
              startAdornment={<span className="text-fg-subtle">/sayfa/</span>}
              inputProps={{ onKeyDown: () => setSlugTouched(true), autoCapitalize: 'none', spellCheck: false }}
            />
          </div>
          <TextareaField
            control={form.control}
            name="body"
            label={ux.icerik}
            rows={16}
            autoResize
            maxLength={100_000}
            showCount="always"
            description={ux.bicimBaslikAltBaslik}
          />
          <fieldset className="space-y-4 rounded-card border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-fg">{uy.aramaMotoru}</legend>
            <TextField control={form.control} name="seoTitle" label={ux.seoBasligi} optional maxLength={70} description={ux.bossaSayfaBasligiKullanilir} />
            <TextareaField control={form.control} name="description" label={ux.metaAciklama} optional rows={3} maxLength={170} showCount="always" description={ux.bossaIceriginIlkCumlelerinden} />
            <SwitchField control={form.control} name="noindex" label={ux.aramaMotorlarindanGizle} description={ux.sayfaAcikKalirAma} variant="card" />
          </fieldset>
          <SwitchField
            control={form.control}
            name="isPublished"
            label={ux.yayinda}
            description={fz.liveDesc(cmsPublicPath(values.slug || fz.addressFallback))}
            variant="card"
          />
          <FormRootError />
        </section>

        <section aria-label={ux.canliOnizleme} className={cn('space-y-4 lg:sticky lg:top-20 lg:self-start', view === 'edit' && 'hidden lg:block')}>
          <div className="rounded-card border border-border bg-surface-1 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{sx.googleView}</p>
            <p className="mt-2 truncate text-xs text-fg-muted">qratex.com › sayfa › {values.slug || 'adres'}</p>
            <p className="truncate text-lg leading-6 text-info">{values.seoTitle || values.title || ux.sayfaBasligi}</p>
            <p className="line-clamp-2 text-sm text-fg-muted">{desc || ux.aciklamaIceriktenUretilecek}</p>
            {values.noindex ? <p className="mt-2 text-xs text-warning">{sx.noindexWarn}</p> : null}
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-card border border-border bg-background p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">{sx.pagePreview}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{values.title || ux.baslik}</h1>
            {values.body?.trim() ? <CmsContent body={values.body} className="mt-4" /> : <p className="mt-4 text-sm italic text-fg-subtle">{sx.bodyPlaceholder}</p>}
          </div>
          {page ? <HistoryPanel pageId={page.id} onLoad={(v) => {
            form.setValue('title', v.title, { shouldDirty: true });
            form.setValue('slug', v.slug, { shouldDirty: true });
            form.setValue('body', v.body, { shouldDirty: true });
            setView('edit');
            toast.message(ux.surumEditoreYuklendiKaydedince);
          }} /> : null}
        </section>
      </div>
      <DirtyBar onReloadLatest={reloadLatest} saveLabel={page ? 'Kaydet' : ux.olustur} />
    </Form>
  );
}

function HistoryPanel({ pageId, onLoad }: { pageId: string; onLoad: (v: { title: string; slug: string; body: string }) => void }) {
  const ux = useSeoCopy().ui;
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: pageKeys.history(pageId),
    queryFn: ({ signal }) => fetchPageHistory(pageId, signal),
    enabled: open,
  });
  const items = useMemo(() => history.data?.items ?? [], [history.data]);
  return (
    <details className="rounded-card border border-border bg-surface-1" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <History className="h-4 w-4" aria-hidden /> {ux.surumGecmisi}
      </summary>
      <div className="border-t border-border p-3">
        <QueryState query={history} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: ux.kayitYok, description: ux.buSayfadaHenuzKayitli, compact: true }}>
          {() => (
            <ol className="space-y-2">
              {items.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 rounded-control p-2 hover:bg-surface-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-fg">{h.actionLabel}{h.changed.length ? <span className="font-normal text-fg-muted"> · {h.changed.join(', ')}</span> : null}</p>
                    <p className="text-xs text-fg-subtle">{fmtAbs(h.createdAt)}{h.actor ? ` · ${h.actor}` : ''}</p>
                  </div>
                  {h.version ? (
                    <Button type="button" size="sm" variant="ghost" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => onLoad(h.version!)}>
                      <RotateCcw className="h-4 w-4" aria-hidden /> {ux.editoreYukle}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </QueryState>
      </div>
    </details>
  );
}

