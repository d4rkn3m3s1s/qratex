'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureClientError } from '@/lib/observability/capture-client-error';
import { RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { useLocaleSafe } from '@/lib/app-locale';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const en = useLocaleSafe() === 'en';
  useEffect(() => {
    console.error('App error boundary:', error);
    captureClientError(error);
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-0 px-4 text-fg">
      <SkipToMainContent targetId="app-error-main" variant="content" />
      <main
        id="app-error-main"
        tabIndex={-1}
        className="w-full max-w-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <p className="qx-caption flex items-center gap-2 font-medium text-danger">
          <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
          {en ? 'Error' : 'Hata'}
        </p>
        <h1 className="qx-h1 mt-2 text-balance">{en ? 'Something went wrong' : 'Bir hata oluştu'}</h1>
        <p className="qx-body mt-3 text-fg-muted text-pretty">
          {en
            ? 'An unexpected problem came up. Try reloading the page or head back to the home page.'
            : 'Beklenmeyen bir sorun oluştu. Sayfayı yenilemeyi veya ana sayfaya dönmeyi deneyin.'}
        </p>
        {error.digest ? (
          <p className="qx-caption mt-3 text-fg-muted">
            {en ? 'Reference' : 'Referans'}: <span className="font-mono tabular-nums">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
          <Button type="button" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            {en ? 'Try again' : 'Tekrar Dene'}
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              {en ? 'Home' : 'Ana Sayfa'}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
