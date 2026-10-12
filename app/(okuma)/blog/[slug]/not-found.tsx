import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/public/p-blog-yasal/post-card';
import { getAllPosts } from '@/lib/blog-posts';
import { TurkishOnlyNotice } from '@/components/public/p-blog-yasal/turkish-only-notice';

/** Bilinmeyen / kaldırılmış yazı — genel 404 yerine son yazılara yönlendirir. */
export default function BlogPostNotFound() {
  const latest = getAllPosts().slice(0, 3);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">
      <div className="max-w-2xl space-y-3">
        <p className="qx-overline text-brand">404</p>
        <h1 className="qx-h1 text-balance text-3xl text-fg">Bu yazıyı bulamadık</h1>
        <p className="text-base leading-7 text-fg-muted">
          Yazı kaldırılmış ya da adresi değişmiş olabilir. Son yazılarımıza göz atabilir ya da tüm yazılara dönebilirsiniz.
        </p>
        <TurkishOnlyNotice kind="blog" />
        <Button asChild className="mt-2">
          <Link href="/blog">Tüm yazılar</Link>
        </Button>
      </div>
      {latest.length ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((p) => (
            <li key={p.slug}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
