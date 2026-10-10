'use client';

import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataCopy } from './copy';

export type KeyValueItem = {
  /** React anahtarı (verilmezse sıra). */
  id?: string;
  label: ReactNode;
  /** `null`/`undefined`/'' → "—". */
  value: ReactNode;
  /** Değerin altında küçük açıklama. */
  hint?: ReactNode;
  /** Verilirse yanında "Kopyala" düğmesi (ör. kimlik, IBAN, kod). */
  copyValue?: string;
  /** Eş aralıklı yazı (kimlik, kod). */
  mono?: boolean;
  /** `grid` düzeninde iki sütun kapla. */
  span?: 1 | 2;
  hidden?: boolean;
};

export type KeyValueListProps = {
  items: readonly KeyValueItem[];
  /**
   * `inline` (varsayılan): etiket solda, değer sağda (detay çekmecesi).
   * `stacked`: etiket üstte. `grid`: 2–3 sütunlu özet.
   */
  layout?: 'inline' | 'stacked' | 'grid';
  columns?: 2 | 3;
  /** Satırlar arası ayırıcı çizgi. Varsayılan `inline`'da true. */
  divided?: boolean;
  dense?: boolean;
  /** Kopyala düğmesi ≥ 44px. */
  touchTarget?: boolean;
  emptyValue?: ReactNode;
  className?: string;
};

function isEmptyValue(v: ReactNode): boolean {
  return v === null || v === undefined || v === '' || v === false;
}

function CopyButton({ value, touch }: { value: string; touch: boolean }) {
  const copy = useDataCopy();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    } catch {
      /* pano izni yoksa sessizce geç; değer seçilebilir metin olarak duruyor */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={done ? copy.copied : copy.copy}
      className={cn(
        'grid shrink-0 place-items-center rounded-control text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        touch ? 'h-11 w-11' : 'h-11 w-11 sm:h-8 sm:w-8',
        done && 'text-success',
      )}
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span aria-live="polite" className="sr-only">
        {done ? copy.copied : ''}
      </span>
    </button>
  );
}

const GRID_COLS = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' } as const;
const GRID_SPAN = { 2: 'sm:col-span-2', 3: 'sm:col-span-2' } as const;

/**
 * Anahtar–değer listesi — `<dl>` (etiket `dt`, değer `dd`), boş değer "—",
 * isteğe bağlı kopyala düğmesi. Detay çekmecesi, kayıt özeti, ayar özeti.
 */
export const KeyValueList = forwardRef<HTMLDListElement, KeyValueListProps>(function KeyValueList(
  { items, layout = 'inline', columns = 2, divided, dense = false, touchTarget = false, emptyValue = '—', className },
  ref,
) {
  const visible = items.filter((i) => !i.hidden);
  const showDivider = divided ?? layout === 'inline';
  const pad = dense ? 'py-2' : 'py-3';

  return (
    <dl
      ref={ref}
      className={cn(
        'min-w-0',
        layout === 'grid' ? cn('grid grid-cols-1 gap-x-6 gap-y-4', GRID_COLS[columns]) : 'flex flex-col',
        showDivider && layout !== 'grid' && 'divide-y divide-border',
        className,
      )}
    >
      {visible.map((item, i) => {
        const empty = isEmptyValue(item.value);
        const valueNode = (
          <div className="flex min-w-0 items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className={cn('qx-body min-w-0 break-words text-fg', item.mono && 'font-mono qx-small', empty && 'text-fg-subtle')}>
                {empty ? emptyValue : item.value}
              </div>
              {item.hint && <p className="qx-caption mt-0.5 text-fg-subtle">{item.hint}</p>}
            </div>
            {item.copyValue && !empty && (
              <div className={cn(touchTarget ? '-my-2.5' : '-my-2.5 sm:-my-1.5')}>
                <CopyButton value={item.copyValue} touch={touchTarget} />
              </div>
            )}
          </div>
        );
        return (
          <div
            key={item.id ?? i}
            className={cn(
              'min-w-0',
              layout === 'inline' && cn('grid grid-cols-1 gap-1 sm:grid-cols-[minmax(8rem,40%)_minmax(0,1fr)] sm:gap-4', pad),
              layout === 'stacked' && cn('space-y-1', pad),
              layout === 'grid' && cn('space-y-1', item.span === 2 && GRID_SPAN[columns]),
            )}
          >
            <dt className="qx-small text-fg-muted">{item.label}</dt>
            <dd className="min-w-0">{valueNode}</dd>
          </div>
        );
      })}
    </dl>
  );
});
