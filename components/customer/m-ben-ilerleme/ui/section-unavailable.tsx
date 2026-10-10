import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMeCopy, type MeLocale } from '../copy';

/**
 * Bir bölüm sunucuda hesaplanamadığında (partial) görünen dürüst not — sıfır basmak yerine.
 * Sayfa sunucuda çizildiği için "yeniden dene" sayfa yenilemesidir (metin bunu söyler).
 */
export function SectionUnavailable({ locale, compact = false, className }: { locale: MeLocale; compact?: boolean; className?: string }) {
  const c = getMeCopy(locale).progress;
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-control border border-warning-border bg-warning-subtle text-warning-text',
        compact ? 'qx-caption px-2.5 py-2' : 'qx-small px-3 py-2.5',
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{c.sectionUnavailable}</span>
    </p>
  );
}
