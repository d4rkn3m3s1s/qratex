import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/ds/page/breadcrumbs';
import { CmsContent } from '@/components/admin/a-seo-sayfalar/cms-content';
import { cmsPublicPath, plainExcerpt, SLUG_RE } from '@/lib/cms-pages/contract';
import { getPublishedCmsPage } from '@/lib/cms-pages/pages.server';
import { buildReadingMetadata, getReadingSeoContext } from '@/lib/legal/seo';

/**
 * İçerik sayfası (CMS yayın hattı) — /admin/pages'te "Yayında" olan kayıtlar burada görünür.
 * Okuma `unstable_cache` + `cms-page:<slug>` etiketiyle; admin her kayıtta etiketi anında
 * sona erdirir. DB erişilemezse yardımcı `null` döner → 404 (build/deploy patlamaz).
 */
type Params = Promise<{ slug: string }>;

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return { title: 'Sayfa bulunamadı', robots: { index: false } };
  const page = await getPublishedCmsPage(slug);
  if (!page) return { title: 'Sayfa bulunamadı', robots: { index: false } };
  const ctx = await getReadingSeoContext();
  const md = buildReadingMetadata(ctx, {
    path: cmsPublicPath(page.slug),
    title: page.meta.seoTitle || page.title,
    description: page.meta.description || plainExcerpt(page.body, 160),
    type: 'article',
    modifiedTime: page.updatedAt,
  });
  return page.meta.noindex ? { ...md, robots: { index: false, follow: true } } : md;
}

export default async function CmsPublicPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const page = await getPublishedCmsPage(slug);
  if (!page) notFound();
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <Breadcrumbs items={[{ label: 'Ana sayfa', href: '/' }, { label: page.title }]} className="print:hidden" />
      <header className="mt-4 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{page.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Son güncelleme: <time dateTime={page.updatedAt}>{dateFmt.format(new Date(page.updatedAt))}</time>
        </p>
      </header>
      <CmsContent body={page.body} className="mt-6" />
    </article>
  );
}
