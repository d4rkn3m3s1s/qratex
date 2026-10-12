import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Rss } from 'lucide-react';
import { Breadcrumbs } from '@/components/ds/page/breadcrumbs';
import { BlogCta } from '@/components/public/p-blog-yasal/blog-cta';
import { JsonLd, breadcrumbLd } from '@/components/public/p-blog-yasal/json-ld';
import { PostCard } from '@/components/public/p-blog-yasal/post-card';
import { TurkishOnlyNotice } from '@/components/public/p-blog-yasal/turkish-only-notice';
import {
  BLOG_CATEGORIES,
  countByCategory,
  getCategory,
  getPostsByCategory,
  isBlogCategory,
  paginate,
  parsePageParam,
  type BlogCategorySlug,
} from '@/lib/blog-posts';
import { buildReadingMetadata, getReadingSeoContext } from '@/lib/legal/seo';
import { getPageSeo } from '@/lib/seo-settings';
import { cn } from '@/lib/utils';

/**
 * /blog — editoryal vitrin. Sunucu bileşeni; kategori ve sayfa URL'de (`?kategori=&sayfa=`),
 * istemci JS'i yok (paylaşılabilir, geri tuşu çalışır). SEO: admin ezmesi + canonical +
 * kendi OG/Twitter'ı (kök layout'un `canonical: '/'` mirası ezilir), Blog + ItemList +
 * BreadcrumbList yapılandırılmış verisi.
 */
const PATH = '/blog';
const PAGE_SIZE = 9;
const DEFAULT_TITLE = 'Blog';
const DEFAULT_DESCRIPTION = 'QRateX blog: QR ile geri bildirim, oyunlaştırma, müşteri deneyimi ve verilerinizin gizliliği üzerine rehberler.';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readCategory(raw: string | string[] | undefined): BlogCategorySlug | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isBlogCategory(v) ? v : null;
}

function hrefFor(category: BlogCategorySlug | null, page: number): string {
  const q = new URLSearchParams();
  if (category) q.set('kategori', category);
  if (page > 1) q.set('sayfa', String(page));
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const category = readCategory(sp.kategori);
  const page = parsePageParam(sp.sayfa);
  const [ctx, override] = await Promise.all([getReadingSeoContext(), getPageSeo(PATH)]);
  const cat = getCategory(category);
  const baseTitle = override?.title || DEFAULT_TITLE;
  return buildReadingMetadata(ctx, {
    path: hrefFor(category, page),
    title: cat ? `${cat.label} · ${baseTitle}` : page > 1 ? `${baseTitle} · Sayfa ${page}` : baseTitle,
    description: cat?.description ?? (override?.description || DEFAULT_DESCRIPTION),
    type: 'website',
    canonicalOverride: !category && page === 1 ? override?.canonical || undefined : undefined,
  });
}

export default async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const category = readCategory(sp.kategori);
  const [{ base, seo }, override] = await Promise.all([getReadingSeoContext(), getPageSeo(PATH)]);
  const counts = countByCategory();
  const all = getPostsByCategory(category);
  const showFeatured = !category && parsePageParam(sp.sayfa) === 1 && all.length > 0;
  const featured = showFeatured ? all[0] : null;
  const rest = featured ? all.slice(1) : all;
  const pg = paginate(rest, parsePageParam(sp.sayfa), PAGE_SIZE);
  const title = override?.title || DEFAULT_TITLE;
  const crumbs = [
    { name: 'Ana Sayfa', path: '/' },
    { name: title, path: PATH },
  ];
  const listed = featured ? [featured, ...pg.items] : pg.items;
  const activeCat = getCategory(category);

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: `${seo.siteName} ${title}`,
            description: override?.description || DEFAULT_DESCRIPTION,
            url: `${base}${PATH}`,
            inLanguage: 'tr-TR',
            publisher: { '@type': 'Organization', name: seo.organizationName || seo.siteName, url: base },
            blogPost: listed.map((p) => ({
              '@type': 'BlogPosting',
              headline: p.title,
              url: `${base}/blog/${p.slug}`,
              datePublished: p.datePublished,
              dateModified: p.dateModified,
            })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: listed.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/blog/${p.slug}` })),
          },
          breadcrumbLd(base, crumbs),
        ]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Breadcrumbs items={[{ label: 'Ana Sayfa', href: '/' }, { label: title }]} />

        <header className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="qx-overline text-brand">Blog</p>
            <h1 className="qx-h1 text-3xl text-fg md:text-4xl">İçgörüler ve rehberler</h1>
            <p className="text-base leading-7 text-fg-muted">{override?.description || DEFAULT_DESCRIPTION}</p>
            <TurkishOnlyNotice kind="blog" />
          </div>
          <a
            href="/feed.xml"
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-control border border-border bg-surface-1 px-3.5 text-sm font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:self-auto"
          >
            <Rss className="h-4 w-4 text-brand" aria-hidden />
            RSS ile takip et
          </a>
        </header>

        <nav aria-label="Kategoriler" className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {[{ slug: null, label: 'Tümü', count: Object.values(counts).reduce((a, b) => a + b, 0) }, ...BLOG_CATEGORIES.filter((c) => counts[c.slug] > 0).map((c) => ({ slug: c.slug as BlogCategorySlug | null, label: c.label, count: counts[c.slug] }))].map((c) => {
              const active = c.slug === category;
              return (
                <li key={c.slug ?? 'tumu'}>
                  <Link
                    href={hrefFor(c.slug, 1)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      active ? 'bg-brand text-brand-fg ring-brand' : 'bg-surface-1 text-fg-muted ring-border hover:bg-surface-2 hover:text-fg'
                    )}
                  >
                    {c.label}
                    <span className={cn('qx-num text-xs', active ? 'text-brand-fg' : 'text-fg-subtle')}>{c.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {activeCat ? (
          <p className="mt-4 text-sm text-fg-muted">
            <span className="font-medium text-fg">{activeCat.label}:</span> {activeCat.description}
          </p>
        ) : null}

        {all.length === 0 ? (
          <div className="mt-10 rounded-card border border-dashed border-border bg-surface-1 p-8 text-center">
            <p className="font-medium text-fg">Bu kategoride henüz yazı yok.</p>
            <p className="mt-1 text-sm text-fg-muted">Yeni yazılardan haberdar olmak için RSS beslemesine abone olabilirsiniz.</p>
            <Link href={PATH} className="mt-4 inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-brand hover:underline">
              Tüm yazılar
            </Link>
          </div>
        ) : (
          <>
            {featured ? (
              <div className="mt-8">
                <PostCard post={featured} featured />
              </div>
            ) : null}
            {pg.items.length ? (
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {pg.items.map((p) => (
                  <li key={p.slug}>
                    <PostCard post={p} />
                  </li>
                ))}
              </ul>
            ) : null}
            {pg.pageCount > 1 ? (
              <nav aria-label="Sayfalar" className="mt-10 flex items-center justify-between gap-3">
                {pg.page > 1 ? (
                  <Link
                    href={hrefFor(category, pg.page - 1)}
                    rel="prev"
                    className="inline-flex min-h-11 items-center gap-1 rounded-control border border-border bg-surface-1 px-4 text-sm font-medium text-fg hover:bg-surface-2"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Daha yeni
                  </Link>
                ) : (
                  <span />
                )}
                <span className="qx-num text-sm text-fg-muted">
                  Sayfa {pg.page} / {pg.pageCount}
                </span>
                {pg.page < pg.pageCount ? (
                  <Link
                    href={hrefFor(category, pg.page + 1)}
                    rel="next"
                    className="inline-flex min-h-11 items-center gap-1 rounded-control border border-border bg-surface-1 px-4 text-sm font-medium text-fg hover:bg-surface-2"
                  >
                    Daha eski
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}

        <BlogCta audience={category === 'gizlilik' ? 'consumer' : 'business'} category={category} source="index" className="mt-14" />
      </div>
    </>
  );
}
