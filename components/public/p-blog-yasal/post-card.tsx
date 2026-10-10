import Link from 'next/link';
import { BookOpen, Calendar, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import {
  AUDIENCE_LABELS,
  formatBlogDate,
  getCategory,
  getReadingMinutes,
  type BlogCategorySlug,
  type BlogPost,
} from '@/lib/blog-posts';
import { cn } from '@/lib/utils';

const CATEGORY_TOKEN: Readonly<Record<BlogCategorySlug, string>> = {
  'isletme-rehberi': '--category-2',
  oyunlastirma: '--category-3',
  gizlilik: '--category-6',
};

const CATEGORY_ICON: Readonly<Record<BlogCategorySlug, typeof BookOpen>> = {
  'isletme-rehberi': BookOpen,
  oyunlastirma: Sparkles,
  gizlilik: ShieldCheck,
};

/**
 * Kapak: yazıya görsel yüklenmediği sürece kategori renginden üretilen marka kapağı
 * (sahte stok görsel yok). Dekoratif → `aria-hidden`.
 */
export function PostCover({ category, className, size = 'md' }: { category: BlogCategorySlug; className?: string; size?: 'md' | 'lg' }) {
  const Icon = CATEGORY_ICON[category];
  const token = CATEGORY_TOKEN[category];
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden', className)}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 85% 10%, hsl(var(${token}) / 0.55), transparent 60%), linear-gradient(135deg, hsl(var(--brand) / 0.85), hsl(var(${token}) / 0.9))`,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.18)_1px,transparent_0)] [background-size:18px_18px]" />
      <Icon
        className={cn('absolute text-brand-fg opacity-90 drop-shadow-sm', size === 'lg' ? 'bottom-6 right-6 h-16 w-16' : 'bottom-4 right-4 h-10 w-10')}
        strokeWidth={1.5}
      />
    </div>
  );
}

export function CategoryChip({ category, href }: { category: BlogCategorySlug; href?: string }) {
  const label = getCategory(category)?.label ?? category;
  const cls =
    'relative z-[2] inline-flex min-h-7 items-center rounded-full bg-brand-subtle px-2.5 text-xs font-semibold text-brand ring-1 ring-inset ring-brand-border';
  return href ? (
    <Link href={href} className={cn(cls, 'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus')}>
      {label}
    </Link>
  ) : (
    <span className={cls}>{label}</span>
  );
}

export function PostMeta({ post, className }: { post: BlogPost; className?: string }) {
  const minutes = getReadingMinutes(post);
  return (
    <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted', className)}>
      <span className="inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished, 'short')}</time>
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {minutes} dk okuma
      </span>
      <span>{AUDIENCE_LABELS[post.audience]}</span>
    </p>
  );
}

/**
 * Yazı kartı — `article` + başlıktaki bağlantı kartın tamamına gerilir (stretched link), böylece
 * erişilebilir ad yalnız başlıktır. Hover kalkması yalnız `motion-safe`.
 */
export function PostCard({ post, featured = false, headingLevel = 'h2' }: { post: BlogPost; featured?: boolean; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  const titleId = `post-${post.slug}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'group relative flex h-full overflow-hidden rounded-card border border-border bg-surface-1 qx-elevation-1 transition-[transform,box-shadow,border-color] duration-fast ease-standard hover:border-brand-border hover:shadow-lg focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background motion-safe:hover:-translate-y-0.5',
        featured ? 'flex-col md:flex-row' : 'flex-col'
      )}
    >
      <PostCover
        category={post.category}
        size={featured ? 'lg' : 'md'}
        className={featured ? 'aspect-[16/9] md:aspect-auto md:w-1/2 md:min-h-[18rem]' : 'aspect-[16/7]'}
      />
      <div className={cn('flex flex-1 flex-col gap-3', featured ? 'p-6 md:p-8' : 'p-5')}>
        <div className="flex flex-wrap items-center gap-2">
          {featured ? <span className="qx-overline text-brand">Son yazı</span> : null}
          <CategoryChip category={post.category} />
        </div>
        <H id={titleId} className={cn('font-semibold leading-snug text-fg', featured ? 'qx-h1 text-2xl md:text-3xl' : 'text-lg')}>
          <Link
            href={`/blog/${post.slug}`}
            className="after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:outline-none group-hover:text-brand"
          >
            {post.title}
          </Link>
        </H>
        <p className={cn('text-fg-muted', featured ? 'text-base leading-7' : 'line-clamp-3 text-sm leading-6')}>{post.description}</p>
        <PostMeta post={post} className="mt-auto pt-1" />
      </div>
    </article>
  );
}
