'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tutarlı boş-durum bileşeni: yumuşak gradyanlı ikon halkası + başlık + açıklama + opsiyonel aksiyon.
 * İnline "veri yok" metinleri yerine kullanılır.
 */
export function EmptyState({
  icon: Icon, title, description, action, className, compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-6' : 'gap-3 py-12', className)}>
      <div className={cn(
        'grid place-items-center rounded-2xl bg-gradient-to-br from-primary/10 to-fuchsia-500/10 text-primary/70 ring-1 ring-border/40',
        compact ? 'h-10 w-10' : 'h-14 w-14'
      )}>
        <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </div>
      <div className="space-y-0.5">
        <p className={cn('font-semibold text-foreground/80', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
