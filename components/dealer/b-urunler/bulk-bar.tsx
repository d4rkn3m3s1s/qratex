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
import { useProductsCopy } from './copy';

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
  const copy = useProductsCopy();
  const c = copy.bulk;
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState('');
  const [roundTo, setRoundTo] = useState<'1' | '50' | '100'>('1');
  const [priceOpen, setPriceOpen] = useState(false);

  const run = async (body: Parameters<typeof catalogApi.bulk>[0], verb: string) => {
    setBusy(true);
    try {
      const r = await catalogApi.bulk(body);
      const extra = r.skipped > 0 ? c.skipped(r.skipped, r.skippedReasons.join(' ')) : '';
      toast.success(c.done(r.updated, verb, extra));
      onClear();
      invalidate();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : c.failed);
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
      aria-label={c.aria}
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(100%-2rem,48rem)] flex-wrap items-center gap-2 rounded-card border border-strong bg-surface-1 p-2 shadow-lg md:bottom-6"
    >
      <span className="qx-small px-2 font-medium text-fg" aria-live="polite">
        {c.selected(ids.length)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted motion-reduce:animate-none" aria-label={c.processing} /> : null}
        {archivedView ? (
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run({ ids, action: 'restore' }, c.verbRestored)}>
            <ArchiveRestore className="mr-1.5 h-4 w-4" aria-hidden /> {copy.common.restore}
          </Button>
        ) : (
          <>
            <Select disabled={busy} onValueChange={(v) => void run({ ids, action: 'move', categoryId: v }, c.verbMoved)}>
              <SelectTrigger className="min-h-11 w-auto gap-1.5" aria-label={c.moveAria}>
                <FolderInput className="h-4 w-4" aria-hidden />
                <SelectValue placeholder={c.move} />
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
                  <Percent className="mr-1.5 h-4 w-4" aria-hidden /> {c.price}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!pctValid || pct === null) return;
                    const ok = await run({ ids, action: 'adjustPrice', percent: Math.round(pct * 10) / 10, roundTo: Number(roundTo) as 1 | 50 | 100 }, c.verbUpdated);
                    if (ok) {
                      setPriceOpen(false);
                      setPercent('');
                    }
                  }}
                >
                  <label htmlFor="bulk-pct" className="qx-small block font-medium text-fg">
                    {c.pct}
                  </label>
                  <Input id="bulk-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder={c.pctPlaceholder} className="min-h-11" aria-describedby="bulk-pct-help" />
                  <p id="bulk-pct-help" className="qx-caption text-fg-muted">
                    {c.pctHelp}
                  </p>
                  <label htmlFor="bulk-round" className="qx-small block font-medium text-fg">
                    {c.rounding}
                  </label>
                  <Select value={roundTo} onValueChange={(v) => setRoundTo(v as '1' | '50' | '100')}>
                    <SelectTrigger id="bulk-round" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{c.roundNone}</SelectItem>
                      <SelectItem value="50">,00 / ,50</SelectItem>
                      <SelectItem value="100">{c.roundLira}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" className="min-h-11 w-full" disabled={!pctValid || busy}>
                    {c.apply}
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void run({ ids, action: 'archive' }, c.verbArchived)}>
              <Archive className="mr-1.5 h-4 w-4" aria-hidden /> {copy.common.archive}
            </Button>
          </>
        )}
        <IconButton aria-label={c.clear} icon={<X />} onClick={onClear} />
      </div>
    </div>
  );
}
