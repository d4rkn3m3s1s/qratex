'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/states';
import type { SectionState } from '@/lib/dealer/offers/types';
import { useOffersCopy } from './context';

/**
 * Bölüm durumunu çizer: `disabled` → kilit açıklaması (veri yok gibi görünmez), `error` →
 * yalnız bu bölüm için hata + yeniden dene, `ready` → içerik. Yükleme iskeleti üst düzeyde
 * (`QueryState`) çözülür; bölüm verisi her zaman SSR/BFF yanıtından gelir.
 */
export function SectionBody<T>({
  state,
  disabledText,
  onRetry,
  children,
}: {
  state: SectionState<T>;
  disabledText: string;
  onRetry: () => unknown;
  children: (data: T) => ReactNode;
}) {
  const copy = useOffersCopy();
  if (state.status === 'disabled') {
    return <EmptyState variant="permission" icon={Lock} title={disabledText} compact headingLevel="p" />;
  }
  if (state.status === 'error') {
    return <ErrorState title={copy.sectionError} description={state.message} onRetry={onRetry} headingLevel="p" />;
  }
  return <>{children(state.data)}</>;
}
