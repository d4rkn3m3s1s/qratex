'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureClientError } from '@/lib/observability/capture-client-error';
import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from './error-state';
import { useStateCopy } from './copy';

export type PanelRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Panelin ana sayfası (ör. `/dealer`). */
  homeHref: string;
  /** Günlük etiketi (ör. `dealer`). */
  scope: string;
  /** Yönetim paneli gibi dizinlenmemesi gereken yüzeylerde `noindex` meta ekler. */
  noindex?: boolean;
};

/**
 * Panel segmenti `error.tsx` gövdesi — dört panelde (admin, bayi, müşteri, personel) TEK görünüm.
 *
 * Eskiden her panel kendi düzenini çiziyordu (h-12/h-10 ikon, h1/h2, sabit TR / i18n karışık) ve
 * panel layout'unun `<main id="dashboard-main">`'i İÇİNDE ikinci bir `<main>` + ikinci "içeriğe
 * atla" bağlantısı açıyordu (iç içe main landmark). Artık `ErrorState` (role="alert",
 * `<section>`, tekrar dene, hata kodu) + panel ana sayfasına dönüş; landmark layout'ta kalır.
 */
export function PanelRouteError({ error, reset, homeHref, scope, noindex = false }: PanelRouteErrorProps) {
  const copy = useStateCopy();

  useEffect(() => {
    console.error(`[${scope}] route error boundary:`, error);
    captureClientError(error);
  }, [error, scope]);

  useEffect(() => {
    if (!noindex) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [noindex]);

  return (
    <ErrorState
      variant="page"
      title={copy.pageErrorTitle}
      description={copy.pageErrorBody}
      digest={error.digest}
      onRetry={reset}
      action={
        <Button asChild variant="outline">
          <Link href={homeHref}>
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            {copy.backToPanel}
          </Link>
        </Button>
      }
    />
  );
}
