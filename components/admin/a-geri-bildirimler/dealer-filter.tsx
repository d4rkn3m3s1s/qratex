'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Store, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUrlState } from '@/components/ds/page';
import { cn } from '@/lib/utils';
import { errorText, feedbackKeys, fetchDealerOptions } from './api';

/**
 * Aranabilir bayi seçici (sunucu araması, en fazla 20 sonuç). Değer URL'de `?dealer=`;
 * değişince sayfa ve seçim sıfırlanır. Eski ekran 5000 bayiyi aranamaz bir Select'e
 * gömüyordu.
 */
export function DealerFilter() {
  const { get, set } = useUrlState();
  const dealer = get('dealer') ?? '';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const listId = useId();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const selected = useQuery({
    queryKey: feedbackKeys.dealer(dealer),
    queryFn: ({ signal }) => fetchDealerOptions({ id: dealer }, signal),
    enabled: !!dealer,
    staleTime: 5 * 60_000,
  });
  const options = useQuery({
    queryKey: feedbackKeys.dealers(debounced),
    queryFn: ({ signal }) => fetchDealerOptions({ q: debounced }, signal),
    enabled: open,
    staleTime: 60_000,
  });

  const selectedName = dealer ? selected.data?.[0]?.name ?? (selected.isLoading ? 'Yükleniyor…' : 'Bilinmeyen bayi') : null;
  const choose = (id: string | null) => {
    set({ dealer: id }, { resetKeys: ['page', 'id'] });
    setOpen(false);
    setText('');
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={selectedName ? `Bayi filtresi: ${selectedName}` : 'Bayi filtresi: tüm bayiler'}
            className={cn('min-h-11 max-w-[16rem] justify-between gap-2 sm:min-h-9', dealer && 'border-brand-border bg-brand-subtle')}
          >
            <Store className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{selectedName ?? 'Tüm bayiler'}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,20rem)] p-2" align="start">
          <label htmlFor={`${listId}-q`} className="sr-only">
            Bayi ara
          </label>
          <Input
            id={`${listId}-q`}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="İşletme adıyla ara"
            className="mb-2"
          />
          <ul id={listId} role="listbox" aria-label="Bayiler" className="max-h-72 overflow-y-auto">
            <li role="option" aria-selected={!dealer}>
              <button type="button" onClick={() => choose(null)} className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                <Check className={cn('h-4 w-4', dealer ? 'opacity-0' : 'opacity-100')} aria-hidden />
                Tüm bayiler
              </button>
            </li>
            {options.isLoading ? (
              <li className="px-2 py-3 text-sm text-fg-muted" role="status">
                Aranıyor…
              </li>
            ) : options.isError ? (
              <li className="px-2 py-3 text-sm text-danger-text" role="alert">
                {errorText(options.error, 'Bayiler yüklenemedi.')}
              </li>
            ) : options.data && options.data.length === 0 ? (
              <li className="px-2 py-3 text-sm text-fg-muted">Eşleşen bayi yok.</li>
            ) : (
              options.data?.map((d) => (
                <li key={d.id} role="option" aria-selected={d.id === dealer}>
                  <button
                    type="button"
                    onClick={() => choose(d.id)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <Check className={cn('h-4 w-4 shrink-0', d.id === dealer ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    <span className="truncate">{d.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
      {dealer ? (
        <Button variant="ghost" size="icon-sm" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="Bayi filtresini kaldır" onClick={() => choose(null)}>
          <X className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
