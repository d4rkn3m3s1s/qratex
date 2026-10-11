'use client';

/**
 * CommandPalette — ⌘K / Ctrl+K komut paleti (QDL kabuk grubu, B13).
 *
 *   <CommandPalette
 *     open={open}
 *     onOpenChange={setOpen}
 *     items={[{ id, label, section: 'Sayfalar', icon, keywords, onSelect }]}
 *     asyncSource={async (q, signal) => fetchResults(q, signal)}   // isteğe bağlı "Veriler"
 *     copy={{ title, placeholder, empty, loading, error, minChars, resultsCount }}
 *   />
 *
 * - Combobox deseni (WAI-ARIA 1.2): giriş `role="combobox"`, sonuçlar `role="listbox"`,
 *   etkin seçenek `aria-activedescendant`; ↑/↓/Home/End gezinir, Enter seçer, Esc kapatır.
 * - Eşleştirme Türkçe duyarlı ve aksan bağımsız (`lib/navigation/search.ts`).
 * - Asenkron kaynak 250 ms gecikmeli, iptal edilebilir; yükleniyor/hata durumu görünür
 *   (sessiz boş sonuç yok). Sonuç sayısı canlı bölgede duyurulur.
 * - Hareket: yalnız açılış solması (`base`), azaltılmış harekette animasyonsuz.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, Search, CornerDownLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreMatch } from '@/lib/navigation/search';

export interface CommandPaletteItem {
  id: string;
  label: string;
  /** Bölüm başlığı (ör. "Kısayollar", "Sayfalar", "Veriler"). Bölümler ilk görünme sırasıyla dizilir. */
  section: string;
  /** Sağda soluk bağlam metni (ör. üst sayfa / grup). */
  context?: string;
  icon?: LucideIcon;
  /** Tuş ipucu (ör. "⌘J"). */
  hint?: string;
  keywords?: readonly string[];
  /** Yalnız sorgu boşken gösterilir (ör. "Son kullanılanlar"); aramada tekrar etmez. */
  idleOnly?: boolean;
  onSelect: () => void;
}

export interface CommandPaletteCopy {
  title: string;
  placeholder: string;
  empty: string;
  loading: string;
  error: string;
  /** `{count}` yer tutuculu. */
  resultsCount: string;
  close: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
  /** Sorguya göre sunucudan sonuç (≥ minChars). Hata fırlatırsa hata durumu gösterilir. */
  asyncSource?: (query: string, signal: AbortSignal) => Promise<CommandPaletteItem[]>;
  asyncMinChars?: number;
  /** Sorgu boşken bölüm başına gösterilecek en çok öğe. */
  idleLimitPerSection?: number;
  copy: CommandPaletteCopy;
}

type AsyncState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: CommandPaletteItem[] };

export function CommandPalette({
  open,
  onOpenChange,
  items,
  asyncSource,
  asyncMinChars = 2,
  idleLimitPerSection = 8,
  copy,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [asyncState, setAsyncState] = React.useState<AsyncState>({ status: 'idle', items: [] });
  const listRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();
  const listboxId = `${baseId}-listbox`;

  // Kapanınca sıfırla.
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      setAsyncState({ status: 'idle', items: [] });
    }
  }, [open]);

  // Asenkron kaynak (gecikmeli + iptal).
  React.useEffect(() => {
    if (!open || !asyncSource) return;
    const q = query.trim();
    if (q.length < asyncMinChars) {
      setAsyncState({ status: 'idle', items: [] });
      return;
    }
    const ac = new AbortController();
    setAsyncState((s) => ({ status: 'loading', items: s.items }));
    const timer = setTimeout(() => {
      asyncSource(q, ac.signal)
        .then((res) => {
          if (!ac.signal.aborted) setAsyncState({ status: 'ready', items: res });
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
          setAsyncState({ status: 'error', items: [] });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [open, query, asyncSource, asyncMinChars]);

  const visible = React.useMemo(() => {
    const q = query.trim();
    let list: CommandPaletteItem[];
    if (!q) {
      const perSection = new Map<string, number>();
      list = items.filter((it) => {
        const n = perSection.get(it.section) ?? 0;
        perSection.set(it.section, n + 1);
        return n < idleLimitPerSection;
      });
    } else {
      list = items
        .filter((it) => !it.idleOnly)
        .map((it, i) => ({ it, i, s: scoreMatch(q, it.label, it.keywords ?? [], it.context ? [it.context] : []) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((x) => x.it)
        .slice(0, 30);
    }
    const all = [...list, ...(q ? asyncState.items : [])];
    // Bölümleri ilk görünme sırasıyla grupla; düz dizin klavye gezinmesi içindir.
    const order: string[] = [];
    const bySection = new Map<string, CommandPaletteItem[]>();
    for (const it of all) {
      if (!bySection.has(it.section)) {
        bySection.set(it.section, []);
        order.push(it.section);
      }
      bySection.get(it.section)!.push(it);
    }
    const flat: CommandPaletteItem[] = [];
    const sections = order.map((name) => {
      const sectionItems = bySection.get(name)!;
      flat.push(...sectionItems);
      return { name, items: sectionItems };
    });
    return { sections, flat };
  }, [items, query, asyncState.items, idleLimitPerSection]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (activeIndex >= visible.flat.length) setActiveIndex(Math.max(0, visible.flat.length - 1));
  }, [visible.flat.length, activeIndex]);

  const activeItem = visible.flat[activeIndex];
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  React.useEffect(() => {
    if (!open) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const select = (it: CommandPaletteItem | undefined) => {
    if (!it) return;
    onOpenChange(false);
    it.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = visible.flat.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (n) setActiveIndex((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActiveIndex((i) => (i - 1 + n) % n);
    } else if (e.key === 'Home' && n) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && n) {
      e.preventDefault();
      setActiveIndex(n - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(activeItem);
    }
  };

  const q = query.trim();
  const showAsyncLoading = !!asyncSource && q.length >= asyncMinChars && asyncState.status === 'loading';
  const showAsyncError = !!asyncSource && q.length >= asyncMinChars && asyncState.status === 'error';
  const isEmpty = visible.flat.length === 0 && !showAsyncLoading;
  const announcement = showAsyncLoading
    ? copy.loading
    : q
      ? isEmpty
        ? copy.empty
        : copy.resultsCount.replace('{count}', String(visible.flat.length))
      : '';

  let flatIndex = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 top-0 z-modal mx-auto flex max-h-[100dvh] w-full flex-col overflow-hidden border-border bg-popover text-popover-foreground shadow-2xl outline-none',
            'sm:top-[12vh] sm:max-h-[min(70vh,560px)] sm:w-[min(40rem,calc(100vw-2rem))] sm:rounded-sheet sm:border',
            'pt-[env(safe-area-inset-top,0px)] sm:pt-0',
            'duration-base data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{copy.title}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={copy.placeholder}
              role="combobox"
              aria-expanded={visible.flat.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeItem ? optionId(activeIndex) : undefined}
              aria-label={copy.title}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {showAsyncLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />}
            <DialogPrimitive.Close
              className="flex h-11 min-w-11 items-center justify-center rounded-control px-2 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copy.close}
            >
              <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] sm:inline">Esc</kbd>
              <span className="sm:hidden">{copy.close}</span>
            </DialogPrimitive.Close>
          </div>

          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>

          <div ref={listRef} id={listboxId} role="listbox" aria-label={copy.title} className="flex-1 overflow-y-auto overscroll-contain p-2">
            {visible.sections.map((section) => (
              <div key={section.name} role="group" aria-label={section.name} className="mb-2 last:mb-0">
                <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden>
                  {section.name}
                </div>
                {section.items.map((it) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === activeIndex;
                  const Icon = it.icon;
                  return (
                    <div
                      key={`${section.name}-${it.id}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => select(it)}
                      className={cn(
                        'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-control px-2 py-2 text-sm',
                        active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                      )}
                    >
                      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <span className="w-4" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.context && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">{it.context}</span>}
                      {it.hint && (
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{it.hint}</kbd>
                      )}
                      {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}

            {showAsyncError && (
              <p className="px-3 py-3 text-sm text-destructive" role="alert">
                {copy.error}
              </p>
            )}
            {isEmpty && !showAsyncError && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
