import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Paylaşım sayfalarının tam sayfa durum paneli (süresi doldu, kapandı, bulunamadı, teşekkür).
 * Sayfanın TEK `h1`'i buradadır; `role="status"` ile ekran okuyucuya duyurulur.
 * Hata (yeniden denenebilir) durumları için `ErrorState` kullanılır.
 */
export function StatusPanel({
  icon: Icon,
  visual,
  title,
  description,
  actions,
  tone = 'neutral',
  className,
  live = true,
}: {
  icon?: LucideIcon;
  /** İkon yerine özel görsel (ör. mekân logosu, kutlama). */
  visual?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: 'neutral' | 'success' | 'brand';
  className?: string;
  live?: boolean;
}) {
  const toneClass =
    tone === 'success' ? 'bg-success-subtle text-success' : tone === 'brand' ? 'bg-brand-subtle text-brand' : 'bg-surface-3 text-fg-muted';
  return (
    <div role={live ? 'status' : undefined} className={cn('flex w-full flex-col items-center text-center', className)}>
      {visual ??
        (Icon && (
          <span aria-hidden className={cn('mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full', toneClass)}>
            <Icon className="h-7 w-7" strokeWidth={1.75} />
          </span>
        ))}
      <h1 className="qx-h2 text-balance text-fg">{title}</h1>
      {description && <p className="qx-body mt-2 max-w-md text-pretty text-fg-muted">{description}</p>}
      {actions && <div className="mt-6 flex w-full max-w-xs flex-col gap-2">{actions}</div>}
    </div>
  );
}
