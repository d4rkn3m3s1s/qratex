'use client';

/**
 * Başlık aksiyonları: "x önce güncellendi" (veri tazeliği — rapor #50), önbelleği atlayan
 * "Yenile" (#5: dönen ikon + erişilebilir ad) ve CSV "Dışa aktar" menüsü (#42).
 */
import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { relativeTime, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

export function UpdatedAt({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const locale = useAdminAnalyticsLocale();
  const copy = useAdminAnalyticsCopy();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!iso) return null;
  return (
    <time dateTime={iso} className={cn('qx-caption tabular-nums text-fg-subtle', className)}>
      {now == null ? ' ' : copy.updatedAgo(relativeTime(iso, now, locale))}
    </time>
  );
}

export function RefreshButton({ onRefresh, pending, disabled }: { onRefresh: () => void; pending: boolean; disabled?: boolean }) {
  const copy = useAdminAnalyticsCopy();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-11 min-h-11 gap-2 sm:h-9 sm:min-h-9"
      onClick={onRefresh}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    >
      <RefreshCw className={cn('h-4 w-4', pending && 'motion-safe:animate-spin')} aria-hidden />
      <span>{pending ? copy.refreshing : copy.refresh}</span>
    </Button>
  );
}

export interface ExportItem {
  key: string;
  label: string;
  csv: (() => { content: string; fileName: string }) | null;
}

function download(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMenu({ items, disabled }: { items: readonly ExportItem[]; disabled?: boolean }) {
  const copy = useAdminAnalyticsCopy();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-11 min-h-11 gap-2 sm:h-9 sm:min-h-9" disabled={disabled}>
          <Download className="h-4 w-4" aria-hidden />
          <span>{copy.export}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="qx-caption text-fg-muted">CSV</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={!item.csv}
            className="min-h-11 sm:min-h-9"
            onSelect={() => {
              if (!item.csv) return;
              const { content, fileName } = item.csv();
              download(content, fileName);
              toast.success(copy.exportDone);
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 sm:min-h-9" onSelect={() => window.print()}>
          {copy.exportPrint}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
