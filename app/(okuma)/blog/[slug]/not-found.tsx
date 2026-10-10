import Link from 'next/link';
import { PostCard } from '@/components/public/p-blog-yasal/post-card';
import { getAllPosts } from '@/lib/blog-posts';

/** Bilinmeyen / kaldırılmış yazı — genel 404 yerine son yazılara yönlendirir. */
export default function BlogPostNotFound() {
  const latest = getAllPosts().slice(0, 3);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">
      <div className="max-w-2xl space-y-3">
        <p className="qx-overline text-brand">404</p>
        <h1 className="qx-h1 text-3xl text-fg">Bu yazıyı bulamadık</h1>
        <p className="text-base leading-7 text-fg-muted">
          Yazı kaldırılmış ya da adresi değişmiş olabilir. Son yazılarımıza göz atabilir ya da tüm yazılara dönebilirsiniz.
        </p>
        <Link
          href="/blog"
          className="inline-flex min-h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-brand-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          Tüm yazılar
        </Link>
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
