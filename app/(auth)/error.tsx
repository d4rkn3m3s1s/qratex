'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppT } from '@/lib/app-locale';
import { AuthCard } from '@/components/auth/p-auth/auth-card';

/** Kimlik segmenti hata sınırı — aynı kart diliyle (Sentry'ye raporlar, tekrar dene + giriş). */
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
    <AuthCard
      tone="danger"
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title={t('auth.errorTitle')}
      description={t('auth.errorDescription')}
      live="assertive"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" onClick={reset} className="w-full">
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
          {t('auth.errorRetry')}
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">
            <LogIn className="h-4 w-4 shrink-0" aria-hidden />
            {t('auth.errorLogin')}
          </Link>
        </Button>
      </div>
    </AuthCard>
  );
}
