'use client';

import { cn } from '@/lib/utils';
import { PageHeader as StatePageHeader, type PageHeaderProps as StatePageHeaderProps } from '@/components/states';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';

export type PageHeaderProps = StatePageHeaderProps & {
  /** Konum izi (başlığın üstünde). Mobilde "‹ Üst sayfa" bağlantısına daralır. */
  breadcrumbs?: readonly BreadcrumbItem[];
  /** Konum izinin en fazla öğe sayısı (fazlası "…" menüsüne). */
  breadcrumbMax?: number;
};

/**
 * Sayfa başlığı — `components/states` PageHeader'ının (tek `h1`, eyebrow,
 * açıklama, aksiyonlar, meta, geri bağlantısı, `hero|compact`) üstüne konum
 * izi ekler. Kural: `hero` yalnız panel ana sayfalarında; diğerleri `compact`.
 *
 * Geri bağlantısı ile konum izi birlikte verilirse mobilde yalnız `back`
 * görünür (iki ayrı "geri" olmasın).
 */
export function PageHeader({ breadcrumbs, breadcrumbMax, className, back, ...rest }: PageHeaderProps) {
  const hasCrumbs = !!breadcrumbs && breadcrumbs.length > 0;
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      {hasCrumbs && (
        <Breadcrumbs items={breadcrumbs!} maxItems={breadcrumbMax} collapseOnMobile={!back} className={back ? 'hidden sm:block' : undefined} />
      )}
      <StatePageHeader {...rest} back={back} />
    </div>
  );
}
