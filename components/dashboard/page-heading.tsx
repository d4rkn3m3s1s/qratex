'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Desktop-only row below the layout sticky bar (replaces per-page DashboardHeader title/actions). */
export function DashboardPageHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'hidden sm:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 text-pretty">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
