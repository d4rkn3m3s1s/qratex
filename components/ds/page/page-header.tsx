'use client';

import { cn } from '@/lib/utils';
import { PageHeader as StatePageHeader, type PageHeaderProps as StatePageHeaderProps } from '@/components/states';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { useRegisterContext } from '../play/register';

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
 * görünür (iki ayrı "geri" olmasın). Ops kaydında kompakt başlıkta ikon çizilmez.
 */
export function PageHeader({ breadcrumbs, breadcrumbMax, className, back, icon, ...rest }: PageHeaderProps) {
  // Ops kaydında (yönetim konsolu vb.) kompakt başlık renkli ikon kutusu taşımaz:
  // sayfalar arası tek başlık ritmi; kimliği konum izi/eyebrow verir. Hero korunur.
  const register = useRegisterContext();
  const shownIcon = register === 'ops' && rest.variant !== 'hero' ? undefined : icon;
  const hasCrumbs = !!breadcrumbs && breadcrumbs.length > 0;
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      {hasCrumbs && (
        <Breadcrumbs items={breadcrumbs!} maxItems={breadcrumbMax} collapseOnMobile={!back} className={back ? 'hidden sm:block' : undefined} />
      )}
      <StatePageHeader {...rest} icon={shownIcon} back={back} />
    </div>
  );
}
