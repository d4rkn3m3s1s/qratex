import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/ds/page/breadcrumbs';
import { ArticleBody } from '@/components/public/p-blog-yasal/article-body';
import { BlogCta } from '@/components/public/p-blog-yasal/blog-cta';
import { JsonLd, breadcrumbLd } from '@/components/public/p-blog-yasal/json-ld';
import { MobileToc } from '@/components/public/p-blog-yasal/legal-document';
import { CategoryChip, PostCard, PostCover } from '@/components/public/p-blog-yasal/post-card';
import { ReadingProgress } from '@/components/public/p-blog-yasal/reading-progress';
import { ShareActions } from '@/components/public/p-blog-yasal/share-actions';
import { TocNav } from '@/components/public/p-blog-yasal/toc-nav';
import { TurkishOnlyNotice } from '@/components/public/p-blog-yasal/turkish-only-notice';
import {
  BLOG_POSTS,
  countWords,
  formatBlogDate,
  getAdjacentPosts,
  getCategory,
  getPostBySlug,
  getPostToc,
  getReadingMinutes,
  getRelatedPosts,
} from '@/lib/blog-posts';
import { buildReadingMetadata, getReadingSeoContext } from '@/lib/legal/seo';

/**
 * /blog/[slug] — sakin, okunur editoryal sayfa. Statik üretilir (`generateStaticParams`);
 * istemci adaları yalnız okuma çubuğu, içindekiler scroll-spy'ı, paylaş ve dil notu.
 * SEO: canonical + eksiksiz OG (url/siteName/locale) + yazıya özel OG görseli
 * (`opengraph-image.tsx`) + BlogPosting (Organization yazar, image, mainEntityOfPage,
 * inLanguage, publisher.logo) + BreadcrumbList — JSON-LD `<` kaçışlı.
 */
export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Yazı bulunamadı', robots: { index: false } };
  const ctx = await getReadingSeoContext();
  return buildReadingMetadata(ctx, {
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.description,
    type: 'article',
    publishedTime: post.datePublished,
    modifiedTime: post.dateModified,
    authors: [post.author.name],
    section: getCategory(post.category)?.label,
    tags: post.tags,
    // Yazıya özel kart: aynı segmentteki opengraph-image.tsx (dosya tabanlı) kullanılır.
    image: false,
  });
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const { base, seo } = await getReadingSeoContext();
  const url = `${base}/blog/${post.slug}`;
  const minutes = getReadingMinutes(post);
  const toc = getPostToc(post);
  const related = getRelatedPosts(post, 3);
  const { newer, older } = getAdjacentPosts(post.slug);
  const category = getCategory(post.category);
  const showModified = post.dateModified.slice(0, 10) !== post.datePublished.slice(0, 10);
  const crumbs = [
    { name: 'Ana Sayfa', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: post.title, path: `/blog/${post.slug}` },
  ];

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            url,
            mainEntityOfPage: { '@type': 'WebPage', '@id': url },
            image: [`${url}/opengraph-image`],
            inLanguage: 'tr-TR',
            datePublished: post.datePublished,
            dateModified: post.dateModified,
            wordCount: countWords(post),
            timeRequired: `PT${minutes}M`,
            articleSection: category?.label,
            keywords: post.tags.join(', '),
            author: { '@type': post.author.kind, name: post.author.name, ...(post.author.kind === 'Organization' ? { url: base } : {}) },
            publisher: {
              '@type': 'Organization',
              name: seo.organizationName || seo.siteName,
              url: base,
              logo: { '@type': 'ImageObject', url: `${base}/logo/logo.png` },
            },
          },
          breadcrumbLd(base, crumbs),
        ]}
      />
      <ReadingProgress />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Breadcrumbs
          className="print:hidden"
          items={[{ label: 'Ana Sayfa', href: '/' }, { label: 'Blog', href: '/blog' }, { label: post.title }]}
        />

        <article lang="tr" aria-labelledby="post-title" className="mt-6">
          <header className="mx-auto max-w-3xl space-y-4 lg:mx-0">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChip category={post.category} href={`/blog?kategori=${post.category}`} />
            </div>
            <h1 id="post-title" className="qx-h1 text-3xl text-fg md:text-5xl md:leading-[1.1]">
              {post.title}
            </h1>
            <p className="text-lg leading-8 text-fg-muted">{post.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-2 font-medium text-fg">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-subtle text-brand" aria-hidden>
                  <Building2 className="h-4 w-4" />
                </span>
                {post.author.name}
              </span>
              <span>
                <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
              </span>
              {showModified ? (
                <span>
                  Güncellendi: <time dateTime={post.dateModified}>{formatBlogDate(post.dateModified)}</time>
                </span>
              ) : null}
              <span>{minutes} dk okuma</span>
            </div>
            <ShareActions url={url} title={post.title} slug={post.slug} />
            <TurkishOnlyNotice kind="article" />
          </header>

          <PostCover category={post.category} size="lg" className="mt-8 aspect-[21/9] rounded-card print:hidden" />

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="min-w-0">
              {toc.length >= 3 ? <MobileToc items={toc.map((t) => ({ id: t.id, label: t.text }))} className="mb-8 lg:hidden" /> : null}
              <ArticleBody content={post.content} />
            </div>
            {toc.length >= 3 ? (
              <aside className="hidden lg:block print:hidden">
                <div className="sticky top-24">
                  <TocNav items={toc.map((t) => ({ id: t.id, label: t.text }))} label="İçindekiler" />
                </div>
              </aside>
            ) : null}
          </div>
        </article>

        <BlogCta audience={post.audience} category={post.category} source={post.slug} className="mt-14" />

        {newer || older ? (
          <nav aria-label="Önceki ve sonraki yazı" className="mt-10 grid gap-3 sm:grid-cols-2 print:hidden">
            {older ? (
              <Link
                href={`/blog/${older.slug}`}
                rel="prev"
                className="flex min-h-11 flex-col gap-1 rounded-card border border-border bg-surface-1 p-4 hover:border-brand-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Önceki yazı
                </span>
                <span className="font-medium text-fg">{older.title}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {newer ? (
              <Link
                href={`/blog/${newer.slug}`}
                rel="next"
                className="flex min-h-11 flex-col items-end gap-1 rounded-card border border-border bg-surface-1 p-4 text-right hover:border-brand-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                  Sonraki yazı <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="font-medium text-fg">{newer.title}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}

        {related.length ? (
          <section aria-labelledby="ilgili-yazilar" className="mt-14 print:hidden">
            <div className="flex items-end justify-between gap-3">
              <h2 id="ilgili-yazilar" className="qx-h2 text-2xl text-fg">
                Bunları da okuyun
              </h2>
              <Link href="/blog" className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-brand hover:underline">
                Tüm yazılar <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug}>
                  <PostCard post={p} headingLevel="h3" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
