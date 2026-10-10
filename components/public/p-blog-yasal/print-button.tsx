'use client';

import { Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Yazdır / PDF olarak kaydet — tarayıcının yazdırma iletişimini açar (yazdırma görünümü layout'ta). */
export function PrintButton({ className, label = 'Yazdır / PDF' }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface-1 px-3.5 text-sm font-medium text-fg transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden',
        className
      )}
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
