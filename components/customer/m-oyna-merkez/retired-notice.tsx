import Link from 'next/link';
import { ArrowRight, Archive } from 'lucide-react';
import type { RetiredNotice as Notice } from '@/lib/play-hub/retired';
import { playHubCopy, type PlayLocale } from './copy';
import { CTA_SECONDARY_CLASS } from './styles';

/** Emekli bir oyunun eski bağlantısından gelen kullanıcıya tek seferlik, dürüst not. */
export function RetiredNotice({ locale, notice }: { locale: PlayLocale; notice: Notice }) {
  const c = playHubCopy(locale);
  return (
    <section
      role="status"
      aria-labelledby="hub-retired"
      className="flex flex-col gap-3 rounded-card border border-info-border bg-info-subtle p-card sm:flex-row sm:items-center"
    >
      <Archive className="size-6 shrink-0 text-info" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="hub-retired" className="qx-body font-semibold text-fg">
          {c.retiredTitle(notice.title)}
        </h2>
        <p className="qx-small text-fg-muted">{c.retiredBody}</p>
      </div>
      {notice.successor && (
        <Link href={notice.successor.href} className={CTA_SECONDARY_CLASS}>
          {c.retiredSuccessor(notice.successor.title)}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}
