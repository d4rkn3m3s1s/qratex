'use client';

import { useState, Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import { m as Motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck, Store, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { InlineError } from '@/components/states';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';
import { translateKnownMessageKey } from '@/lib/translate-known-message';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { resolvePostLoginTarget, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AUTH_ERROR, isThrottleError, parseAuthError, type ParsedAuthError } from '@/lib/auth/login-errors';
import { resolveErrorCopy, useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';
import { useCountdown, useOrigin } from '../_components/use-countdown';
import { useResendVerification } from '../_components/use-resend-verification';

type DemoRole = 'ADMIN' | 'DEALER' | 'CUSTOMER';
type DemoAccountKey = 'admin' | 'dealer' | 'customer';

// Demo hesapları proje sahibinin kararıyla KALIR (satış/deneme akışı).
const demoAccounts: Array<{
  role: DemoRole;
  email: string;
  password: string;
  icon: typeof ShieldCheck;
  accountKey: DemoAccountKey;
  color: string;
  bgColor: string;
}> = [
  {
    role: 'ADMIN',
    email: 'admin@qratex.com',
    password: 'Admin123!',
    icon: ShieldCheck,
    accountKey: 'admin',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    role: 'DEALER',
    email: 'dealer@qratex.com',
    password: 'Dealer123!',
    icon: Store,
    accountKey: 'dealer',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    role: 'CUSTOMER',
    email: 'customer@qratex.com',
    password: 'Customer123!',
    icon: User,
    accountKey: 'customer',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
];

/**
 * Giriş formu şeması. Kayıttaki şifre politikası (min 8 + karmaşıklık) girişte DAYATILMAZ:
 * politika değişmeden önce açılmış hesaplar kilitlenmesin; doğrulama sunucudadır.
 * E-posta kırpılır, sunucu ayrıca `normalizeEmail` uygular.
 */
const loginFormSchema = z.object({
  email: z.string().trim().min(1, 'validation.login.emailRequired').email('validation.login.emailInvalid'),
  password: z.string().min(1, 'validation.login.passwordRequired').max(256),
});
type LoginInput = z.infer<typeof loginFormSchema>;

type Notice =
  | { kind: 'error'; error: ParsedAuthError; email?: string }
  | { kind: 'success'; text: string }
  | { kind: 'info'; text: string };

/**
 * Giriş sonrası hedef — TEK KAYNAK `resolvePostLoginTarget` (P0-02). Ham `callbackUrl`
 * asla `window.location`'a verilmez: `javascript:`, `//evil.com`, `/\evil.com`, başka köken
 * ve başka rolün paneli reddedilir; rol ana sayfasına (STAFF → /staff dahil) düşülür.
 */
async function goToPostLoginTarget(rawCallback: string | null) {
  const session = await getSession();
  const target = resolvePostLoginTarget(rawCallback, session?.user?.role ?? null, window.location.origin);
  window.location.assign(target);
}

function LoginPageContent() {
  const t = useAppT();
  const copy = useAuthCopy();
  const searchParams = useSearchParams();
  const origin = useOrigin();
  const rawCallback = searchParams.get('callbackUrl');
  // Bağlantılar için güvenli yol (köken bilinmeden mutlak URL kabul edilmez).
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const throttle = useCountdown();
  // 2FA: şifre doğru ama 2FA gerektiriyorsa kod ekranı gösterilir.
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);
  const [authFeatures, setAuthFeatures] = useState<{ magicLink: boolean; mailConfigured: boolean; google: boolean; github: boolean } | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSending, setMagicSending] = useState(false);
  const [magicNotice, setMagicNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const resend = useResendVerification();

  const forgotPasswordHref = safeCallback
    ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(safeCallback)}`
    : '/auth/forgot-password';
  const registerHref = safeCallback ? `/auth/register?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/register';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/public/auth-features', { cache: 'no-store' });
        const data = (await res.json()) as { magicLink?: boolean; mailConfigured?: boolean; google?: boolean; github?: boolean };
        if (cancelled || !res.ok) return;
        setAuthFeatures({
          magicLink: Boolean(data.magicLink),
          mailConfigured: Boolean(data.mailConfigured),
          google: Boolean(data.google),
          github: Boolean(data.github),
        });
      } catch {
        if (!cancelled) setAuthFeatures({ magicLink: false, mailConfigured: false, google: false, github: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // URL'den gelen durum: NextAuth `?error=` (OAuth iptali, hesap bağlanamadı…) ve
  // doğrulama / şifre sıfırlama dönüşleri. Kalıcı bant olarak gösterilir (toast değil).
  useEffect(() => {
    const err = parseAuthError(searchParams.get('error'));
    if (err) {
      setNotice({ kind: 'error', error: err });
      return;
    }
    if (searchParams.get('verified') === '1') setNotice({ kind: 'success', text: copy.noticeVerified });
    else if (searchParams.get('reset') === '1') setNotice({ kind: 'success', text: copy.noticePasswordReset });
    else if (searchParams.get('registered') === 'true') setNotice({ kind: 'info', text: copy.noticeRegistered });
  }, [searchParams, copy]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginFormSchema),
  });

  const showError = (error: ParsedAuthError, email?: string) => {
    setNotice({ kind: 'error', error, email });
    if (isThrottleError(error)) throttle.start(error.retryAfterSec ?? 60);
  };

  const finishLogin = async () => {
    toast.success(t('auth.loginSuccess'), { description: t('auth.redirecting') });
    await goToPostLoginTarget(rawCallback);
  };

  const onSubmit = async (data: LoginInput) => {
    if (throttle.remaining > 0) return;
    const email = normalizeEmail(data.email);
    setIsLoading(true);
    setNotice(null);
    try {
      const result = await signIn('credentials', { email, password: data.password, redirect: false });
      const err = parseAuthError(result?.error);
      if (err?.code === AUTH_ERROR.TWO_FACTOR_REQUIRED) {
        // Şifre doğru; 2FA kodu iste. Geçici kimlik bilgileri yalnız bellekte tutulur.
        setPendingCreds({ email, password: data.password });
        setTwoFactorStep(true);
        setTwoFactorError(null);
        setIsLoading(false);
      } else if (err) {
        showError(err, email);
        setIsLoading(false);
      } else if (result?.ok) {
        await finishLogin();
      } else {
        showError({ code: 'UNKNOWN' });
        setIsLoading(false);
      }
    } catch {
      showError({ code: 'UNKNOWN' });
      setIsLoading(false);
    }
  };

  const submitTwoFactor = async () => {
    if (!pendingCreds) return;
    const code = twoFactorCode.trim();
    if (code.length < 6) {
      setTwoFactorError(copy.twoFactorCodeShort);
      return;
    }
    setIsLoading(true);
    setTwoFactorError(null);
    try {
      const result = await signIn('credentials', {
        email: pendingCreds.email,
        password: pendingCreds.password,
        twoFactorCode: code,
        redirect: false,
      });
      if (result?.ok && !result.error) {
        await finishLogin();
        return;
      }
      const err = parseAuthError(result?.error) ?? { code: 'UNKNOWN' as const };
      if (isThrottleError(err)) {
        // Kilit: 2FA adımından çık, bandı göster.
        setTwoFactorStep(false);
        setPendingCreds(null);
        showError(err);
      } else {
        setTwoFactorError(resolveErrorCopy(copy, err.code === AUTH_ERROR.INVALID_2FA ? err.code : 'UNKNOWN').body);
      }
      setTwoFactorCode('');
      setIsLoading(false);
    } catch {
      setTwoFactorError(resolveErrorCopy(copy, 'UNKNOWN').body);
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (account: (typeof demoAccounts)[number]) => {
    setValue('email', account.email);
    setValue('password', account.password);

    setIsLoading(true);
    setNotice(null);
    const label = t(`auth.demo.accounts.${account.accountKey}.label`);
    try {
      const result = await signIn('credentials', {
        email: account.email,
        password: account.password,
        redirect: false,
      });

      if (result?.error) {
        const err = parseAuthError(result.error);
        if (err?.code === AUTH_ERROR.TWO_FACTOR_REQUIRED) {
          setPendingCreds({ email: account.email, password: account.password });
          setTwoFactorStep(true);
        } else {
          toast.error(t('auth.demoLoginFailed'), { description: t('auth.demoLoginFailedDesc') });
        }
        setIsLoading(false);
      } else if (result?.ok) {
        toast.success(`${label}${t('auth.demoLoginSuccessSuffix')}`);
        await goToPostLoginTarget(rawCallback);
      }
    } catch {
      toast.error(t('auth.errorOccurred'));
      setIsLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const email = normalizeEmail(magicEmail);
    if (!email || !email.includes('@')) {
      setMagicNotice({ tone: 'warning', text: copy.invalidEmail });
      return;
    }
    setMagicSending(true);
    setMagicNotice(null);
    try {
      const payload: { email: string; callbackUrl?: string } = { email };
      if (safeCallback) payload.callbackUrl = safeCallback;
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Sunucu yanıtı hesabın varlığından bağımsızdır; ham sunucu metni gösterilmez.
      if (res.status === 403) setMagicNotice({ tone: 'warning', text: copy.magicLinkDisabled });
      else if (res.status === 503) setMagicNotice({ tone: 'warning', text: copy.magicLinkUnavailable });
      else if (res.status === 400) setMagicNotice({ tone: 'warning', text: copy.invalidEmail });
      else if (!res.ok) setMagicNotice({ tone: 'warning', text: resolveErrorCopy(copy, 'UNKNOWN').body });
      else {
        setMagicNotice({ tone: 'success', text: t('auth.magicLinkSent') });
        setMagicEmail('');
      }
    } catch {
      setMagicNotice({ tone: 'warning', text: resolveErrorCopy(copy, 'UNKNOWN').body });
    } finally {
      setMagicSending(false);
    }
  };

  const handleGoogleSignIn = () => {
    // OAuth /auth/complete'e uğrar: şifresiz (yeni) hesaba "şifre oluştur" adımı sunulur,
    // sonra asıl hedefe yönlendirir. `next` yalnız güvenli YOL olarak taşınır.
    const next = safeCallback ? `?next=${encodeURIComponent(safeCallback)}` : '';
    void signIn('google', { callbackUrl: `/auth/complete${next}` });
  };

  const renderNotice = () => {
    if (!notice) return null;
    if (notice.kind === 'success') return <AuthNotice tone="success">{notice.text}</AuthNotice>;
    if (notice.kind === 'info') return <AuthNotice tone="info">{notice.text}</AuthNotice>;
    const { error } = notice;
    const msg = resolveErrorCopy(copy, error.code, throttle.remaining || error.retryAfterSec);
    const isUnverified = error.code === AUTH_ERROR.EMAIL_NOT_VERIFIED;
    return (
      <AuthNotice
        tone={isThrottleError(error) || isUnverified ? 'warning' : 'danger'}
        title={msg.title}
        action={
          isUnverified && notice.email ? (
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
            <Link href={forgotPasswordHref} className="qx-small font-medium text-brand underline-offset-4 hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          ) : null
        }
      >
        {msg.body}
      </AuthNotice>
    );
  };

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <Card glass>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderNotice()}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('auth.demo.sectionLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((account) => {
                const label = t(`auth.demo.accounts.${account.accountKey}.label`);
                const description = t(`auth.demo.accounts.${account.accountKey}.description`);
                return (
                  <Motion.button
                    key={account.role}
                    type="button"
                    onClick={() => handleDemoLogin(account)}
                    disabled={isLoading}
                    aria-label={`${t('auth.demoLoginAriaPrefix')} ${label}`}
                    className={cn(
                      'p-3 rounded-lg border border-border/50 transition-all duration-200',
                      'hover:border-primary/50 hover:bg-accent/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'flex flex-col items-center gap-1',
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn('p-2 rounded-full', account.bgColor)}>
                      <account.icon className={cn('w-4 h-4', account.color)} />
                    </div>
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground text-center">{description}</span>
                  </Motion.button>
                );
              })}
            </div>
          </div>

          {authFeatures?.google && (<>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('auth.or')}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            aria-label={t('auth.googleLoginAria')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t('auth.googleLogin')}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('auth.orEmail')}</span>
            </div>
          </div>
          </>)}

          {twoFactorStep ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isLoading) void submitTwoFactor();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">{copy.twoFactorTitle}</Label>
                <p className="text-sm text-muted-foreground">{copy.twoFactorBody}</p>
                <Input
                  id="twoFactorCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  autoFocus
                  maxLength={32}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder={t('auth.twoFactorPlaceholder')}
                  error={!!twoFactorError}
                  errorId="two-factor-error"
                />
                <InlineError id="two-factor-error">{twoFactorError}</InlineError>
              </div>
              <Button type="submit" className="w-full" loading={isLoading}>
                {copy.twoFactorSubmit}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setTwoFactorStep(false);
                  setTwoFactorCode('');
                  setTwoFactorError(null);
                  setPendingCreds(null);
                }}
                disabled={isLoading}
              >
                {t('auth.twoFactorBack')}
              </Button>
            </form>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t('auth.emailPlaceholder')}
                  className="pl-10"
                  error={!!errors.email}
                  errorId="login-email-error"
                  {...register('email')}
                />
              </div>
              <InlineError id="login-email-error">
                {errors.email ? translateKnownMessageKey(t, errors.email.message) : null}
              </InlineError>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
                <Link href={forgotPasswordHref} className="text-sm text-primary hover:underline shrink-0">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                  error={!!errors.password}
                  errorId="login-password-error"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                </button>
              </div>
              <InlineError id="login-password-error">
                {errors.password ? translateKnownMessageKey(t, errors.password.message) : null}
              </InlineError>
            </div>

            <Button
              type="submit"
              variant="gradient"
              className="w-full"
              loading={isLoading}
              disabled={throttle.remaining > 0}
              aria-label={t('auth.loginSubmitAria')}
            >
              {throttle.remaining > 0 ? copy.waitSeconds(throttle.remaining) : t('auth.loginButton')}
            </Button>
          </form>
          )}

          {!twoFactorStep && authFeatures?.magicLink && authFeatures.mailConfigured ? (
            <div className="space-y-3 pt-1">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('auth.loginMagicLinkSection')}</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('auth.magicLinkDesc')}</p>
                <Label htmlFor="magic-email" className="sr-only">
                  {copy.magicLinkEmailLabel}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <Input
                    id="magic-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('auth.emailPlaceholder')}
                    className="sm:flex-1"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    disabled={magicSending || isLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:shrink-0"
                    loading={magicSending}
                    disabled={isLoading}
                    onClick={() => void sendMagicLink()}
                  >
                    {t('auth.magicLinkSubmit')}
                  </Button>
                </div>
                {magicNotice ? <AuthNotice tone={magicNotice.tone}>{magicNotice.text}</AuthNotice> : null}
              </div>
            </div>
          ) : null}

          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              <strong>{t('auth.demo.credentialsTitle')}</strong>
              <br />
              {t('auth.demo.credentialAdmin')}
              <br />
              {t('auth.demo.credentialDealer')}
              <br />
              {t('auth.demo.credentialCustomer')}
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link href={registerHref} className="text-primary hover:underline font-medium">
              {t('auth.registerLink')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </Motion.div>
  );
}

function LoginPageFallback() {
  const t = useAppT();
  return (
    <div className="w-full max-w-md flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
