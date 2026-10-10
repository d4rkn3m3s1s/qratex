import Link from 'next/link';
import { parseInline } from '@/lib/blog-posts';

const linkCls =
  'rounded-sm font-medium text-brand underline decoration-brand-border underline-offset-4 transition-colors duration-fast hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/** `[metin](/yol)` yazımını güvenli site içi bağlantıya çevirir (dış adres düz metin kalır). */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((seg, i) =>
        seg.type === 'link' ? (
          <Link key={i} href={seg.href} className={linkCls}>
            {seg.text}
          </Link>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
