import { BedDouble, CakeSlice, Coffee, Croissant, Store, UtensilsCrossed, Wine, type LucideIcon } from 'lucide-react';
import type { PlaceCategory } from '@/lib/places/categories';
import { cn } from '@/lib/utils';

/**
 * Kategori = kimlik rengi (QDL `--category-*`). Kategori bilinmiyorsa marka rengi.
 * Sunucu ve istemci bileşenlerinde kullanılır (hook yok).
 */
const CATEGORY_TOKEN: Record<PlaceCategory, string> = {
  kahve: '--category-7',
  restoran: '--category-5',
  tatli: '--category-8',
  kahvalti: '--category-4',
  bar: '--category-1',
  konaklama: '--category-2',
};

const CATEGORY_ICON: Record<PlaceCategory, LucideIcon> = {
  kahve: Coffee,
  restoran: UtensilsCrossed,
  tatli: CakeSlice,
  kahvalti: Croissant,
  bar: Wine,
  konaklama: BedDouble,
};

export function categoryColorVar(category: PlaceCategory | null): string {
  return category ? CATEGORY_TOKEN[category] : '--brand';
}

export function categoryIcon(category: PlaceCategory | null): LucideIcon {
  return category ? CATEGORY_ICON[category] : Store;
}

/** İşletme logosu; yoksa kategori ikonlu, kimlik renkli kare. Dekoratif (ad metinle verilir). */
export function VenueAvatar({
  logo,
  category,
  size = 'md',
  className,
}: {
  logo: string | null;
  category: PlaceCategory | null;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici/veri URL'si olabilir
      <img src={logo} alt="" className={cn(box, 'shrink-0 rounded-card border border-subtle bg-surface-1 object-cover', className)} />
    );
  }
  const Icon = categoryIcon(category);
  const token = categoryColorVar(category);
  return (
    <span
      aria-hidden
      className={cn(box, 'inline-flex shrink-0 items-center justify-center rounded-card border', className)}
      style={{
        background: `hsl(var(${token}) / 0.14)`,
        borderColor: `hsl(var(${token}) / 0.35)`,
        color: `hsl(var(${token}))`,
      }}
    >
      <Icon className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} strokeWidth={1.75} />
    </span>
  );
}
