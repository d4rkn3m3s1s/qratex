'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { Loader2, ShieldCheck, Link2Off, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineError } from '@/components/states';
import { resolvePostLoginTarget, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AUTH_ERROR, isThrottleError, parseAuthError, type ParsedAuthError } from '@/lib/auth/login-errors';
import { resolveErrorCopy, useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';

type Phase = 'working' | 'two_factor' | 'done' | 'error';

/**
 * Bağlantıyla giriş — iki kaynak:
 *  - e-postadaki magic link (`?token=`)
 *  - 2FA'lı hesabın OAuth girişi (`?token=&via=oauth`, 5 dk'lık 2. adım bileti)
 *
 * P0-08: 2FA'lı hesapta bağlantı tek başına yetmez; sunucu `2FA_REQUIRED` döner, token
 * TÜKETİLMEZ ve bu ekran kod ister. Token adres çubuğundan hemen silinir (analitik /
 * oturum kaydı / geçmiş üzerinden sızmasın); yalnız bellekte tutulur.
 */
function MagicInner() {
  const copy = useAuthCopy();
  const searchParams = useSearchParams();
  const via = searchParams.get('via');
  const rawCallback = searchParams.get('callbackUrl');
  const tokenRef = useRef<string>(searchParams.get('token') || '');
  const startedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('working');
  const [error, setError] = useState<ParsedAuthError | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loginHref = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    const safe = sanitizeCallbackPath(rawCallback, origin);
    return safe ? `/auth/login?callbackUrl=${encodeURIComponent(safe)}` : '/auth/login';
  }, [rawCallback]);

  const attempt = useCallback(
    async (twoFactorCode?: string) => {
      const token = tokenRef.current;
      if (!token) {
        setError({ code: AUTH_ERROR.INVALID_LINK });
        setPhase('error');
        return;
      }
      let result: Awaited<ReturnType<typeof signIn>>;
      try {
        result = await signIn('credentials', {
          magicToken: token,
          ...(twoFactorCode ? { twoFactorCode } : {}),
          redirect: false,
        });
      } catch {
        setError({ code: 'UNKNOWN' });
        setPhase('error');
        return;
      }
      if (result?.ok && !result.error) {
        setPhase('done');
        const session = await getSession();
        window.location.assign(resolvePostLoginTarget(rawCallback, session?.user?.role ?? null, window.location.origin));
        return;
      }
      const err = parseAuthError(result?.error) ?? { code: 'UNKNOWN' as const };
      if (err.code === AUTH_ERROR.TWO_FACTOR_REQUIRED) {
        setPhase('two_factor');
        return;
      }
      if (err.code === AUTH_ERROR.INVALID_2FA) {
        setPhase('two_factor');
        setCodeError(resolveErrorCopy(copy, err.code).body);
        setCode('');
        return;
      }
      setError(err);
      setPhase('error');
    },
    [rawCallback, copy]
  );

  useEffect(() => {
    if (startedRef.current) return; // StrictMode çift efektinde token iki kez denenmesin
    startedRef.current = true;
    // Token'ı adres çubuğundan ve geçmişten temizle.
    if (typeof window !== 'undefined' && tokenRef.current) {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void attempt();
  }, [attempt]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setCodeError(copy.twoFactorCodeShort);
      return;
    }
    setCodeError(null);
    setSubmitting(true);
    await attempt(trimmed);
    setSubmitting(false);
  };

  const errorCopy = error ? resolveErrorCopy(copy, error.code, error.retryAfterSec) : null;

  return (
    <div className="w-full max-w-md">
      <Card glass>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-subtle ring-1 ring-inset ring-brand-border">
            {phase === 'error' ? (
              <Link2Off className="h-6 w-6 text-danger" aria-hidden />
            ) : phase === 'done' ? (
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
            ) : phase === 'two_factor' ? (
              <ShieldCheck className="h-6 w-6 text-brand" aria-hidden />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
            )}
          </div>
          <CardTitle className="qx-h2">
            {phase === 'two_factor' ? copy.twoFactorTitle : phase === 'error' ? copy.magicErrorTitle : copy.magicWorkingTitle}
          </CardTitle>
          <CardDescription role="status" aria-live="polite">
            {phase === 'working'
              ? copy.magicWorkingBody
              : phase === 'done'
                ? copy.magicDoneBody
                : phase === 'two_factor'
                  ? via === 'oauth'
                    ? copy.twoFactorOAuthBody
                    : copy.twoFactorBody
                  : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === 'two_factor' ? (
            <form className="space-y-4" onSubmit={submitCode}>
              <div className="space-y-1.5">
                <Label htmlFor="magic-2fa">{copy.twoFactorLabel}</Label>
                <Input
                  id="magic-2fa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  autoFocus
                  maxLength={32}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  error={!!codeError}
                  errorId="magic-2fa-error"
                />
                <InlineError id="magic-2fa-error">{codeError}</InlineError>
              </div>
              <Button type="submit" className="w-full" loading={submitting}>
                {copy.twoFactorSubmit}
              </Button>
            </form>
          ) : null}

          {phase === 'error' && errorCopy ? (
            <>
              <AuthNotice tone={isThrottleError(error) ? 'warning' : 'danger'} title={errorCopy.title}>
                {errorCopy.body}
              </AuthNotice>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="w-full">
                  <Link href={loginHref}>{copy.backToLogin}</Link>
                </Button>
                {via !== 'oauth' ? (
                  <Button asChild className="w-full">
                    <Link href={loginHref}>{copy.magicNewLink}</Link>
                  </Button>
                ) : null}
              </div>
            </>
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
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <MagicInner />
    </Suspense>
  );
}
