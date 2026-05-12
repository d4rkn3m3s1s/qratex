'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

type InlineLoadingStatusProps = {
  className?: string;
  spinnerClassName?: string;
  /** `description` yoksa sr-only olarak okunur */
  label?: string;
  /** Görünür alt metin; verilirse `label` kullanılmaz */
  description?: ReactNode;
};

/** Küçük alan yükleme: durum bildirimi + isteğe bağlı görünür metin */
export function InlineLoadingStatus({
  className,
  spinnerClassName,
  label,
  description,
}: InlineLoadingStatusProps) {
  const t = useAppT();
  const resolvedLabel = label ?? t('common.loading');
  const showDescription = description != null && description !== false && description !== '';
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center',
        showDescription && 'flex-col gap-3',
        className
      )}
    >
      <Loader2
        className={cn('h-8 w-8 shrink-0 animate-spin text-muted-foreground', spinnerClassName)}
        aria-hidden
      />
      {showDescription ? (
        typeof description === 'string' ? (
          <p className="text-sm text-muted-foreground text-center">{description}</p>
        ) : (
          description
        )
      ) : (
        <span className="sr-only">{resolvedLabel}</span>
      )}
    </div>
  );
}
