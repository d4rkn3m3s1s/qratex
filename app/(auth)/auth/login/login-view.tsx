'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import { Mail, MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { track } from '@/lib/analytics';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { resolvePostLoginTarget, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AUTH_ERROR, isThrottleError, parseAuthError, type ParsedAuthError } from '@/lib/auth/login-errors';
import { AuthCard, AuthDivider, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { resolveErrorCopy, useAuthCopy } from '@/components/auth/p-auth/copy';
import { DemoAccounts, type DemoAccount } from '@/components/auth/p-auth/demo-accounts';
import { recallAuthEmail, rememberAuthEmail } from '@/components/auth/p-auth/email-handoff';
import { OAuthButtons, type OAuthProvider } from '@/components/auth/p-auth/oauth-buttons';
import { PasswordField } from '@/components/auth/p-auth/password-field';
import { TwoFactorStep } from '@/components/auth/p-auth/two-factor-step';
import { useCountdown } from '@/components/auth/p-auth/use-countdown';
import { useResendVerification } from '@/components/auth/p-auth/use-resend-verification';

export type LoginNoticeKind = 'verified' | 'reset' | null;

type Notice =
  | { kind: 'error'; error: ParsedAuthError; email?: string }
  | { kind: 'success' | 'info'; text: string };

type Method = 'password' | 'demo' | 'magic' | OAuthProvider;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Giriş sonrası hedef — TEK KAYNAK `resolvePostLoginTarget` (P0-02). Ham `callbackUrl`
 * asla `window.location`'a verilmez; rol bilinmeden başka rolün paneline gidilmez.
 */
async function goToPostLoginTarget(rawCallback: string | null) {
  const session = await getSession();
  window.location.assign(resolvePostLoginTarget(rawCallback, session?.user?.role ?? null, window.location.origin));
}

export function LoginView({
  rawCallback,
  errorCode,
  initialNotice,
  features,
  qrPlace,
}: {
  rawCallback: string | null;
  errorCode: string | null;
  initialNotice: LoginNoticeKind;
  /** `registrationOpen: false` → "Kayıt ol" bağlantısı gizlenir (kapalı kayda çıkmaz yol yok). */
  features: { google: boolean; github: boolean; magicLink: boolean; registrationOpen?: boolean };
  qrPlace: string | null;
}) {
  const copy = useAuthCopy();
  const throttle = useCountdown();
  const resend = useResendVerification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(() => {
    const err = parseAuthError(errorCode);
    if (err) return { kind: 'error', error: err };
    return null;
  });
  const [busy, setBusy] = useState<Method | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string; method: Method } | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorAttempt, setTwoFactorAttempt] = useState(0);
  const [magicNotice, setMagicNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [demoRole, setDemoRole] = useState<DemoAccount['role'] | null>(null);
  const [demoError, setDemoError] = useState(false);

  // Güvenli callback YOLU — bağlantılarda taşınır (köken bilinmeden mutlak URL kabul edilmez).
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);
  const withCallback = (path: string) => (safeCallback ? `${path}?callbackUrl=${encodeURIComponent(safeCallback)}` : path);

  // Başka bir kimlik ekranında yazılmış e-postayı getir (URL'de taşınmaz).
  useEffect(() => {
    const remembered = recallAuthEmail();
    if (remembered) setEmail((cur) => cur || remembered);
  }, []);

  const staticNotice =
    initialNotice === 'verified'
      ? copy.noticeVerified
      : initialNotice === 'reset'
        ? copy.noticePasswordReset
        : null;

  const fail = (method: Method, error: ParsedAuthError, forEmail?: string) => {
    setNotice({ kind: 'error', error, email: forEmail });
    if (isThrottleError(error)) throttle.start(error.retryAfterSec ?? 60);
    track('login_failed', { method, code: error.code });
  };

  const succeed = async (method: Method) => {
    setRedirecting(true);
    track('login_succeeded', { method });
    await goToPostLoginTarget(rawCallback);
  };

  const credentialSignIn = async (method: Method, creds: { email: string; password: string }, twoFactorCode?: string) => {
    const result = await signIn('credentials', {
      email: creds.email,
      password: creds.password,
      ...(twoFactorCode ? { twoFactorCode } : {}),
      redirect: false,
    });
    if (result?.ok && !result.error) return { ok: true as const };
    return { ok: false as const, error: parseAuthError(result?.error) ?? ({ code: 'UNKNOWN' } as ParsedAuthError) };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || throttle.remaining > 0) return;
    const normalized = normalizeEmail(email);
    const errs: { email?: string; password?: string } = {};
    if (!normalized) errs.email = copy.emailRequired;
    else if (!EMAIL_RE.test(normalized)) errs.email = copy.invalidEmail;
    if (!password) errs.password = copy.passwordRequired;
    setFieldErrors(errs);
    if (errs.email || errs.password) return;

    setBusy('password');
    setNotice(null);
    setMagicNotice(null);
    try {
      const res = await credentialSignIn('password', { email: normalized, password });
      if (res.ok) return void (await succeed('password'));
      if (res.error.code === AUTH_ERROR.TWO_FACTOR_REQUIRED) {
        // Şifre doğru; kimlik bilgileri yalnız bellekte, kod adımına geçilir.
        setPendingCreds({ email: normalized, password, method: 'password' });
        setTwoFactorError(null);
      } else {
        fail('password', res.error, normalized);
      }
    } catch {
      fail('password', { code: 'UNKNOWN' });
    }
    setBusy(null);
  };

  const submitTwoFactor = async (code: string) => {
    if (!pendingCreds) return;
    setBusy(pendingCreds.method);
    setTwoFactorError(null);
    try {
      const res = await credentialSignIn(pendingCreds.method, pendingCreds, code);
      if (res.ok) return void (await succeed(pendingCreds.method));
      if (isThrottleError(res.error)) {
        setPendingCreds(null);
        fail(pendingCreds.method, res.error);
      } else {
        setTwoFactorError(resolveErrorCopy(copy, res.error.code === AUTH_ERROR.INVALID_2FA ? res.error.code : 'UNKNOWN').body);
        setTwoFactorAttempt((n) => n + 1);
        track('login_failed', { method: pendingCreds.method, code: res.error.code, step: '2fa' });
      }
    } catch {
      setTwoFactorError(resolveErrorCopy(copy, 'UNKNOWN').body);
      setTwoFactorAttempt((n) => n + 1);
    }
    setBusy(null);
  };

  const onDemo = async (account: DemoAccount) => {
    if (busy) return;
    setBusy('demo');
    setDemoRole(account.role);
    setDemoError(false);
    setNotice(null);
    try {
      const res = await credentialSignIn('demo', account);
      if (res.ok) return void (await succeed('demo'));
      if (res.error.code === AUTH_ERROR.TWO_FACTOR_REQUIRED) {
        setPendingCreds({ email: account.email, password: account.password, method: 'demo' });
      } else if (isThrottleError(res.error)) {
        fail('demo', res.error);
      } else {
        setDemoError(true);
        track('login_failed', { method: 'demo', code: res.error.code });
      }
    } catch {
      setDemoError(true);
    }
    setDemoRole(null);
    setBusy(null);
  };

  const onOAuth = async (provider: OAuthProvider) => {
    if (busy) return;
    setBusy(provider);
    // Girişte hesap türü seçilmez: kayıt ekranından kalmış bir "işletme" niyeti yeni OAuth
    // hesabını sessizce işletme yapmasın diye temizlenir (en iyi çaba).
    try {
      await fetch('/api/auth/signup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'CUSTOMER' }),
      });
    } catch {
      /* çerez kendi 15 dk ömrüyle düşer */
    }
    track('login_method_selected', { method: provider });
    // OAuth /auth/complete'e uğrar (yeni hesaba şifre adımı); `next` yalnız güvenli YOL.
    const next = safeCallback ? `?next=${encodeURIComponent(safeCallback)}` : '';
    void signIn(provider, { callbackUrl: `/auth/complete${next}` });
  };

  const sendMagicLink = async () => {
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (!normalized || !EMAIL_RE.test(normalized)) {
      setFieldErrors({ email: normalized ? copy.invalidEmail : copy.magicLinkNeedEmail });
      return;
    }
    setFieldErrors({});
    setBusy('magic');
    setMagicNotice(null);
    try {
      const payload: { email: string; callbackUrl?: string } = { email: normalized };
      if (safeCallback) payload.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Yanıt hesabın varlığından bağımsızdır; ham sunucu metni gösterilmez.
      if (res.ok) {
        setMagicNotice({ tone: 'success', text: copy.magicLinkSent(normalized) });
        track('magic_link_requested', { from: 'login' });
      } else if (res.status === 403) setMagicNotice({ tone: 'warning', text: copy.magicLinkDisabled });
      else if (res.status === 503) setMagicNotice({ tone: 'warning', text: copy.magicLinkUnavailable });
      else if (res.status === 400) setFieldErrors({ email: copy.invalidEmail });
      else if (res.status === 429) setMagicNotice({ tone: 'warning', text: resolveErrorCopy(copy, 'RATE_LIMITED', 60).body });
      else setMagicNotice({ tone: 'warning', text: resolveErrorCopy(copy, 'UNKNOWN').body });
    } catch {
      setMagicNotice({ tone: 'warning', text: copy.networkError });
    }
    setBusy(null);
  };

  const errorNotice = () => {
    if (!notice) return null;
    if (notice.kind !== 'error') return <AuthNotice tone={notice.kind}>{notice.text}</AuthNotice>;
    const { error } = notice;
    const msg = resolveErrorCopy(copy, error.code, throttle.remaining || error.retryAfterSec);
    const unverified = error.code === AUTH_ERROR.EMAIL_NOT_VERIFIED;
    return (
      <AuthNotice
        tone={isThrottleError(error) || unverified ? 'warning' : 'danger'}
        title={msg.title}
        action={
          unverified && notice.email ? (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={resend.state === 'sending'}
                disabled={resend.cooldown > 0}
                onClick={() => void resend.send({ email: notice.email })}
              >
                {resend.cooldown > 0 ? copy.resendIn(resend.cooldown) : copy.resend}
              </Button>
              {resend.state === 'sent' ? <p className="qx-small text-success">{copy.resendSent}</p> : null}
              {resend.state === 'mail_unavailable' ? <p className="qx-small text-warning">{copy.mailUnavailable}</p> : null}
              {resend.state === 'error' || resend.state === 'rate_limited' ? (
                <p className="qx-small text-warning">{copy.resendFailed}</p>
              ) : null}
            </div>
          ) : error.code === AUTH_ERROR.LOCKED ? (
            <Link href={withCallback('/auth/forgot-password')} onClick={() => rememberAuthEmail(email)} className={authLinkClass}>
              {copy.forgotPassword}
            </Link>
          ) : null
        }
      >
        {msg.body}
      </AuthNotice>
    );
  };

  const disabled = busy !== null || redirecting;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <AuthCard
        icon={qrPlace ? <MapPin className="h-6 w-6" aria-hidden /> : undefined}
        title={qrPlace ? copy.loginQrTitle(qrPlace) : copy.loginTitle}
        description={qrPlace ? copy.loginQrBody : copy.loginSubtitle}
        footer={
          !pendingCreds && features.registrationOpen !== false ? (
            <p className="qx-small text-fg-muted">
              {copy.noAccount}{' '}
              <Link href={withCallback('/auth/register')} onClick={() => rememberAuthEmail(email)} className={authLinkClass}>
                {copy.registerLink}
              </Link>
            </p>
          ) : null
        }
      >
        {staticNotice && !notice ? <AuthNotice tone="success">{staticNotice}</AuthNotice> : null}
        {errorNotice()}
        {redirecting ? <AuthNotice tone="success">{copy.redirecting}</AuthNotice> : null}

        {pendingCreds ? (
          <TwoFactorStep
            error={twoFactorError}
            attempt={twoFactorAttempt}
            submitting={busy !== null || redirecting}
            onSubmit={(code) => void submitTwoFactor(code)}
            onBack={() => {
              setPendingCreds(null);
              setTwoFactorError(null);
            }}
          />
        ) : (
          <>
            {features.google || features.github ? (
              <>
                <OAuthButtons
                  google={features.google}
                  github={features.github}
                  busy={disabled}
                  pending={busy === 'google' || busy === 'github' ? busy : null}
                  onSelect={(p) => void onOAuth(p)}
                />
                <AuthDivider label={copy.or} />
              </>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-email">{copy.emailLabel}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" aria-hidden />
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={copy.emailPlaceholder}
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={!!fieldErrors.email}
                    errorId="login-email-error"
                    maxLength={320}
                  />
                </div>
                <InlineError id="login-email-error">{fieldErrors.email}</InlineError>
              </div>

              <PasswordField
                id="login-password"
                name="password"
                label={copy.passwordLabel}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                enterKeyHint="go"
                error={fieldErrors.password}
                labelAction={
                  <Link href={withCallback('/auth/forgot-password')} onClick={() => rememberAuthEmail(email)} className={authLinkClass}>
                    {copy.forgotPassword}
                  </Link>
                }
              />

              <Button type="submit" className="w-full" loading={busy === 'password' || redirecting} disabled={disabled || throttle.remaining > 0}>
                {throttle.remaining > 0 ? copy.waitSeconds(throttle.remaining) : copy.signIn}
              </Button>
            </form>

            {features.magicLink ? (
              <div className="space-y-2 rounded-control border border-border bg-surface-0 p-4">
                <p className="qx-small text-fg-muted text-pretty">{copy.magicLinkHint}</p>
                <Button type="button" variant="outline" className="w-full" loading={busy === 'magic'} disabled={disabled} onClick={() => void sendMagicLink()}>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {copy.magicLinkButton}
                </Button>
              </div>
            ) : null}
            {magicNotice ? <AuthNotice tone={magicNotice.tone}>{magicNotice.text}</AuthNotice> : null}
          </>
        )}
      </AuthCard>

      {!pendingCreds ? (
        <>
          <DemoAccounts busy={disabled} pending={demoRole} onPick={(a) => void onDemo(a)} />
          {demoError ? <AuthNotice tone="warning">{copy.demoLoginFailed}</AuthNotice> : null}
        </>
      ) : null}
    </div>
  );
}
