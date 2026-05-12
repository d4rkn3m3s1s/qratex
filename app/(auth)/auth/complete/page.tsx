'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Gift, CheckCircle2 } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';

/**
 * OAuth (Google/GitHub) ile kayıt sonrası callback.
 * URL'de ref varsa davet kodunu uygular, sonra next'e yönlendirir.
 */
function AuthCompleteContent() {
  const t = useAppT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const refCode = searchParams.get('ref')?.trim().toUpperCase() || null;
  const nextUrl = searchParams.get('next') || '/customer';
  const [applied, setApplied] = useState<'idle' | 'applying' | 'done' | 'skip'>('idle');

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.replace(nextUrl);
      return;
    }
    if (!refCode) {
      router.replace(nextUrl);
      return;
    }
    if (applied !== 'idle') return;

    setApplied('applying');
    fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode }),
    })
      .then((res) => res.json())
      .then((result) => {
        setApplied(result.success ? 'done' : 'skip');
        const safeNext = nextUrl.startsWith('/') ? nextUrl : '/customer';
        setTimeout(() => router.replace(safeNext), result.success ? 1500 : 800);
      })
      .catch(() => {
        setApplied('skip');
        setTimeout(() => router.replace(nextUrl.startsWith('/') ? nextUrl : '/customer'), 800);
      });
  }, [status, refCode, nextUrl, applied, router]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={applied !== 'done'}
      aria-atomic="true"
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-sm backdrop-blur-sm"
    >
      {applied === 'done' ? (
        <>
          <CheckCircle2 className="h-14 w-14 text-emerald-500" aria-hidden />
          <p className="text-lg font-medium">{t('auth.completeReferralApplied')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.completeRedirectingApp')}</p>
        </>
      ) : (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
          <p key={`${applied}-${refCode ?? 'noref'}`} className="text-center text-muted-foreground">
            {refCode ? (
              <>
                <Gift className="mr-1 -mt-0.5 inline h-4 w-4 shrink-0 align-text-bottom text-primary" aria-hidden />
                {t('auth.completeProcessingReferral')}
              </>
            ) : (
              t('auth.completeRedirecting')
            )}
          </p>
        </>
      )}
    </div>
  );
}

function AuthCompleteFallback() {
  const t = useAppT();
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{t('auth.completeLoadingSr')}</span>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteFallback />}>
      <AuthCompleteContent />
    </Suspense>
  );
}
