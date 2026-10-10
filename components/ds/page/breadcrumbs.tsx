'use client';

import { forwardRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePageCopy } from './copy';

export type BreadcrumbItem = {
  label: ReactNode;
  /** Son öğe (mevcut sayfa) için verilmez. */
  href?: string;
  /** Daraltılmış menüde gösterilecek düz metin (label düğümse). */
  textLabel?: string;
};

export type BreadcrumbsProps = {
  items: readonly BreadcrumbItem[];
  /** Bu sayıyı aşınca ortadaki öğeler "…" menüsüne toplanır. Varsayılan 4. */
  maxItems?: number;
  /**
   * Mobilde tam iz yerine yalnız üst sayfaya "‹ Üst sayfa" geri bağlantısı
   * (≥ 44px dokunma hedefi). Varsayılan true.
   */
  collapseOnMobile?: boolean;
  ariaLabel?: string;
  className?: string;
};

const linkClass =
  'inline-flex min-h-8 items-center rounded-chip px-1 text-fg-muted transition-colors duration-fast ease-standard hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Konum izi — `nav` + `ol`, son öğe `aria-current="page"`, ayırıcılar
 * ekran okuyucudan gizli. Uzun izlerde orta kısım klavyeyle açılan menüye
 * toplanır; mobilde tek geri bağlantısına dönüşür.
 */
export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs(
  { items, maxItems = 4, collapseOnMobile = true, ariaLabel, className },
  ref,
) {
  const copy = usePageCopy();
  if (!items.length) return null;

  const last = items.length - 1;
  const collapse = items.length > maxItems && maxItems >= 3;
  const hidden = collapse ? items.slice(1, items.length - (maxItems - 2)) : [];
  const shownTail = collapse ? items.slice(items.length - (maxItems - 2)) : items.slice(1);
  const parent = [...items.slice(0, last)].reverse().find((i) => i.href);

  const renderItem = (item: BreadcrumbItem, isLast: boolean) =>
    isLast || !item.href ? (
      <span aria-current={isLast ? 'page' : undefined} className={cn('min-w-0 truncate px-1', isLast ? 'font-medium text-fg' : 'text-fg-muted')}>
        {item.label}
      </span>
    ) : (
      <Link href={item.href} className={cn(linkClass, 'min-w-0 truncate')}>
        {item.label}
      </Link>
    );

  const sep = (
    <li aria-hidden className="flex shrink-0 items-center text-fg-subtle">
      <ChevronRight className="h-3.5 w-3.5" />
    </li>
  );

  return (
    <nav ref={ref} aria-label={ariaLabel ?? copy.breadcrumbNav} className={cn('qx-small min-w-0', className)}>
      {collapseOnMobile && parent?.href && (
        <Link href={parent.href} className={cn(linkClass, 'min-h-11 -ml-1 gap-1 sm:hidden')}>
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      <ol className={cn('flex min-w-0 flex-wrap items-center gap-0.5', collapseOnMobile && parent?.href ? 'hidden sm:flex' : '')}>
        <li className="flex min-w-0 items-center">{renderItem(items[0], last === 0)}</li>
        {collapse && (
          <>
            {sep}
            <li className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(linkClass, 'h-8 w-8 justify-center')}
                  aria-label={copy.hiddenCrumbs}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {hidden.map((item, i) =>
                    item.href ? (
                      <DropdownMenuItem key={i} asChild>
                        <Link href={item.href}>{item.textLabel ?? item.label}</Link>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={i} disabled>
                        {item.textLabel ?? item.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          </>
        )}
        {shownTail.map((item, i) => {
          const index = items.length - shownTail.length + i;
          return (
            <BreadcrumbSegment key={index} sep={sep}>
              {renderItem(item, index === last)}
            </BreadcrumbSegment>
          );
        })}
      </ol>
    </nav>
  );
});

function BreadcrumbSegment({ sep, children }: { sep: ReactNode; children: ReactNode }) {
  return (
    <>
      {sep}
      <li className="flex min-w-0 items-center">{children}</li>
    </>
  );
}
