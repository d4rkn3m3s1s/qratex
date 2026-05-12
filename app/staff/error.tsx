'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Staff error boundary:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-8" role="alert">
      <SkipToMainContent targetId="staff-error-main" label="İçeriğe atla" />
      <main
        id="staff-error-main"
        tabIndex={-1}
        className="max-w-sm space-y-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="inline-flex rounded-full bg-destructive/10 p-4" aria-hidden>
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Sayfa yüklenemedi</h2>
        <p className="text-muted-foreground text-sm">
          Bir hata oluştu. Tekrar deneyin veya personel alanına dönün.
        </p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
          <Button type="button" onClick={reset} size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            Tekrar dene
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/staff">
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              Personel alanı
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
