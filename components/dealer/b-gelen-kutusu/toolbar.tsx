'use client';

/**
 * Gelen Kutusu araç çubuğu: durum sekmeleri (sayaçlı), sunucu araması, filtreler (mobilde
 * açılır panel), CSV ve temizle. Tüm durum URL'dedir (derin link + geri tuşu).
 */
import { useEffect, useId, useState } from 'react';
import { Download, Filter, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_INBOX_FILTERS } from '@/lib/dealer-inbox/core';
import type { InboxFilters, InboxMeta, InboxStatus, InboxStatusFilter } from '@/lib/dealer-inbox/types';
import { downloadExport, useDebounced } from './api';
import { useInboxCopy } from './copy';
import { NativeSelect } from './parts';

const STATUS_ORDER: InboxStatusFilter[] = ['new', 'replied', 'resolved', 'all'];

export function countActive(f: InboxFilters): number {
  const d = DEFAULT_INBOX_FILTERS;
  return (['source', 'rating', 'sentiment', 'signal', 'assigned', 'range', 'sort'] as const).filter((k) => f[k] !== d[k]).length + (f.qr ? 1 : 0) + (f.q ? 1 : 0);
}

export function InboxToolbar({
  filters,
  counts,
  meta,
  onChange,
  onClear,
}: {
  filters: InboxFilters;
  counts: Record<InboxStatus, number> | null;
  meta: InboxMeta | null;
  onChange: (patch: Partial<Record<keyof InboxFilters, string | null>>) => void;
  onClear: () => void;
}) {
  const copy = useInboxCopy();
  const searchId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(filters.q);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounced(text.trim(), 350);

  // Dış değişim (temizle, geri tuşu) → giriş eşitlenir.
  useEffect(() => {
    setText(filters.q);
  }, [filters.q]);
  useEffect(() => {
    if (debounced !== filters.q && (debounced.length === 0 || debounced.length >= 2)) onChange({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız gecikmeli değer değişince
  }, [debounced]);

  const active = countActive(filters);
  const total = counts ? counts.new + counts.replied + counts.resolved : null;

  async function onExport() {
    setExporting(true);
    try {
      const { rows, truncated } = await downloadExport(filters);
      if (rows === 0) toast.message(copy.exportEmpty);
      else toast.success(truncated ? copy.exportTruncated : copy.exportDone(rows));
    } catch {
      toast.error(copy.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label={copy.statusLabel}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const group = e.currentTarget;
          const i = STATUS_ORDER.indexOf(filters.status);
          const next =
            e.key === 'Home' ? 0 : e.key === 'End' ? STATUS_ORDER.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + STATUS_ORDER.length) % STATUS_ORDER.length;
          onChange({ status: STATUS_ORDER[next] });
          requestAnimationFrame(() => {
            (group.querySelector(`[data-status="${STATUS_ORDER[next]}"]`) as HTMLButtonElement | null)?.focus();
          });
        }}
        className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full gap-1 rounded-control bg-surface-muted p-1">
          {STATUS_ORDER.map((s) => {
            const checked = filters.status === s;
            const n = counts ? (s === 'all' ? total : counts[s]) : null;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-status={s}
                onClick={() => onChange({ status: s })}
                className={cn(
                  'qx-small inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius-md)-4px)] px-3 font-medium transition-colors duration-fast ease-standard sm:min-h-9',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  checked ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg'
                )}
              >
                {copy.status[s]}
                {n != null ? (
                  <span
                    className={cn(
                      'qx-caption qx-num rounded-full px-1.5',
                      s === 'new' && n > 0 ? 'bg-warning-subtle text-warning' : 'bg-surface-2 text-fg-muted'
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <label htmlFor={searchId} className="sr-only">
            {copy.searchLabel}
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            id={searchId}
            type="search"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onChange({ q: text.trim() || null });
            }}
            placeholder={copy.searchPlaceholder}
            className="qx-small h-11 w-full rounded-control border border-strong bg-surface-1 pl-9 pr-3 text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="min-h-11 gap-2 sm:h-10 sm:min-h-10 lg:hidden"
        >
          <Filter aria-hidden className="h-4 w-4" />
          {copy.filters}
          {active > 0 ? <span className="qx-caption qx-num rounded-full bg-brand-subtle px-1.5 text-brand">{active}</span> : null}
        </Button>
        <Button type="button" variant="outline" onClick={onExport} disabled={exporting} className="min-h-11 gap-2 sm:h-10 sm:min-h-10">
          {exporting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Download aria-hidden className="h-4 w-4" />}
          {exporting ? copy.exporting : copy.exportCsv}
        </Button>
        {active > 0 ? (
          <Button type="button" variant="ghost" onClick={onClear} className="min-h-11 gap-1.5 sm:h-10 sm:min-h-10">
            <X aria-hidden className="h-4 w-4" />
            {copy.clearFilters}
          </Button>
        ) : null}
      </div>

      <div id={panelId} className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid lg:grid-cols-8', open ? 'grid' : 'hidden lg:grid')}>
        <NativeSelect label={copy.source} value={filters.source} onChange={(e) => onChange({ source: e.target.value, qr: null })}>
          {(['all', 'qr', 'consumption'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.sources[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.rating} value={filters.rating} onChange={(e) => onChange({ rating: e.target.value })}>
          <option value="all">{copy.ratingAll}</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={String(n)}>
              {copy.stars(n)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.sentiment} value={filters.sentiment} onChange={(e) => onChange({ sentiment: e.target.value })}>
          {(['all', 'negative', 'neutral', 'positive', 'pending'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.sentiments[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.signal} value={filters.signal} onChange={(e) => onChange({ signal: e.target.value })}>
          {(['all', 'urgent', 'churn', 'trust'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.signals[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.assigned} value={filters.assigned} onChange={(e) => onChange({ assigned: e.target.value })}>
          {(['all', 'me', 'unassigned'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.assignedOpts[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.range} value={filters.range} onChange={(e) => onChange({ range: e.target.value })}>
          {(['all', '7', '30', '90'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.ranges[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          label={copy.qr}
          value={filters.qr ?? ''}
          disabled={!meta || meta.qrCodes.length === 0}
          onChange={(e) => onChange({ qr: e.target.value || null, source: e.target.value ? 'qr' : null })}
        >
          <option value="">{copy.qrAll}</option>
          {(meta?.qrCodes ?? []).map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label={copy.sort} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {(['newest', 'oldest'] as const).map((v) => (
            <option key={v} value={v}>
              {copy.sorts[v]}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
