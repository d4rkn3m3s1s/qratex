import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeoSettings, getCanonicalBase } from '@/lib/seo-settings';
import { getPostBySlug, BLOG_POSTS } from '@/lib/blog-posts';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';

export async function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Yazı bulunamadı' };
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${base}/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const url = `${base}/blog/${post.slug}`;
  const showModified = post.dateModified !== post.datePublished;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: seo.siteName, url: base },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <div className="container px-4 py-10 md:py-14 max-w-3xl">
        <BreadcrumbNav
          items={[
            { name: 'Ana Sayfa', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]}
        />
        <article aria-labelledby="blog-post-title">
          <header className="mb-8">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <time dateTime={post.datePublished}>
                Yayın{' '}
                {new Date(post.datePublished).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </time>
              {showModified ? (
                <time dateTime={post.dateModified}>
                  Güncellenme{' '}
                  {new Date(post.dateModified).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              ) : null}
            </div>
            <h1 id="blog-post-title" className="mt-2 text-3xl font-bold md:text-4xl">
              {post.title}
            </h1>
            <p className="mt-2 text-muted-foreground">{post.description}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="text-muted-foreground/80">Yazar:</span>{' '}
              {post.author}
            </p>
          </header>
          <div className="prose prose-neutral max-w-none dark:prose-invert">
            <p>{post.description}</p>
            <p>
              Bu yazı QRATEX blog serisinin bir parçasıdır. Geri bildirim ve müşteri deneyimi hakkında daha fazla içerik
              için{' '}
              <Link
                href="/blog"
                className="text-primary underline decoration-primary/60 underline-offset-2 outline-none transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                blog ana sayfasına
              </Link>{' '}
              göz atın.
            </p>
          </div>
        </article>
        <nav className="mt-10" aria-label="Blog gezintisi">
          <Link
            href="/blog"
            className="rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            ← Tüm yazılar
          </Link>
        </nav>
      </div>
    </>
  );
}
