'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppT } from '@/lib/app-locale';

function VerifyEmailLoadingFallback() {
  const t = useAppT();
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{t('auth.verifyPageLoadingSr')}</span>
    </div>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const t = useAppT();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('auth.verifyInvalidToken'));
      return;
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus('success');
          setMessage(typeof data.message === 'string' && data.message ? data.message : t('auth.verifySuccessDefault'));
        } else {
          setStatus('error');
          setMessage(typeof data.error === 'string' && data.error ? data.error : t('auth.verifyFailedDefault'));
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage(t('auth.verifyConnectionError'));
      });
  }, [token, t]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <Card glass className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader>
          <CardTitle className="text-center text-balance tracking-tight">{t('auth.verifyPageTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div
            role="status"
            aria-live="polite"
            aria-busy={status === 'loading'}
            aria-atomic="true"
            className="space-y-4"
          >
            {status === 'loading' && (
              <>
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" aria-hidden />
                <p className="text-muted-foreground">{t('auth.verifyPageLoading')}</p>
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
                <p className="font-medium">{message}</p>
                <Button asChild className="w-full">
                  <Link
                    href="/auth/login"
                    className="min-h-11 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t('auth.verifyLoginButton')}
                  </Link>
                </Button>
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />
                <p className="text-destructive/90">{message}</p>
                <div className="flex justify-center gap-2">
                  <Button asChild variant="outline">
                    <Link
                      href="/auth/register"
                      className="min-h-11 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t('auth.verifyRetryRegister')}
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link
                      href="/auth/login"
                      className="min-h-11 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t('auth.verifyLoginButton')}
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
