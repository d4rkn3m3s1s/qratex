import type { Metadata } from 'next';
import Link from 'next/link';
import { BLOG_POSTS } from '@/lib/blog-posts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'QRATEX blog: QR kod, geri bildirim, gamification ve müşteri deneyimi üzerine yazılar.',
};

export default function BlogPage() {
  return (
    <div className="container px-4 py-10 md:py-14">
      <h1 className="mb-2 text-3xl font-bold">Blog</h1>
      <p className="mb-10 text-muted-foreground">
        QR kod, geri bildirim ve müşteri deneyimi üzerine içerikler.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="h-full overflow-hidden shadow-sm transition-shadow duration-200 group-hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                  <time dateTime={post.datePublished}>
                    {new Date(post.datePublished).toLocaleDateString('tr-TR')}
                  </time>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <h2 className="mb-2 text-xl font-semibold">{post.title}</h2>
                <p className="text-sm text-muted-foreground">{post.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
