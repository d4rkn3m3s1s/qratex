'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, Home, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin error boundary:', error);
    Sentry.captureException(error);
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background to-destructive/5 px-4">
      <SkipToMainContent targetId="admin-error-main" label="İçeriğe atla" />
      <main
        id="admin-error-main"
        tabIndex={-1}
        className="max-w-md space-y-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="inline-flex rounded-full bg-destructive/10 p-4" aria-hidden>
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold">Bir hata oluştu</h1>
        <p className="text-muted-foreground text-sm">
          Beklenmeyen bir sorun oluştu. Sayfayı yenilemeyi veya yönetim paneline dönmeyi deneyin.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            Tekrar Dene
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/admin">
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              Yönetim Paneli
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              Ana Sayfa
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
