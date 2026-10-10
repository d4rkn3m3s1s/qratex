import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { GlowCard } from '@/components/ds/play';
import { navIcon } from '@/lib/navigation/icons';
import type { ShellItem } from '@/lib/navigation/shell-config';
import { formatNumber, getMeCopy, type MeLocale } from '../copy';

export type MeSectionHints = {
  levelText?: string | null;
  badgeCount?: number | null;
  pendingReviews?: number | null;
};

/**
 * Ben → alt bölüm bağlantıları. Liste sabit kodlanmaz: kayıttan (`lib/navigation/registry`)
 * ve admin'in menü/modül görünürlüğünden (`getShellConfig`) türer; `teamOnly` öğe yalnız
 * DB'de ekip rolü olana gösterilir. İpuçları gerçek veriden (rozet sayısı, bekleyen yorum).
 */
export function MeSections({ items, hints, locale }: { items: ShellItem[]; hints: MeSectionHints; locale: MeLocale }) {
  const c = getMeCopy(locale).me;
  if (items.length === 0) return <p className="qx-small text-fg-muted">{c.noSections}</p>;

  const hintFor = (id: string): string | null => {
    if (id === 'customer.me.progress') return hints.levelText ?? null;
    if (id === 'customer.me.badges' && hints.badgeCount != null && hints.badgeCount > 0) return c.hintBadges(formatNumber(hints.badgeCount, locale));
    if (id === 'customer.me.voices' && hints.pendingReviews != null && hints.pendingReviews > 0)
      return c.hintPending(formatNumber(hints.pendingReviews, locale));
    return null;
  };

  return (
    <section aria-labelledby="me-sections-heading" className="space-y-3">
      <h2 id="me-sections-heading" className="qx-h3 text-fg">
        {c.sections}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = navIcon(item.icon);
          const label = locale === 'en' ? item.label.en : item.label.tr;
          const desc = c.sectionCopy[item.id];
          const hint = hintFor(item.id);
          return (
            <li key={item.id} className="min-w-0">
              <GlowCard asChild interactive className="flex h-full min-h-[5.5rem] items-center gap-4">
                <Link href={item.href}>
                  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-subtle text-brand-text">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="qx-body block font-semibold text-fg">{label}</span>
                    {desc && <span className="qx-small block text-fg-muted">{desc}</span>}
                    {hint && <span className="qx-caption mt-1 inline-block rounded-chip bg-brand-subtle px-2 py-0.5 font-medium text-brand-text">{hint}</span>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted" />
                </Link>
              </GlowCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Kabuk yapılandırmasından `customer.me` öğesinin çocuklarını çıkarır (gruplu ya da düz). */
export function meChildren(nodes: ReadonlyArray<{ kind: 'item'; item: ShellItem } | { kind: 'group'; items: ShellItem[] }>): ShellItem[] {
  for (const node of nodes) {
    const list = node.kind === 'item' ? [node.item] : node.items;
    for (const item of list) {
      if (item.id === 'customer.me') return item.children;
    }
  }
  return [];
}
