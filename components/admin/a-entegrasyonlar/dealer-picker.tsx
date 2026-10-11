'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DealerOption } from '@/lib/integrations/contract';
import { cn } from '@/lib/utils';
import { errorText, intKeys, searchDealers } from './api';
import { AdminEntegrasyonlarText } from './copy';

/**
 * Aranabilir bayi seçici (tekli ya da çoklu). Sonuç listesi `listbox`; seçilenler
 * kaldırılabilir çip. Sunucu en fazla 20 sonuç döndürür.
 */
export function DealerPicker({
  label,
  description,
  value,
  onChange,
  multiple = false,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: DealerOption[];
  onChange: (next: DealerOption[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const res = useQuery({
    queryKey: intKeys.dealers(debounced),
    queryFn: ({ signal }) => searchDealers(debounced, signal),
    enabled: open && !disabled,
    staleTime: 60_000,
  });

  const selectedIds = new Set(value.map((v) => v.id));
  const pick = (d: DealerOption) => {
    if (selectedIds.has(d.id)) return;
    onChange(multiple ? [...value, d] : [d]);
    setQ('');
    if (!multiple) setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-q`}>{label}</Label>
      {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Seçilen bayiler">
          {value.map((d) => (
            <li key={d.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted py-0.5 pl-2.5 pr-1 text-xs">
              {d.label}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v.id !== d.id))}
                className="grid h-7 w-7 place-items-center rounded-full text-fg-muted hover:bg-surface-1 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${d.label} seçimini kaldır`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          id={`${id}-q`}
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="İşletme adı, ad ya da e-posta ile ara"
          className="min-h-11 pl-9"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </div>
      {open && !disabled ? (
        <div className="rounded-control border border-border bg-surface-1">
          {res.isLoading ? (
            <p className="flex items-center gap-2 p-3 text-sm text-fg-muted" role="status">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Aranıyor…
            </p>
          ) : res.isError ? (
            <p className="p-3 text-sm text-danger" role="alert">
              {errorText(res.error)}
            </p>
          ) : (res.data?.items.length ?? 0) === 0 ? (
            <p className="p-3 text-sm text-fg-muted"><AdminEntegrasyonlarText k="noDealerMatch" /></p>
          ) : (
            <ul id={`${id}-list`} role="listbox" aria-label="Bayi sonuçları" className="max-h-56 overflow-auto py-1">
              {res.data?.items.map((d) => {
                const sel = selectedIds.has(d.id);
                return (
                  <li key={d.id} role="option" aria-selected={sel}>
                    <button
                      type="button"
                      onClick={() => pick(d)}
                      disabled={sel}
                      className={cn(
                        'flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none',
                        sel && 'text-fg-muted'
                      )}
                    >
                      {d.label}
                      {sel ? <span className="ml-auto text-xs"><AdminEntegrasyonlarText k="selected" /></span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
