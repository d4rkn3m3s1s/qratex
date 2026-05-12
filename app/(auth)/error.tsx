'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { useAppT } from '@/lib/app-locale';

export default function AuthSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useAppT();

  useEffect(() => {
    console.error('Auth segment error:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-8" role="alert">
      <SkipToMainContent targetId="auth-error-main" label={t('auth.errorSkipToContent')} />
      <main
        id="auth-error-main"
        tabIndex={-1}
        className="max-w-sm space-y-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="inline-flex rounded-full bg-destructive/10 p-4" aria-hidden>
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">{t('auth.errorTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('auth.errorDescription')}</p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
          <Button type="button" onClick={reset} size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            {t('auth.errorRetry')}
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/auth/login">
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              {t('auth.errorLogin')}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
