import { Info, Lightbulb, Link2 } from 'lucide-react';
import { getPostToc, plainText, type BlogBlock } from '@/lib/blog-posts';
import { cn } from '@/lib/utils';
import { InlineText } from './inline-text';

/**
 * Tipli blok render'ı — `prose` eklentisi kurulu olmadığı için (`@tailwindcss/typography`
 * yok) her blok açık sınıflarla stillenir: başlık hiyerarşisi, madde işaretleri, paragraf
 * aralığı ve ~68ch okuma genişliği garanti (blog_slug bulgu 1 — ölü `prose` sınıfı).
 * h2'ler içindekilerle aynı çapayı taşır; hover/odakta görünen "#" ile bölüm linki kopyalanabilir.
 */
export function ArticleBody({ content, className }: { content: readonly BlogBlock[]; className?: string }) {
  const toc = getPostToc({ content: [...content] });
  const idByIndex = new Map(toc.map((t) => [t.blockIndex, t.id]));

  return (
    <div className={cn('max-w-[68ch] text-[1.0625rem] leading-[1.75] text-fg', className)}>
      {content.map((b, i) => {
        const first = i === 0;
        switch (b.type) {
          case 'h2': {
            const id = idByIndex.get(i) ?? `bolum-${i}`;
            return (
              <div key={i} className="group mt-12 flex items-center gap-1 first:mt-0">
                <h2 id={id} className="qx-h2 scroll-mt-24 text-2xl text-fg">
                  <InlineText text={b.text} />
                </h2>
                <a
                  href={`#${id}`}
                  aria-label={`“${plainText(b.text)}” bölümünün bağlantısı`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-fg-subtle opacity-0 transition-opacity duration-fast hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus group-hover:opacity-100 print:hidden"
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                </a>
              </div>
            );
          }
          case 'h3':
            return (
              <h3 key={i} className="qx-h3 mt-8 text-lg text-fg">
                <InlineText text={b.text} />
              </h3>
            );
          case 'ul':
          case 'ol': {
            const Tag = b.type;
            return (
              <Tag
                key={i}
                className={cn(
                  first ? '' : 'mt-5',
                  'space-y-2 pl-6 marker:text-brand',
                  b.type === 'ul' ? 'list-disc' : 'list-decimal marker:font-semibold'
                )}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <InlineText text={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case 'callout': {
            const Icon = b.tone === 'tip' ? Lightbulb : Info;
            return (
              <aside
                key={i}
                aria-label={b.title ?? (b.tone === 'tip' ? 'İpucu' : 'Not')}
                className={cn(
                  'mt-6 flex gap-3 rounded-card border p-4 text-base leading-7',
                  b.tone === 'tip' ? 'border-brand-border bg-brand-subtle' : 'border-info-border bg-info-subtle'
                )}
              >
                <Icon className={cn('mt-1 h-5 w-5 shrink-0', b.tone === 'tip' ? 'text-brand' : 'text-info')} aria-hidden />
                <div>
                  {b.title ? <p className="font-semibold text-fg">{b.title}</p> : null}
                  <p className={b.title ? 'mt-1' : undefined}>
                    <InlineText text={b.text} />
                  </p>
                </div>
              </aside>
            );
          }
          case 'quote':
            return (
              <figure key={i} className="mt-6 border-l-4 border-brand pl-4">
                <blockquote className="text-lg italic leading-8 text-fg">
                  <InlineText text={b.text} />
                </blockquote>
                {b.cite ? <figcaption className="mt-2 text-sm text-fg-muted">— {b.cite}</figcaption> : null}
              </figure>
            );
          default:
            return (
              <p key={i} className={first ? undefined : 'mt-5'}>
                <InlineText text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
