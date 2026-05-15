'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppT } from '@/lib/app-locale';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

function MagicInner() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const rawCallback = searchParams.get('callbackUrl');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const loginHref = useMemo(() => {
    const safe = safePostLoginRedirect(rawCallback, origin);
    return safe ? `/auth/login?callbackUrl=${encodeURIComponent(safe)}` : '/auth/login';
  }, [rawCallback, origin]);

  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await signIn('credentials', {
        magicToken: token,
        redirect: false,
      });
      if (cancelled) return;
      if (result?.error) {
        setStatus('error');
        toast.error(t('auth.magicPageError'));
        return;
      }
      setStatus('done');
      const dest = safePostLoginRedirect(rawCallback, typeof window !== 'undefined' ? window.location.origin : '') || '/';
      window.location.href = dest;
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t, rawCallback]);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.magicLinkTitle')}</CardTitle>
          <CardDescription>
            {status === 'working' ? t('auth.magicPageWorking') : status === 'error' ? t('auth.magicPageError') : t('auth.redirecting')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'working' ? <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden /> : null}
          {status === 'error' ? (
            <Button asChild variant="outline">
              <Link href={loginHref}>{t('auth.forgotPasswordBack')}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <MagicInner />
    </Suspense>
  );
}
