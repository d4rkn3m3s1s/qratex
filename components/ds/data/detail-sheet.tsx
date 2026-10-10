'use client';

import { Suspense, useCallback, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUrlState, type SetUrlStateOptions } from '../page/url-state';
import { useDataCopy } from './copy';

/* ───────────────────────── URL kancası ───────────────────────── */

export type DetailSheetApi = {
  /** Açık kaydın kimliği (`?id=`), yoksa `null`. */
  id: string | null;
  isOpen: boolean;
  open: (id: string) => void;
  close: () => void;
};

/**
 * `?id=` derin linkini yöneten kanca — tablo satırı `open(row.id)` çağırır,
 * DetailSheet aynı anahtarı okur. `useSearchParams` kullanır → `<Suspense>`.
 */
export function useDetailSheet(paramKey = 'id', opts: { history?: SetUrlStateOptions['history'] } = {}): DetailSheetApi {
  const { get, set } = useUrlState();
  const id = get(paramKey);
  const history = opts.history ?? 'replace';
  const open = useCallback((next: string) => set({ [paramKey]: next }, { history }), [set, paramKey, history]);
  const close = useCallback(() => set({ [paramKey]: null }), [set, paramKey]);
  return { id: id || null, isOpen: !!id, open, close };
}

/* ───────────────────────── Bileşen ───────────────────────── */

type Renderable = ReactNode | ((id: string) => ReactNode);

export type DetailSheetProps = {
  /** URL anahtarı (varsayılan `id`). Kontrollü kullanımda yok sayılır. */
  paramKey?: string;
  /** Kontrollü kullanım: URL yerine dışarıdan. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Kontrollü kullanımda kayıt kimliği. */
  id?: string | null;
  title: Renderable;
  description?: Renderable;
  /** İçerik — kimliği alır; kendi `useQuery` + `QueryState`'ini içerir. */
  children: Renderable;
  footer?: Renderable;
  headerActions?: Renderable;
  /** Masaüstü genişliği (mobilde alttan tam genişlik sheet). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Önceki/sonraki kayıt gezinmesi (ör. tablodaki görünür satır kimlikleri). */
  siblings?: readonly string[];
  /** Kapanınca (URL temizlendikten sonra) çağrılır. */
  onClose?: () => void;
  /** URL yazımı: `replace` (varsayılan) ya da `push`. */
  history?: SetUrlStateOptions['history'];
  className?: string;
};

const WIDTH = {
  sm: 'md:w-[min(100vw,24rem)]',
  md: 'md:w-[min(100vw,32rem)]',
  lg: 'md:w-[min(100vw,40rem)]',
  xl: 'md:w-[min(100vw,48rem)]',
} as const;

function render(node: Renderable | undefined, id: string): ReactNode {
  return typeof node === 'function' ? node(id) : node;
}

const iconBtn =
  'grid h-11 w-11 shrink-0 place-items-center rounded-control text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';

type ViewProps = Omit<DetailSheetProps, 'paramKey' | 'open' | 'onOpenChange' | 'id' | 'history'> & {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (id: string) => void;
};

function DetailSheetView({
  id,
  open,
  onOpenChange,
  onNavigate,
  title,
  description,
  children,
  footer,
  headerActions,
  size = 'md',
  siblings,
  className,
}: ViewProps) {
  const copy = useDataCopy();
  // Kapanış animasyonu sürerken içerik boşalmasın: son kimliği tut.
  const [shownId, setShownId] = useState<string | null>(id);
  if (id !== null && id !== shownId) setShownId(id);
  const current = id ?? shownId;

  const index = current !== null && siblings ? siblings.indexOf(current) : -1;
  const prevId = index > 0 ? siblings![index - 1] : null;
  const nextId = index >= 0 && siblings && index < siblings.length - 1 ? siblings[index + 1] : null;
  const desc = current !== null ? render(description, current) : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-overlay bg-overlay/60',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:duration-base data-[state=closed]:duration-fast',
          )}
        />
        <DialogPrimitive.Content
          {...(desc ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-modal flex flex-col bg-surface-1 text-fg qx-elevation-3 outline-none',
            // Mobil: alttan sheet
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet border-t',
            // Masaüstü: sağ yan çekmece
            'md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:rounded-none md:rounded-l-sheet md:border-l md:border-t-0',
            WIDTH[size],
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-base data-[state=closed]:duration-fast',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            'md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:slide-out-to-bottom-0',
            'md:data-[state=open]:slide-in-from-right md:data-[state=closed]:slide-out-to-right',
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
          <header className="flex shrink-0 items-start gap-2 border-b border-subtle px-card py-3 sm:py-4">
            <div className="min-w-0 flex-1 pt-1.5">
              <DialogPrimitive.Title className="qx-h2 min-w-0 break-words text-fg">{current !== null ? render(title, current) : null}</DialogPrimitive.Title>
              {desc && <DialogPrimitive.Description className="qx-small mt-0.5 text-fg-muted">{desc}</DialogPrimitive.Description>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {current !== null && render(headerActions, current)}
              {siblings && onNavigate && (
                <>
                  <button type="button" className={iconBtn} disabled={!prevId} onClick={() => prevId && onNavigate(prevId)} aria-label={copy.prevItem}>
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className={iconBtn} disabled={!nextId} onClick={() => nextId && onNavigate(nextId)} aria-label={copy.nextItem}>
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
              <DialogPrimitive.Close className={iconBtn} aria-label={copy.close}>
                <X className="h-4 w-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-card py-4">{current !== null ? render(children, current) : null}</div>
          {current !== null && footer && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle bg-surface-1 px-card py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {render(footer, current)}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DetailSheetUrl({ paramKey = 'id', history, onClose, ...rest }: DetailSheetProps) {
  const { get, set } = useUrlState();
  const id = get(paramKey) || null;
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) return;
      set({ [paramKey]: null });
      onClose?.();
    },
    [set, paramKey, onClose],
  );
  const onNavigate = useCallback((next: string) => set({ [paramKey]: next }, { history }), [set, paramKey, history]);
  return <DetailSheetView {...rest} id={id} open={id !== null} onOpenChange={onOpenChange} onNavigate={onNavigate} />;
}

/**
 * Detay çekmecesi — `?id=` derin linkli (paylaşılabilir, yenilemede açık
 * kalır). Radix Dialog: odak tuzağı, Esc ile kapanma, odak tetikleyiciye
 * döner, `aria-modal`. Masaüstünde sağdan yan panel, mobilde alttan sheet
 * (güvenli alan payı). Animasyon CSS'te (tailwindcss-animate, `duration-base`);
 * azaltılmış harekette global politika keser.
 *
 *   const sheet = useDetailSheet();
 *   <DataTable onRowClick={(r) => sheet.open(r.id)} activeRowId={sheet.id} … />
 *   <DetailSheet title={(id) => `Sipariş #${id}`}>{(id) => <OrderDetail id={id} />}</DetailSheet>
 */
export function DetailSheet(props: DetailSheetProps) {
  if (props.open !== undefined) {
    const { open, onOpenChange, id, paramKey: _p, history: _h, onClose, ...rest } = props;
    return (
      <DetailSheetView
        {...rest}
        id={open ? id ?? '' : null}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          if (!next) onClose?.();
        }}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <DetailSheetUrl {...props} />
    </Suspense>
  );
}
