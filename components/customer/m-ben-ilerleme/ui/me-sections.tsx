import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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
      {/* Gruplu liste (ayarlar düzeni): eskiden her bölüm ayrı parlayan kart + ikon + açıklama
          tekrarıydı; profil kartıyla aynı ağırlıkta yarışıyordu. Şimdi tek yüzey, satırlar. */}
      <ul className="overflow-hidden rounded-card border border-border bg-surface-1 qx-elevation-1 sm:grid sm:grid-cols-2">
        {items.map((item) => {
          const Icon = navIcon(item.icon);
          const label = locale === 'en' ? item.label.en : item.label.tr;
          const desc = c.sectionCopy[item.id];
          const hint = hintFor(item.id);
          return (
            <li key={item.id} className="min-w-0 border-b border-border last:border-b-0 sm:odd:border-r sm:last:odd:col-span-2 sm:last:odd:border-r-0">
              <Link
                href={item.href}
                className="group flex min-h-16 items-center gap-3 px-4 py-3 outline-none transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus active:bg-surface-2"
              >
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-2 text-fg-muted transition-colors duration-fast group-hover:text-brand-text">
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="qx-small block font-semibold text-fg">{label}</span>
                  {/* Gerçek veriden ipucu varsa jenerik açıklamanın yerini alır (ör. "4 yorum bekliyor"). */}
                  {hint ? (
                    <span className="qx-caption block truncate font-medium text-brand-text">{hint}</span>
                  ) : desc ? (
                    <span className="qx-caption block truncate text-fg-muted">{desc}</span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle transition-transform duration-fast ease-standard motion-safe:group-hover:translate-x-0.5" />
              </Link>
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
