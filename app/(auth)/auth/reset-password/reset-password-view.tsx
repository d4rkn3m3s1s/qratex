'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, KeyRound, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AuthCard, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { useAuthCopy } from '@/components/auth/p-auth/copy';
import { PasswordField, PasswordMatchHint } from '@/components/auth/p-auth/password-field';
import { evaluatePassword } from '@/components/auth/p-auth/password-policy';

export type ResetTokenStatus = 'valid' | 'invalid' | 'unknown';

/**
 * Yeni şifre — üç durum: form (ön-doğrulanmış bağlantı) · geçersiz/süresi dolmuş (yeni bağlantı
 * iste) · başarı (kart içinde; diğer cihazlar çıkış yaptı, "Giriş yap"). Token adres çubuğundan
 * hemen silinir, yalnız bellekte tutulur. Şifre politikası kayıtla aynıdır (canlı kural listesi).
 */
export function ResetPasswordView({
  token,
  initialStatus,
  rawCallback,
  account = null,
}: {
  token: string;
  initialStatus: ResetTokenStatus;
  /** Geçerli bağlantının hesabı (sunucudan): maskeli gösterim + parola yöneticisi kullanıcı adı. */
  account?: { email: string; masked: string; minutesLeft: number } | null;
  rawCallback: string | null;
}) {
  const copy = useAuthCopy();
  const tokenRef = useRef(token);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<ResetTokenStatus | 'done'>(initialStatus);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);
  const loginHref = safeCallback ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/login';
  const forgotHref = safeCallback ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/forgot-password';

  // Token'ı adres çubuğundan ve geçmişten sil (analitik / ekran görüntüsü / geçmiş sızıntısı yok).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (status === 'done' || status === 'invalid') headingRef.current?.focus();
  }, [status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setPwError(null);
    setConfirmError(null);
    setFormError(null);
    const ev = evaluatePassword(password);
    if (ev.tooLong) return setPwError(copy.passwordTooLong);
    if (!ev.meetsPolicy) return setPwError(copy.passwordWeak);
    if (password !== confirm) return setConfirmError(copy.passwordsDontMatch);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, newPassword: password }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.ok) {
        tokenRef.current = '';
        setPassword('');
        setConfirm('');
        setStatus('done');
        track('password_reset_completed');
      } else if (data.code === 'WEAK_PASSWORD') setPwError(copy.passwordWeak);
      else if (data.code === 'PASSWORD_TOO_LONG') setPwError(copy.passwordTooLong);
      else if (data.code === 'INVALID_LINK') setStatus('invalid');
      else if (res.status === 429) setFormError(copy.resetRateLimited);
      else setFormError(copy.resetFailed);
    } catch {
      setFormError(copy.networkError);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'done') {
    return (
      <AuthCard
        tone="success"
        icon={<CheckCircle2 className="h-6 w-6" aria-hidden />}
        title={copy.resetSuccessTitle}
        description={copy.resetSuccessBody}
        headingRef={headingRef}
        live="polite"
      >
        <Button asChild className="w-full">
          <Link href={`${loginHref}${loginHref.includes('?') ? '&' : '?'}reset=1`}>{copy.continueToLogin}</Link>
        </Button>
      </AuthCard>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthCard
        tone="danger"
        icon={<Link2Off className="h-6 w-6" aria-hidden />}
        title={copy.resetInvalidTitle}
        description={copy.resetInvalidBody}
        headingRef={headingRef}
        footer={
          <Link href={loginHref} className={`${authLinkClass} gap-1.5`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {copy.backToLogin}
          </Link>
        }
      >
        <Button asChild className="w-full">
          <Link href={forgotHref}>{copy.resetNewLink}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<KeyRound className="h-6 w-6" aria-hidden />}
      title={copy.resetTitle}
      description={copy.resetBody}
      footer={
        <Link href={loginHref} className={`${authLinkClass} gap-1.5`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {copy.backToLogin}
        </Link>
      }
    >
      {status === 'unknown' ? <AuthNotice tone="info">{copy.resetUnknownBody}</AuthNotice> : null}
      {account ? <p className="qx-small text-center text-fg-muted">{copy.resetForAccount(account.masked, account.minutesLeft)}</p> : null}
      {formError ? <AuthNotice tone="danger">{formError}</AuthNotice> : null}
      <form onSubmit={submit} noValidate className="space-y-4">
        {/* Parola yöneticisi yeni şifreyi hesapla eşleştirebilsin diye kullanıcı adı ipucu. */}
        <input type="email" name="username" autoComplete="username" hidden readOnly value={account?.email ?? ''} />
        <PasswordField
          id="reset-password"
          name="new-password"
          label={copy.passwordLabel}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
          error={pwError}
          showStrength
          visible={show}
          onVisibleChange={setShow}
        />
        <div className="space-y-1.5">
          <PasswordField
            id="reset-confirm"
            name="confirm-password"
            label={copy.confirmPasswordLabel}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={confirmError}
            visible={show}
            onVisibleChange={setShow}
          />
          {!confirmError ? <PasswordMatchHint password={password} confirm={confirm} /> : null}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {copy.resetSubmit}
        </Button>
      </form>
    </AuthCard>
  );
}
