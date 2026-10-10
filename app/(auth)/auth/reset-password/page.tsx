'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Lock, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineError } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';
import { useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';

/**
 * Şifre sıfırlama. Token adres çubuğundan hemen silinir (analitik / oturum kaydı / geçmiş
 * üzerinden sızmasın), yalnız bellekte tutulur. Başarıda sunucu `sessionVersion`'ı artırır
 * (diğer cihazlar çıkış yapar); kullanıcı `?reset=1` ile giriş ekranına, kalıcı bilgi bandıyla gider.
 */
function ResetPasswordInner() {
  const t = useAppT();
  const copy = useAuthCopy();
  const searchParams = useSearchParams();
  // Token yalnız ilk render'da URL'den alınır ve bellekte tutulur (URL'den sonra silinir).
  const [token] = useState(() => searchParams.get('token') || '');
  const hasToken = token.length > 0;
  const rawCallback = searchParams.get('callbackUrl');
  const [loginHref, setLoginHref] = useState('/auth/login');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const safe = safePostLoginRedirect(rawCallback, window.location.origin);
    setLoginHref(safe ? `/auth/login?callbackUrl=${encodeURIComponent(safe)}` : '/auth/login');
    if (token) {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [rawCallback, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setFormError(null);
    if (!token) {
      setFormError(t('auth.resetPasswordInvalidToken'));
      return;
    }
    if (password.length < 8) {
      setFieldError(t('auth.passwordMinLength'));
      return;
    }
    if (password !== confirm) {
      setFieldError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === 'WEAK_PASSWORD') setFieldError(typeof data.error === 'string' ? data.error : t('auth.passwordMinLength'));
        else setFormError(typeof data.error === 'string' ? data.error : t('auth.resetPasswordInvalidToken'));
        setLoading(false);
        return;
      }
      setPassword('');
      setConfirm('');
      const sep = loginHref.includes('?') ? '&' : '?';
      window.location.assign(`${loginHref}${sep}reset=1`);
    } catch {
      setFormError(t('common.error'));
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card glass>
          <CardHeader>
            <CardTitle className="qx-h2">{t('auth.resetPasswordPageTitle')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordPageDesc')}</CardDescription>
          </CardHeader>
          <form onSubmit={submit} noValidate>
            <CardContent className="space-y-4">
              {!hasToken ? (
                <AuthNotice
                  tone="danger"
                  title={copy.errors.INVALID_LINK.title}
                  action={
                    <Link href="/auth/forgot-password" className="qx-small font-medium text-brand underline-offset-4 hover:underline">
                      {t('auth.forgotPassword')}
                    </Link>
                  }
                >
                  {copy.errors.INVALID_LINK.body}
                </AuthNotice>
              ) : null}
              {formError ? (
                <AuthNotice
                  tone="danger"
                  action={
                    <Link href="/auth/forgot-password" className="qx-small font-medium text-brand underline-offset-4 hover:underline">
                      {t('auth.forgotPassword')}
                    </Link>
                  }
                >
                  {formError}
                </AuthNotice>
              ) : null}
              {/* Parola yöneticisi için kullanıcı adı ipucu (boş; tarayıcı doldurur). */}
              <input type="text" name="username" autoComplete="username" hidden readOnly value="" />
              <div className="space-y-2">
                <Label htmlFor="np">{t('auth.passwordLabel')}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="np"
                    type={show ? 'text' : 'password'}
                    className="pl-9 pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    error={!!fieldError}
                    errorId="reset-password-error"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={show ? copy.hidePassword : copy.showPassword}
                  >
                    {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="npc">{t('auth.confirmPasswordLabel')}</Label>
                <Input
                  id="npc"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                  required
                  error={!!fieldError}
                  errorId="reset-password-error"
                />
                <InlineError id="reset-password-error">{fieldError}</InlineError>
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={!hasToken}>
                {t('auth.resetPasswordSubmit')}
              </Button>
            </CardContent>
          </form>
          <CardFooter>
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
