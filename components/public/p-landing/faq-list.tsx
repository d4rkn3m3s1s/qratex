import Link from 'next/link';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { PublicSection, SectionHeading } from './section';

/**
 * SSS: yerel `<details>/<summary>` akordeonu — JS gerektirmez, klavye ve ekran okuyucu
 * dostu, ilk HTML'de tam metin (FAQPage JSON-LD ile aynı içerik).
 */
export function FaqList({
  id = 'sss',
  eyebrow,
  title,
  items,
  trustLink,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  items: ReadonlyArray<{ q: string; a: string }>;
  trustLink?: string;
}) {
  return (
    <PublicSection id={id} labelledBy={`${id}-title`}>
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <div>
          <SectionHeading id={`${id}-title`} eyebrow={eyebrow} title={title} align="start" className="mb-0 sm:mb-0" />
          {trustLink ? (
            <p className="mt-4">
              <Link
                href="/guven"
                className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {trustLink}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-[hsl(var(--border-subtle))] border-y border-subtle">
          {items.map((item) => (
            <details key={item.q} className="qx-faq group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium text-fg transition-colors duration-fast hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-fg-muted transition-transform duration-base ease-standard group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="pb-5 pr-8 text-sm leading-relaxed text-fg-muted sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </PublicSection>
  );
}
