'use client';

import { playSound } from '@/lib/sound';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSession, signIn } from 'next-auth/react';
import { CheckCircle2, Link2Off, Loader2, ShieldCheck, UserCheck, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { track } from '@/lib/analytics';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { resolvePostLoginTarget, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AUTH_ERROR, isThrottleError, parseAuthError, type ParsedAuthError } from '@/lib/auth/login-errors';
import { AuthCard, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { resolveErrorCopy, useAuthCopy } from '@/components/auth/p-auth/copy';
import { TwoFactorStep } from '@/components/auth/p-auth/two-factor-step';

type Phase = 'confirm_switch' | 'working' | 'two_factor' | 'done' | 'error' | 'network';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bağlantıyla giriş — iki kaynak:
 *  - e-postadaki magic link (`?token=`)
 *  - 2FA'lı hesabın OAuth girişi (`?token=&via=oauth`, 5 dk'lık 2. adım bileti)
 *
 * P0-08: 2FA'lı hesapta bağlantı tek başına yetmez; sunucu `2FA_REQUIRED` döner, token
 * TÜKETİLMEZ ve bu ekran kod ister. Ağ hatasında token kullanılmamış olduğundan "Tekrar dene"
 * aynı bağlantıyla yeniden dener (eskiden sonsuz spinner / tek tip "geçersiz" ekranı vardı).
 * Süresi dolmuş bağlantıda e-posta yazılarak yenisi buradan istenir.
 */
export function MagicView({
  token,
  via,
  rawCallback,
  canRequestNewLink,
  signedIn = null,
}: {
  /** Başka bir oturum zaten açıksa bağlantı otomatik tüketilmez; kullanıcıya sorulur. */
  signedIn?: { email: string; continueHref: string } | null;
  token: string;
  via: 'email' | 'oauth';
  rawCallback: string | null;
  canRequestNewLink: boolean;
}) {
  const copy = useAuthCopy();
  const tokenRef = useRef(token);
  const startedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [phase, setPhase] = useState<Phase>(signedIn && token ? 'confirm_switch' : 'working');
  const [error, setError] = useState<ParsedAuthError | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeAttempt, setCodeAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);
  const loginHref = safeCallback ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/login';

  const attempt = useCallback(
    async (twoFactorCode?: string) => {
      const current = tokenRef.current;
      if (!current) {
        setError({ code: AUTH_ERROR.INVALID_LINK });
        setPhase('error');
        return;
      }
      let result: Awaited<ReturnType<typeof signIn>>;
      try {
        result = await signIn('credentials', {
          magicToken: current,
          ...(twoFactorCode ? { twoFactorCode } : {}),
          redirect: false,
        });
      } catch {
        // İstek sunucuya ulaşmadı → token tüketilmedi; aynı bağlantıyla tekrar denenebilir.
        setPhase('network');
        return;
      }
      if (result?.ok && !result.error) {
        setPhase('done');
        track('login_succeeded', { method: via === 'oauth' ? 'oauth_2fa' : 'magic' });
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
        setCodeAttempt((n) => n + 1);
        return;
      }
      track('login_failed', { method: via === 'oauth' ? 'oauth_2fa' : 'magic', code: err.code });
      setError(err);
      setPhase('error');
    },
    [rawCallback, copy, via]
  );

  useEffect(() => {
    if (startedRef.current) return; // StrictMode çift efektinde token iki kez denenmesin
    startedRef.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    if (signedIn && tokenRef.current) return; // önce kullanıcıya sorulur
    void attempt();
  }, [attempt, signedIn]);

  useEffect(() => {
    if (phase === 'error' || phase === 'network') headingRef.current?.focus();
  }, [phase]);

  const submitCode = async (code: string) => {
    setCodeError(null);
    setSubmitting(true);
    await attempt(code);
    setSubmitting(false);
  };

  const requestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized || !EMAIL_RE.test(normalized)) {
      setEmailError(normalized ? copy.invalidEmail : copy.emailRequired);
      return;
    }
    setEmailError(null);
    setRequestState('sending');
    try {
      const payload: { email: string; callbackUrl?: string } = { email: normalized };
      if (safeCallback) payload.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setRequestState(res.ok ? 'sent' : 'failed');
      if (res.ok) playSound('send');
      if (res.ok) track('magic_link_requested', { from: 'magic_error' });
    } catch {
      setRequestState('failed');
    }
  };

  const backLink = (
    <Link href={loginHref} className={authLinkClass}>
      {copy.backToLogin}
    </Link>
  );

  if (phase === 'confirm_switch' && signedIn) {
    return (
      <AuthCard
        icon={<UserCheck className="h-6 w-6" aria-hidden />}
        title={copy.signedInTitle}
        description={copy.magicSwitchBody(signedIn.email)}
      >
        <div className="grid gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setPhase('working');
              void attempt();
            }}
          >
            {copy.magicSwitchConfirm}
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={signedIn.continueHref}>{copy.magicSwitchStay}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (phase === 'two_factor') {
    return (
      <AuthCard
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title={copy.twoFactorTitle}
        description={via === 'oauth' ? copy.twoFactorOAuthBody : copy.twoFactorBody}
        footer={backLink}
      >
        <TwoFactorStep
          showIntro={false}
          error={codeError}
          attempt={codeAttempt}
          submitting={submitting}
          onSubmit={(c) => void submitCode(c)}
        />
      </AuthCard>
    );
  }

  if (phase === 'network') {
    return (
      <AuthCard
        tone="warning"
        icon={<WifiOff className="h-6 w-6" aria-hidden />}
        title={copy.magicNetworkTitle}
        description={copy.magicNetworkBody}
        headingRef={headingRef}
        footer={backLink}
      >
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setPhase('working');
            void attempt();
          }}
        >
          {copy.tryAgain}
        </Button>
      </AuthCard>
    );
  }

  if (phase === 'error' && error) {
    const msg = resolveErrorCopy(copy, error.code, error.retryAfterSec);
    const throttled = isThrottleError(error);
    const offerNewLink = via === 'email' && canRequestNewLink && !throttled && error.code !== AUTH_ERROR.ACCOUNT_SUSPENDED;
    return (
      <AuthCard
        tone={throttled ? 'warning' : 'danger'}
        icon={<Link2Off className="h-6 w-6" aria-hidden />}
        title={msg.title}
        description={msg.body}
        headingRef={headingRef}
        footer={backLink}
      >
        {offerNewLink ? (
          requestState === 'sent' ? (
            <AuthNotice tone="success">{copy.magicLinkSent(normalizeEmail(email))}</AuthNotice>
          ) : (
            <form onSubmit={requestNewLink} noValidate className="space-y-3">
              <p className="qx-small font-semibold text-fg">{copy.magicRequestTitle}</p>
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">{copy.emailLabel}</Label>
                <Input
                  id="magic-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="send"
                  maxLength={320}
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={!!emailError}
                  errorId="magic-email-error"
                />
                <InlineError id="magic-email-error">{emailError}</InlineError>
              </div>
              <Button type="submit" className="w-full" loading={requestState === 'sending'}>
                {copy.magicRequestSubmit}
              </Button>
              {requestState === 'failed' ? <AuthNotice tone="warning">{copy.magicLinkUnavailable}</AuthNotice> : null}
            </form>
          )
        ) : (
          <Button asChild className="w-full">
            <Link href={loginHref}>{copy.continueToLogin}</Link>
          </Button>
        )}
      </AuthCard>
    );
  }

  const done = phase === 'done';
  return (
    <AuthCard
      tone={done ? 'success' : 'brand'}
      icon={done ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
      title={done ? copy.magicDoneBody : copy.magicWorkingTitle}
      description={done ? undefined : copy.magicWorkingBody}
      live="polite"
    />
  );
}
