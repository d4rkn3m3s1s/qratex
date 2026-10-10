'use client';

import { memo } from 'react';
import { m } from 'framer-motion';
import { Archive, ArchiveRestore, Copy, MoreVertical, Pencil, Star, TrendingDown, TrendingUp, Minus, Utensils } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { SelectionCheckbox, StatusBadge } from '@/components/ds/data';
import { DURATION, EASE } from '@/lib/motion';
import type { CatalogProductDto } from '@/lib/dealer/catalog/types';
import { priceLabel, ratingLabel, trend } from './format';

export type ProductCardActions = {
  onOpen: (p: CatalogProductDto) => void;
  onEdit: (p: CatalogProductDto) => void;
  onArchive: (p: CatalogProductDto) => void;
  onRestore: (p: CatalogProductDto) => void;
  onCopy: (p: CatalogProductDto) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
};

/**
 * Ürün kartı. Kartın tamamı detay çekmecesini açar (dokunmatikte hover yok; Bulgu 2); aksiyon
 * menüsü her zaman görünür ve etiketli. Görsel yoksa kategori simgesi. Sistem ürünü rozetli,
 * düzenlenemez — "Kopyamı oluştur" sunulur (Bulgu 9). Blur yok (çok kartlı ızgarada maliyetli).
 */
export const ProductCard = memo(function ProductCard({
  product: p,
  selected,
  selectable,
  reduced,
  actions,
}: {
  product: CatalogProductDto;
  selected: boolean;
  selectable: boolean;
  reduced: boolean;
  actions: ProductCardActions;
}) {
  const t = trend(p.stats);
  const TrendIcon = t?.dir === 'up' ? TrendingUp : t?.dir === 'down' ? TrendingDown : Minus;
  const archived = !p.isActive;
  return (
    <m.li
      layout={reduced ? false : 'position'}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.98 }}
      transition={{ duration: DURATION.base, ease: EASE.standard }}
      className="list-none"
    >
      <article
        className={`group relative flex h-full flex-col overflow-hidden rounded-card border bg-surface-1 transition-colors duration-fast hover:border-strong ${
          selected ? 'border-brand ring-1 ring-brand' : 'border-subtle'
        }`}
        aria-labelledby={`product-${p.id}-name`}
      >
        <div className={`relative aspect-[16/9] w-full bg-surface-2 ${archived ? 'grayscale' : ''}`}>
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- R2 alanı; boyut sabit kutuda
            <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl" aria-hidden>
              {p.category.icon || <Utensils className="h-8 w-8 text-fg-muted" />}
            </div>
          )}
          {selectable && p.canEdit ? (
            <div className="absolute left-2 top-2 z-10 rounded-chip bg-surface-1 p-1 shadow-sm">
              <SelectionCheckbox
                checked={selected}
                onCheckedChange={(c) => actions.onToggleSelect(p.id, c)}
                aria-label={`${p.name} ürününü seç`}
              />
            </div>
          ) : null}
          <div className="absolute right-2 top-2 flex gap-1">
            {p.isGlobal ? <StatusBadge label="Sistem" tone="info" size="sm" icon={null} /> : null}
            {archived ? <StatusBadge label="Arşivde" tone="neutral" size="sm" icon={Archive} /> : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => actions.onOpen(p)}
              className="min-w-0 flex-1 rounded-chip text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus after:absolute after:inset-0 after:content-['']"
            >
              <h3 id={`product-${p.id}-name`} className="qx-body line-clamp-2 font-semibold text-fg">
                {p.name}
              </h3>
              <p className="qx-caption mt-0.5 truncate text-fg-muted">
                <span aria-hidden>{p.category.icon} </span>
                {p.category.name}
                {!p.category.isActive ? ' (arşivde)' : ''}
              </p>
            </button>
            <div className="relative z-10 -mr-2 -mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label={`${p.name} için işlemler`} icon={<MoreVertical />} size="md" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  {p.canEdit ? (
                    <>
                      <DropdownMenuItem className="min-h-11" onSelect={() => actions.onEdit(p)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden /> Düzenle
                      </DropdownMenuItem>
                      {archived ? (
                        <DropdownMenuItem className="min-h-11" onSelect={() => actions.onRestore(p)}>
                          <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden /> Geri yükle
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="min-h-11" onSelect={() => actions.onArchive(p)}>
                          <Archive className="mr-2 h-4 w-4" aria-hidden /> Arşivle
                        </DropdownMenuItem>
                      )}
                    </>
                  ) : p.isGlobal ? (
                    <DropdownMenuItem className="min-h-11" onSelect={() => actions.onCopy(p)}>
                      <Copy className="mr-2 h-4 w-4" aria-hidden /> Kopyamı oluştur
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem className="min-h-11" onSelect={() => actions.onOpen(p)}>
                    <Star className="mr-2 h-4 w-4" aria-hidden /> Performansı gör
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {p.description ? <p className="qx-small line-clamp-2 text-fg-muted">{p.description}</p> : null}

          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
            <span className={`qx-num text-base font-semibold ${p.priceMinor === null ? 'text-fg-muted' : 'text-fg'}`}>
              {priceLabel(p.priceMinor)}
            </span>
            <dl className="qx-caption flex items-center gap-3 text-fg-muted">
              <div className="flex items-center gap-1" title="Son 30 gün ortalama puan">
                <dt className="sr-only">Son 30 gün ortalama puan</dt>
                <Star className="h-3.5 w-3.5" aria-hidden />
                <dd className="qx-num">
                  {ratingLabel(p.stats.avgRating30)}
                  {p.stats.reviews30 > 0 ? <span className="text-fg-muted"> ({p.stats.reviews30})</span> : null}
                </dd>
              </div>
              <div className="flex items-center gap-1" title={t ? `Tüketim: ${t.text}` : 'Son 30 gün tüketim'}>
                <dt className="sr-only">Son 30 gün tüketim</dt>
                {t ? <TrendIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                <dd className="qx-num">{p.stats.consumptions30} tüketim</dd>
              </div>
            </dl>
          </div>
        </div>
      </article>
    </m.li>
  );
});
