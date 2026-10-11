import Link from 'next/link';
import { parseCmsMarkdown, type CmsInline } from '@/lib/cms-pages/contract';
import { cn } from '@/lib/utils';

/**
 * İçerik sayfası gövdesi — hem public `/sayfa/<slug>` hem admin canlı önizleme AYNI bileşeni
 * kullanır (önizleme = yayın). HTML enjeksiyonu yok: markdown alt kümesi bloklara ayrıştırılıp
 * React ile render edilir; yalnız güvenli bağlantılar (`safeHref`) tıklanabilir.
 */
function Inline({ items }: { items: CmsInline[] }) {
  return (
    <>
      {items.map((it, i) => {
        if (it.t === 'strong') return <strong key={i} className="font-semibold text-fg">{it.v}</strong>;
        if (it.t === 'em') return <em key={i}>{it.v}</em>;
        if (it.t === 'link') {
          const cls = 'font-medium text-brand-text underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm';
          return it.href.startsWith('/') && !it.href.startsWith('//') ? (
            <Link key={i} href={it.href} className={cls}>{it.v}</Link>
          ) : (
            <a key={i} href={it.href} className={cls} rel="noopener noreferrer" target={/^https?:/i.test(it.href) ? '_blank' : undefined}>
              {it.v}
            </a>
          );
        }
        return <span key={i}>{it.v}</span>;
      })}
    </>
  );
}

export function CmsContent({ body, className }: { body: string; className?: string }) {
  const blocks = parseCmsMarkdown(body);
  return (
    <div className={cn('space-y-4 text-[15px] leading-7 text-fg-muted sm:text-base', className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level === 2 ? (
              <h2 key={i} id={b.id} className="scroll-mt-24 pt-4 text-xl font-semibold tracking-tight text-fg sm:text-2xl">{b.text}</h2>
            ) : (
              <h3 key={i} id={b.id} className="scroll-mt-24 pt-2 text-lg font-semibold text-fg">{b.text}</h3>
            );
          case 'p':
            return <p key={i}><Inline items={b.inl} /></p>;
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-fg-subtle">
                {b.items.map((it, j) => <li key={j}><Inline items={it} /></li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-1.5 pl-6 marker:text-fg-subtle">
                {b.items.map((it, j) => <li key={j}><Inline items={it} /></li>)}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-brand-border pl-4 italic text-fg">
                <Inline items={b.inl} />
              </blockquote>
            );
          case 'hr':
            return <hr key={i} className="my-6 border-border" />;
        }
      })}
    </div>
  );
}
