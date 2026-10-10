'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, MailCheck, MailX, RotateCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { track } from '@/lib/analytics';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AuthCard, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { resolveErrorCopy, useAuthCopy } from '@/components/auth/p-auth/copy';
import { recallAuthEmail, rememberAuthEmail } from '@/components/auth/p-auth/email-handoff';
import { useCountdown } from '@/components/auth/p-auth/use-countdown';
import { InboxShortcuts } from '@/components/auth/p-auth/verify-pending';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SEC = 60;

/**
 * Şifre sıfırlama isteği — iki durumlu kart: `form` → `sent` (kalıcı "gelen kutunu kontrol et",
 * gelen kutusu kısayolları, 60 sn geri sayımlı yeniden gönder, farklı e-posta). Yanıt hesabın
 * varlığından bağımsızdır; sunucunun Türkçe cümlesi yerine kod okunur (EN kullanıcıya TR metin yok).
 */
export function ForgotPasswordView({
  rawCallback,
  mailConfigured,
  magicLink,
  signedInEmail,
}: {
  rawCallback: string | null;
  mailConfigured: boolean;
  magicLink: boolean;
  signedInEmail: string | null;
}) {
  const copy = useAuthCopy();
  const cooldown = useCountdown();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [magicState, setMagicState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);
  const loginHref = safeCallback ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/login';

  useEffect(() => {
    const remembered = recallAuthEmail();
    if (remembered) setEmail((cur) => cur || remembered);
  }, []);

  useEffect(() => {
    if (sentTo) headingRef.current?.focus();
  }, [sentTo]);

  const request = async (target: string) => {
    setLoading(true);
    setProblem(null);
    try {
      const body: { email: string; callbackUrl?: string } = { email: target };
      if (safeCallback) body.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSentTo(target);
        rememberAuthEmail(target);
        cooldown.start(Number(res.headers.get('Retry-After')) || RESEND_COOLDOWN_SEC);
        track('password_reset_requested');
      } else if (res.status === 503) {
        setProblem(copy.mailUnavailable);
      } else if (res.status === 400) {
        setFieldError(copy.invalidEmail);
      } else {
        setProblem(resolveErrorCopy(copy, 'UNKNOWN').body);
      }
    } catch {
      setProblem(copy.networkError);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) return setFieldError(copy.emailRequired);
    if (!EMAIL_RE.test(normalized)) return setFieldError(copy.invalidEmail);
    setFieldError(null);
    void request(normalized);
  };

  const sendMagic = async () => {
    if (!sentTo || magicState === 'sending') return;
    setMagicState('sending');
    try {
      const payload: { email: string; callbackUrl?: string } = { email: sentTo };
      if (safeCallback) payload.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setMagicState(res.ok ? 'sent' : 'failed');
      if (res.ok) track('magic_link_requested', { from: 'forgot_password' });
    } catch {
      setMagicState('failed');
    }
  };

  const backLink = (
    <Link href={loginHref} className={`${authLinkClass} gap-1.5`}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {copy.backToLogin}
    </Link>
  );

  if (!mailConfigured) {
    return (
      <AuthCard
        tone="warning"
        icon={<MailX className="h-6 w-6" aria-hidden />}
        title={copy.forgotUnavailableTitle}
        description={copy.forgotUnavailableBody}
        footer={backLink}
      />
    );
  }

  if (sentTo) {
    return (
      <AuthCard
        tone="success"
        icon={<MailCheck className="h-6 w-6" aria-hidden />}
        title={copy.forgotSentTitle}
        description={copy.forgotSentBody(sentTo)}
        headingRef={headingRef}
        live="polite"
        footer={backLink}
      >
        <InboxShortcuts />
        <p className="qx-small text-center text-fg-muted text-pretty">{copy.forgotSentHint}</p>
        {problem ? <AuthNotice tone="warning">{problem}</AuthNotice> : null}
        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            loading={loading}
            disabled={cooldown.remaining > 0}
            onClick={() => void request(sentTo)}
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            {cooldown.remaining > 0 ? copy.resendIn(cooldown.remaining) : copy.forgotResend}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setSentTo(null);
              setMagicState('idle');
              cooldown.reset();
            }}
          >
            {copy.forgotDifferentEmail}
          </Button>
        </div>
        {magicLink ? (
          <div className="space-y-2 rounded-control border border-border bg-surface-0 p-4">
            <p className="qx-small font-semibold text-fg">{copy.forgotMagicTitle}</p>
            <p className="qx-small text-fg-muted text-pretty">{copy.forgotMagicBody}</p>
            {magicState === 'sent' ? (
              <AuthNotice tone="success">{copy.magicLinkSent(sentTo)}</AuthNotice>
            ) : (
              <Button type="button" variant="outline" className="w-full" loading={magicState === 'sending'} onClick={() => void sendMagic()}>
                <Sparkles className="h-4 w-4" aria-hidden />
                {copy.forgotMagicSubmit}
              </Button>
            )}
            {magicState === 'failed' ? <AuthNotice tone="warning">{copy.magicLinkUnavailable}</AuthNotice> : null}
          </div>
        ) : null}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<KeyRound className="h-6 w-6" aria-hidden />}
      title={copy.forgotTitle}
      description={copy.forgotBody}
      footer={backLink}
    >
      {signedInEmail ? <AuthNotice tone="info">{copy.forgotSignedInBody(signedInEmail)}</AuthNotice> : null}
      {problem ? <AuthNotice tone="warning">{problem}</AuthNotice> : null}
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">{copy.emailLabel}</Label>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="send"
            placeholder={copy.emailPlaceholder}
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!fieldError}
            errorId="forgot-email-error"
          />
          <InlineError id="forgot-email-error">{fieldError}</InlineError>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {copy.forgotSubmit}
        </Button>
      </form>
    </AuthCard>
  );
}
