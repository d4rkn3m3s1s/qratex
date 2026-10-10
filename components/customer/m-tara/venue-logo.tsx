/**
 * Mekân logosu — logo yoksa adın baş harfi (sunucu ve istemci bileşenlerinde kullanılır; kancasız).
 */
import { cn } from '@/lib/utils';

export function VenueLogo({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-base';
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici/R2 URL'si; next/image alan adı listesine bağlı kalmasın
      <img
        src={logoUrl}
        alt=""
        className={cn(box, 'shrink-0 rounded-control border border-subtle bg-surface-2 object-cover')}
        loading="lazy"
        decoding="async"
      />
    );
  }
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        box,
        'inline-flex shrink-0 items-center justify-center rounded-control bg-brand-subtle font-display font-semibold text-brand'
      )}
    >
      {initial}
    </span>
  );
}
