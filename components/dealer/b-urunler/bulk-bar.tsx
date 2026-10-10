'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, FolderInput, Loader2, Percent, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { parseLocaleNumber } from '@/components/ds/form';
import type { CatalogCategoryDto } from '@/lib/dealer/catalog/types';
import { catalogApi, useInvalidateCatalog } from './api';

/**
 * Toplu işlem çubuğu (envanter #34): seçili ürünleri arşivle / geri yükle, kategoriye taşı,
 * yüzde fiyat güncelle (kuruşta hesap; isteğe bağlı ,00/,50 ya da tam lira yuvarlama).
 * Mobil alt sekme çubuğunun üstünde durur.
 */
export function BulkBar({
  ids,
  archivedView,
  categories,
  onClear,
}: {
  ids: string[];
  archivedView: boolean;
  categories: CatalogCategoryDto[];
  onClear: () => void;
}) {
  const invalidate = useInvalidateCatalog();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState('');
  const [roundTo, setRoundTo] = useState<'1' | '50' | '100'>('1');
  const [priceOpen, setPriceOpen] = useState(false);

  const run = async (body: Parameters<typeof catalogApi.bulk>[0], verb: string) => {
    setBusy(true);
    try {
      const r = await catalogApi.bulk(body);
      const extra = r.skipped > 0 ? ` ${r.skipped} ürün atlandı${r.skippedReasons.length ? `: ${r.skippedReasons.join(' ')}` : '.'}` : '';
      toast.success(`${r.updated} ürün ${verb}.${extra}`);
      onClear();
      invalidate();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu işlem tamamlanamadı.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const parsed = parseLocaleNumber(percent, 'tr');
  const pct = parsed.kind === 'ok' ? parsed.value : null;
  const pctValid = pct !== null && pct !== 0 && pct >= -90 && pct <= 500;

  return (
    <div
      role="region"
      aria-label="Toplu işlemler"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(100%-2rem,48rem)] flex-wrap items-center gap-2 rounded-card border border-strong bg-surface-1 p-2 shadow-lg md:bottom-6"
    >
      <span className="qx-small px-2 font-medium text-fg" aria-live="polite">
        {ids.length} ürün seçildi
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted motion-reduce:animate-none" aria-label="İşleniyor" /> : null}
        {archivedView ? (
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run({ ids, action: 'restore' }, 'geri yüklendi')}>
            <ArchiveRestore className="mr-1.5 h-4 w-4" aria-hidden /> Geri yükle
          </Button>
        ) : (
          <>
            <Select disabled={busy} onValueChange={(v) => void run({ ids, action: 'move', categoryId: v }, 'taşındı')}>
              <SelectTrigger className="min-h-11 w-auto gap-1.5" aria-label="Seçili ürünleri kategoriye taşı">
                <FolderInput className="h-4 w-4" aria-hidden />
                <SelectValue placeholder="Taşı" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Popover open={priceOpen} onOpenChange={setPriceOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-h-11" disabled={busy}>
                  <Percent className="mr-1.5 h-4 w-4" aria-hidden /> Fiyat
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!pctValid || pct === null) return;
                    const ok = await run({ ids, action: 'adjustPrice', percent: Math.round(pct * 10) / 10, roundTo: Number(roundTo) as 1 | 50 | 100 }, 'güncellendi');
                    if (ok) {
                      setPriceOpen(false);
                      setPercent('');
                    }
                  }}
                >
                  <label htmlFor="bulk-pct" className="qx-small block font-medium text-fg">
                    Yüzde değişim
                  </label>
                  <Input id="bulk-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="ör. 10 ya da -5" className="min-h-11" aria-describedby="bulk-pct-help" />
                  <p id="bulk-pct-help" className="qx-caption text-fg-muted">
                    −90 ile +500 arası. Fiyatı olmayan ürünler değişmez.
                  </p>
                  <label htmlFor="bulk-round" className="qx-small block font-medium text-fg">
                    Yuvarlama
                  </label>
                  <Select value={roundTo} onValueChange={(v) => setRoundTo(v as '1' | '50' | '100')}>
                    <SelectTrigger id="bulk-round" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Yok (kuruşu kuruşuna)</SelectItem>
                      <SelectItem value="50">,00 / ,50</SelectItem>
                      <SelectItem value="100">Tam lira</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" className="min-h-11 w-full" disabled={!pctValid || busy}>
                    Uygula
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run({ ids, action: 'archive' }, 'arşivlendi')}>
              <Archive className="mr-1.5 h-4 w-4" aria-hidden /> Arşivle
            </Button>
          </>
        )}
        <IconButton aria-label="Seçimi temizle" icon={<X />} onClick={onClear} />
      </div>
    </div>
  );
}
