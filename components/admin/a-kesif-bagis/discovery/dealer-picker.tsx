'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import type { DealerRef } from '@/lib/admin-discovery/contract';
import { cn } from '@/lib/utils';
import { discoveryKeys, errorText, searchDealers } from '../api';

/**
 * İşletme seçici — YALNIZ `DEALER` rolündeki hesaplar, sunucu tarafı arama (rapor Bulgu 2:
 * eski seçici rol filtresini kaybedip en yeni 20 kullanıcıyı "bayi" diye getiriyordu).
 * Klavye: ↑/↓ ile gezin, Enter ile seç, Esc ile kapat.
 */
export function DealerPicker({
  id,
  value,
  dealer,
  onChange,
  invalid,
  describedBy,
  excludeIds,
  clearable = false,
}: {
  id: string;
  value: string | null | undefined;
  dealer: DealerRef | null | undefined;
  onChange: (dealer: DealerRef | null) => void;
  invalid?: boolean;
  describedBy?: string;
  excludeIds?: ReadonlySet<string>;
  clearable?: boolean;
}) {
  const listId = useId();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(!value);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: discoveryKeys.dealers(debounced),
    queryFn: ({ signal }) => searchDealers(debounced, signal),
    enabled: open,
    staleTime: 60_000,
  });
  const items = (results.data ?? []).filter((d) => !excludeIds?.has(d.id) || d.id === value);

  if (value && !open) {
    return (
      <div className={cn('flex min-h-11 items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2', invalid && 'border-danger')}>
        <Building2 className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{dealer?.name ?? 'Bulunamayan işletme'}</p>
          <p className="truncate text-xs text-fg-muted">{dealer?.email ?? (dealer ? '' : 'Bu kimlikte bir bayi yok; başka bir işletme seçin.')}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)} aria-describedby={describedBy}>
          Değiştir
        </Button>
      </div>
    );
  }

  const choose = (d: DealerRef) => {
    onChange(d);
    setOpen(false);
    setTerm('');
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
          className="min-h-11 pl-9 pr-10"
          placeholder="İşletme adı ya da e-posta ile arayın"
          value={term}
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && items[active]) {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === 'Escape' && value) {
              setOpen(false);
            }
          }}
        />
        {results.isFetching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-muted" aria-hidden /> : null}
      </div>
      {results.isError ? (
        <InlineError>{errorText(results.error, 'İşletmeler aranamadı.')}</InlineError>
      ) : (
        <ul id={listId} role="listbox" aria-label="İşletmeler" className="max-h-60 overflow-y-auto rounded-md border border-border bg-surface">
          {items.length === 0 && !results.isFetching ? (
            <li className="px-3 py-3 text-sm text-fg-muted">{debounced.length >= 2 ? 'Eşleşen bayi yok.' : 'Bayi bulunamadı.'}</li>
          ) : (
            items.map((d, i) => (
              <li
                key={d.id}
                id={`${listId}-${d.id}`}
                role="option"
                aria-selected={d.id === value}
                className={cn('flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 text-sm', i === active ? 'bg-brand-subtle' : 'hover:bg-surface-2')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(d)}
              >
                <span className="font-medium text-fg">{d.name}</span>
                {d.email ? <span className="text-xs text-fg-muted">{d.email}</span> : null}
              </li>
            ))
          )}
        </ul>
      )}
      {value ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          {clearable ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => onChange(null)}>
              <X className="h-4 w-4" aria-hidden />
              Seçimi kaldır
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
