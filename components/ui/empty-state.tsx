'use client';

import type { LucideIcon } from 'lucide-react';
import { EmptyState as QdlEmptyState } from '@/components/states/empty-state';

/**
 * Geriye uyumlu boş-durum bileşeni (eski API: icon zorunlu, title, description,
 * action, compact). Görünüm artık QDL `components/states/empty-state` ile aynı:
 * rol token'lı ikon çipi (eski sabit `to-fuchsia-500/10` gradyanı kalktı),
 * `role="status"`, azaltılmış harekete saygılı giriş.
 * Yeni kod doğrudan `@/components/states` → `EmptyState` (variant, secondaryAction…) kullanmalı.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <QdlEmptyState
      icon={icon}
      title={title}
      description={description ?? null}
      action={action}
      className={className}
      compact={compact}
      tone="brand"
      headingLevel="p"
    />
  );
}
