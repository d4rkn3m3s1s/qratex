'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FilterX, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePageCopy } from './copy';
import { DateRangePicker } from './date-range-picker';
import type { DateRangeValue } from './date-range';
import {
  clearFiltersPatch,
  countActiveFilters,
  parseFilters,
  serializeFilterValue,
  type DateRangeFilterField,
  type FilterField,
  type FilterValue,
  type FilterValues,
  type SearchFilterField,
  type SelectFilterField,
} from './filter-logic';
import { useUrlState } from './url-state';

export type UseFilterStateOptions = {
  /** Filtre değişince URL'den silinecek anahtarlar. Varsayılan `['page']`. */
  resetKeys?: readonly string[];
};

export type FilterStateApi = {
  values: FilterValues;
  setValue: (key: string, value: FilterValue) => void;
  clear: () => void;
  activeCount: number;
  isPending: boolean;
};

/**
 * Filtre değerlerini URL'den okur/yazar. Veri çekme kancası aynı kancayı
 * kullanarak sorgu anahtarını kurar:
 *
 *   const { values } = useFilterState(FIELDS);
 *   useQuery({ queryKey: ['orders', values], queryFn: ... })
 *
 * `useSearchParams` kullanır → sayfa `<Suspense>` içinde olmalı.
 */
export function useFilterState(fieldsProp: readonly FilterField[], opts: UseFilterStateOptions = {}): FilterStateApi {
  // Satır içi tanımlanan alan dizisi her render'da yeni kimlik alır; içerik
  // aynıysa aynı referansı kullan (değerler ve geri çağrılar kararlı kalsın).
  const fieldsKey = JSON.stringify(fieldsProp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fields = useMemo(() => fieldsProp, [fieldsKey]);
  const url = useUrlState();
  const { set, searchParams, isPending } = url;
  const resetKeys = opts.resetKeys ?? DEFAULT_RESET;
  const values = useMemo(() => parseFilters(fields, searchParams), [fields, searchParams]);
  const activeCount = useMemo(() => countActiveFilters(fields, values), [fields, values]);

  const setValue = useCallback(
    (key: string, value: FilterValue) => {
      const field = fields.find((f) => f.key === key);
      if (!field) return;
      set(serializeFilterValue(field, value), { resetKeys });
    },
    [fields, set, resetKeys],
  );

  const clear = useCallback(() => set(clearFiltersPatch(fields), { resetKeys }), [fields, set, resetKeys]);

  return { values, setValue, clear, activeCount, isPending };
}

const DEFAULT_RESET: readonly string[] = ['page'];

export type FilterBarProps = {
  fields: readonly FilterField[];
  /** Filtre değişince silinecek URL anahtarları. Varsayılan `['page']`. */
  resetKeys?: readonly string[];
  /** Ek içerik (sağda; ör. görünüm seçici). */
  children?: ReactNode;
  /** Değer değişince (URL'ye yazıldıktan sonra) bildirim. */
  onChange?: (values: FilterValues) => void;
  /** ≥ 44px kontroller (mobilde her zaman 44px). */
  touchTarget?: boolean;
  ariaLabel?: string;
  className?: string;
};

const controlH = (touch: boolean) => cn('h-11 min-h-11', touch ? '' : 'sm:h-10 sm:min-h-10');

function SearchField({
  field,
  value,
  onCommit,
  touch,
}: {
  field: SearchFilterField;
  value: string;
  onCommit: (v: string) => void;
  touch: boolean;
}) {
  const copy = usePageCopy();
  const id = useId();
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL dışarıdan değişirse (temizle, geri tuşu) girişi eşitle.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    committed.current = v.trim();
    onCommit(v);
  };

  const schedule = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), field.debounceMs ?? 300);
  };

  return (
    <div className="relative min-w-0 flex-1 sm:basis-56 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {field.label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        enterKeyHint="search"
        value={text}
        placeholder={field.placeholder ?? field.label}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          } else if (e.key === 'Escape' && text) {
            e.preventDefault();
            setText('');
            commit('');
          }
        }}
        className={cn(
          'w-full min-w-0 rounded-control border border-strong bg-surface-1 pl-9 pr-10 qx-body text-fg placeholder:text-fg-subtle',
          'transition-[border-color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          '[&::-webkit-search-cancel-button]:hidden',
          controlH(touch),
        )}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            commit('');
          }}
          aria-label={copy.clearSearch}
          className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-control text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

const ALL = '__all__';

function SingleSelectField({
  field,
  value,
  onChange,
  touch,
}: {
  field: SelectFilterField;
  value: string;
  onChange: (v: string) => void;
  touch: boolean;
}) {
  const copy = usePageCopy();
  const allLabel = field.allLabel === undefined ? copy.all : field.allLabel;
  const current = value || (allLabel !== null ? ALL : field.options[0]?.value ?? '');
  const selected = field.options.find((o) => o.value === value);
  return (
    <Select value={current} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger
        aria-label={`${field.label}: ${selected?.label ?? allLabel ?? ''}`}
        className={cn(
          'w-full min-w-0 gap-2 rounded-control border-strong bg-surface-1 sm:w-auto sm:min-w-[10rem] dark:border-strong dark:bg-surface-1',
          controlH(touch),
          value && 'border-brand-border bg-brand-subtle dark:border-brand-border dark:bg-brand-subtle',
        )}
      >
        <span className="qx-small shrink-0 text-fg-muted">{field.label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== null && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {field.options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectField({
  field,
  value,
  onChange,
  touch,
}: {
  field: SelectFilterField;
  value: string[];
  onChange: (v: string[]) => void;
  touch: boolean;
}) {
  const copy = usePageCopy();
  const count = value.length;
  const summary =
    count === 0 ? copy.all : count === 1 ? field.options.find((o) => o.value === value[0])?.label ?? value[0] : copy.selectedCount(count);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`${field.label}: ${summary}`}
          className={cn(
            'w-full justify-between gap-2 px-3 sm:w-auto',
            controlH(touch),
            count > 0 && 'border-brand-border bg-brand-subtle',
          )}
        >
          <span className="qx-small text-fg-muted">{field.label}:</span>
          <span className="qx-small min-w-0 truncate font-medium">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[12rem] overflow-y-auto">
        {field.options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={checked}
              disabled={o.disabled}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(next) => onChange(next ? [...value, o.value] : value.filter((v) => v !== o.value))}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterBarInner({ fields, resetKeys, children, onChange, touchTarget = false, ariaLabel, className }: FilterBarProps) {
  const copy = usePageCopy();
  const panelId = useId();
  const { values, setValue, clear, activeCount, isPending } = useFilterState(fields, { resetKeys });
  const [mobileOpen, setMobileOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const lastSerialized = useRef<string | null>(null);
  useEffect(() => {
    const serialized = JSON.stringify(values);
    if (lastSerialized.current === null) {
      lastSerialized.current = serialized;
      return;
    }
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    onChangeRef.current?.(values);
  }, [values]);

  const search = fields.filter((f): f is SearchFilterField => f.type === 'search');
  const others = fields.filter((f) => f.type !== 'search');
  const othersActive = countActiveFilters(others, values);

  const renderField = (f: FilterField) => {
    if (f.type === 'select') {
      return f.multiple ? (
        <MultiSelectField key={f.key} field={f} value={(values[f.key] as string[]) ?? []} onChange={(v) => setValue(f.key, v)} touch={touchTarget} />
      ) : (
        <SingleSelectField key={f.key} field={f} value={(values[f.key] as string) ?? ''} onChange={(v) => setValue(f.key, v)} touch={touchTarget} />
      );
    }
    if (f.type === 'dateRange') {
      const d = f as DateRangeFilterField;
      return (
        <DateRangePicker
          key={d.key}
          label={d.label}
          value={values[d.key] as DateRangeValue}
          onChange={(v) => setValue(d.key, v)}
          presets={d.presets}
          allowCompare={d.allowCompare}
          allowCustom={d.allowCustom}
          maxDays={d.maxDays}
          touchTarget={touchTarget}
          className="w-full sm:w-auto"
        />
      );
    }
    return null;
  };

  return (
    <div
      role="search"
      aria-label={ariaLabel ?? copy.filtersRegion}
      aria-busy={isPending || undefined}
      className={cn('flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}
    >
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        {search.map((f) => (
          <SearchField
            key={f.key}
            field={f}
            value={(values[f.key] as string) ?? ''}
            onCommit={(v) => setValue(f.key, v)}
            touch={touchTarget}
          />
        ))}
        {others.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 gap-2 px-3 sm:hidden"
            aria-expanded={mobileOpen}
            aria-controls={panelId}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {copy.filters}
            {othersActive > 0 && (
              <span className="qx-caption qx-num rounded-chip bg-brand px-1.5 font-semibold text-brand-fg">
                {othersActive}
                <span className="sr-only">, {copy.activeFilters(othersActive)}</span>
              </span>
            )}
          </Button>
        )}
      </div>
      {others.length > 0 && (
        <div id={panelId} className={cn('min-w-0 flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center', mobileOpen ? 'flex' : 'hidden')}>
          {others.map(renderField)}
        </div>
      )}
      {activeCount > 0 && (
        <Button type="button" variant="ghost" onClick={clear} className={cn('gap-1.5 self-start px-3 text-fg-muted hover:text-fg sm:self-auto', controlH(touchTarget))}>
          <FilterX className="h-4 w-4" aria-hidden />
          {copy.clearFilters}
          <span className="sr-only">({copy.activeFilters(activeCount)})</span>
        </Button>
      )}
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}

function FilterBarFallback({ fields, className }: Pick<FilterBarProps, 'fields' | 'className'>) {
  return (
    <div aria-hidden className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {fields.map((f) => (
        <div key={f.key} className={cn('h-11 rounded-control border border-subtle bg-surface-muted sm:h-10', f.type === 'search' ? 'w-full sm:w-64' : 'hidden w-40 sm:block')} />
      ))}
    </div>
  );
}

/**
 * URL senkronlu filtre çubuğu — arama (debounce, Enter hemen, Esc temizler),
 * tekli/çoklu seçim ve dönem (`{range, compare}`, Europe/Istanbul).
 * Değerler URL'de: paylaşılabilir link, geri tuşu, yenileme sonrası aynı
 * görünüm. Değişiklik sayfalamayı (`page`) sıfırlar. Mobilde arama görünür,
 * diğer filtreler "Filtreler" düğmesinin arkasında.
 *
 * Kendi içinde `<Suspense>` sınırı vardır (Next 16 `useSearchParams` kuralı).
 */
export function FilterBar(props: FilterBarProps) {
  return (
    <Suspense fallback={<FilterBarFallback fields={props.fields} className={props.className} />}>
      <FilterBarInner {...props} />
    </Suspense>
  );
}

