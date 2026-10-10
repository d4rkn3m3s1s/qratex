'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineError } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';

/**
 * Şifre sıfırlama isteği. Yanıt hesabın varlığından bağımsızdır; başarı kalıcı bantla
 * anlatılır (kaybolan toast değil). `callbackUrl` ortak süzgeçten geçer (P0-02).
 */
function ForgotPasswordInner() {
  const t = useAppT();
  const copy = useAuthCopy();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get('callbackUrl');
  const [safeCallback, setSafeCallback] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    setSafeCallback(safePostLoginRedirect(rawCallback, window.location.origin));
  }, [rawCallback]);

  const loginHref = safeCallback ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/login';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setFieldError(copy.invalidEmail);
      return;
    }
    setFieldError(null);
    setResult(null);
    setLoading(true);
    try {
      const body: { email: string; callbackUrl?: string } = { email: normalized };
      if (safeCallback) body.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      if (res.ok) {
        setResult({ tone: 'success', text: typeof data.message === 'string' ? data.message : t('auth.forgotPasswordToastOk') });
      } else if (res.status === 503) {
        setResult({ tone: 'warning', text: copy.mailUnavailable });
      } else if (res.status === 400) {
        setFieldError(copy.invalidEmail);
      } else {
        setResult({ tone: 'warning', text: copy.errors.UNKNOWN.body });
      }
    } catch {
      setResult({ tone: 'warning', text: copy.verifyNetworkBody });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card glass>
          <CardHeader>
            <CardTitle className="qx-h2">{t('auth.forgotPasswordPageTitle')}</CardTitle>
            <CardDescription>{t('auth.forgotPasswordPageDesc')}</CardDescription>
          </CardHeader>
          <form onSubmit={submit} noValidate>
            <CardContent className="space-y-4">
              {result ? <AuthNotice tone={result.tone}>{result.text}</AuthNotice> : null}
              <div className="space-y-2">
                <Label htmlFor="fp-email">{t('auth.emailLabel')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="fp-email"
                    type="email"
                    inputMode="email"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="send"
                    required
                    error={!!fieldError}
                    errorId="fp-email-error"
                  />
                </div>
                <InlineError id="fp-email-error">{fieldError}</InlineError>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {t('auth.forgotPasswordSubmit')}
              </Button>
            </CardContent>
          </form>
          <CardFooter className="flex flex-col gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" className="w-full gap-2" asChild>
              <Link href={loginHref}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t('auth.forgotPasswordBack')}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </Motion.div>
    </div>
  );
}

function ForgotPasswordFallback() {
  const t = useAppT();
  return (
    <div className="flex justify-center py-20" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
