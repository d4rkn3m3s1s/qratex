import type { Metadata } from 'next';
import Link from 'next/link';
import { BLOG_POSTS, formatBlogDate } from '@/lib/blog-posts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar, ArrowRight, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'QRateX blog: QR kod, geri bildirim, gamification ve müşteri deneyimi üzerine yazılar.',
};

export default function BlogPage() {
  return (
    <div className="container px-4 py-12 md:py-16">
      <div className="mb-12 max-w-2xl">
        <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Blog
        </span>
        <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">İçgörüler & Rehberler</h1>
        <p className="text-muted-foreground">
          QR kod, geri bildirim, gamification ve müşteri deneyimi üzerine yazılar.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="h-full overflow-hidden border-border/50 bg-card/60 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished, 'short')}</time>
                  </span>
                  {post.readingMinutes ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {post.readingMinutes} dk okuma
                    </span>
                  ) : null}
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  aria-hidden
                />
              </CardHeader>
              <CardContent>
                <h2 className="mb-2 text-xl font-semibold transition-colors group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="text-sm text-muted-foreground">{post.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
