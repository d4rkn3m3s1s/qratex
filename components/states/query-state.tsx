'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeIn } from '@/lib/motion/variants';
import { useStateCopy } from './copy';
import { EmptyState, type EmptyStateProps } from './empty-state';
import { ErrorState, type ErrorStateProps } from './error-state';
import { InlineError } from './inline-error';
import { SkeletonForPreset, type SkeletonPreset } from './skeletons';
import { resolveQueryView, type ErrorKind, type QueryLike } from './query-state-logic';

export type QueryStateProps<T> = {
  /** TanStack Query sonucu (`useQuery(...)`) ya da aynı alanlara sahip nesne. */
  query: QueryLike<T>;
  /** Hazır içerik. Fonksiyon verilirse veriyi (null değil) alır. */
  children: ReactNode | ((data: NonNullable<T>) => ReactNode);
  /** Özel boşluk testi (varsayılan: boş dizi / `items|rows|data|results` boş). */
  isEmpty?: (data: NonNullable<T>) => boolean;
  /** Yükleme iskeleti ön ayarı ya da özel düğüm. */
  skeleton?: SkeletonPreset | ReactNode;
  /** Boş durum özellikleri ya da tamamen özel düğüm. */
  empty?: EmptyStateProps | ReactNode;
  /** Hata durumu metin/aksiyon özelleştirmesi. */
  error?: Omit<ErrorStateProps, 'kind' | 'onRetry'>;
  /** Hata türünü dışarıdan zorla (ör. sunucu zarfı `MODULE_DISABLED`). */
  errorKind?: ErrorKind;
  /** Yeniden deneme; verilmezse `query.refetch`. */
  onRetry?: () => unknown;
  /** Veri varken arka planda yenilenirken küçük gösterge. */
  showRefreshing?: boolean;
  className?: string;
  /** Yükleme duyurusu için erişilebilir etiket. */
  loadingLabel?: string;
};

function isEmptyProps(v: unknown): v is EmptyStateProps {
  return !!v && typeof v === 'object' && !('$$typeof' in (v as object)) && !Array.isArray(v);
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Tek veri-durum bileşeni: loading (iskelet) / error (+ yeniden dene) /
 * empty / ready (+ bayat veri uyarısı, arka plan yenileme göstergesi).
 *
 *   const q = useQuery({ queryKey: ['campaigns'], queryFn: fetchCampaigns });
 *   <QueryState query={q} skeleton="table" empty={{ title: 'Henüz kampanya yok', action: <Button>Oluştur</Button> }}>
 *     {(rows) => <CampaignTable rows={rows} />}
 *   </QueryState>
 *
 * Kural: hata asla "boş liste" gibi görünmez; veri varken gelen hata veriyi
 * silmez, üstüne uyarı bandı koyar.
 */
export function QueryState<T>({
  query,
  children,
  isEmpty,
  skeleton = 'list',
  empty,
  error,
  errorKind,
  onRetry,
  showRefreshing = true,
  className,
  loadingLabel,
}: QueryStateProps<T>) {
  const copy = useStateCopy();
  const online = useOnline();
  const view = resolveQueryView(query, {
    isEmpty: isEmpty as ((d: T) => boolean) | undefined,
    online,
  });
  const retry = onRetry ?? query.refetch;

  let body: ReactNode;
  let key: string;

  switch (view.kind) {
    case 'loading':
      key = 'loading';
      body = (
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">{loadingLabel ?? copy.loading}</span>
          {typeof skeleton === 'string' ? <SkeletonForPreset preset={skeleton as SkeletonPreset} /> : skeleton}
        </div>
      );
      break;
    case 'error':
      key = 'error';
      body = <ErrorState kind={errorKind ?? view.errorKind} onRetry={retry} {...error} />;
      break;
    case 'empty':
      key = 'empty';
      body = isEmptyProps(empty) ? <EmptyState {...empty} /> : empty ?? <EmptyState />;
      break;
    case 'ready':
    default: {
      key = 'ready';
      const data = query.data as NonNullable<T>;
      const content = typeof children === 'function' ? (children as (d: NonNullable<T>) => ReactNode)(data) : children;
      body = (
        <div className="relative">
          {view.kind === 'ready' && view.stale && (
            <InlineError variant="banner" tone="warning" onRetry={retry} className="mb-4">
              {copy.staleNotice}
            </InlineError>
          )}
          {view.kind === 'ready' && view.refreshing && showRefreshing && (
            <div role="status" aria-live="polite" className="qx-caption absolute right-0 top-0 z-raised inline-flex items-center gap-1.5 rounded-chip bg-surface-elevated/90 px-2 py-1 text-fg-muted qx-elevation-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              {copy.refreshing}
            </div>
          )}
          {content}
        </div>
      );
    }
  }

  return (
    <div className={cn('min-w-0', className)}>
      <AnimatePresence mode="wait" initial={false}>
        <Motion.div key={key} variants={fadeIn} initial="hidden" animate="visible" exit="exit">
          {body}
        </Motion.div>
      </AnimatePresence>
    </div>
  );
}
