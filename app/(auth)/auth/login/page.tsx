'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle, User, ShieldCheck, Store, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';
import { translateKnownMessageKey } from '@/lib/translate-known-message';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

type DemoRole = 'ADMIN' | 'DEALER' | 'CUSTOMER';
type DemoAccountKey = 'admin' | 'dealer' | 'customer';

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

function LoginPageContent() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 2FA: şifre doğru ama 2FA gerektiriyorsa kod ekranı gösterilir.
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);
  const [authFeatures, setAuthFeatures] = useState<{ magicLink: boolean; mailConfigured: boolean } | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSending, setMagicSending] = useState(false);

  const forgotPasswordHref =
    callbackUrl && callbackUrl !== '/'
      ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : '/auth/forgot-password';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/public/auth-features', { cache: 'no-store' });
        const data = (await res.json()) as { magicLink?: boolean; mailConfigured?: boolean };
        if (cancelled || !res.ok) return;
        setAuthFeatures({
          magicLink: Boolean(data.magicLink),
          mailConfigured: Boolean(data.mailConfigured),
        });
      } catch {
        if (!cancelled) setAuthFeatures({ magicLink: false, mailConfigured: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      toast.success(t('auth.registeredWelcomeToast'));
    }
  }, [searchParams, t]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const redirectAfterLogin = async () => {
    toast.success(t('auth.loginSuccess'), { description: t('auth.redirecting') });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const session = await getSession();
    const role = session?.user?.role;
    if (callbackUrl && callbackUrl !== '/') {
      window.location.href = callbackUrl;
    } else {
      const redirectUrl =
        role === 'ADMIN' ? '/admin' : role === 'DEALER' ? '/dealer' : role === 'CUSTOMER' ? '/customer' : '/';
      window.location.href = redirectUrl;
    }
  };

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error === '2FA_REQUIRED') {
        // Şifre doğru; 2FA kodu iste. Geçici kimlik bilgilerini tut (yeniden gönderim için).
        setPendingCreds({ email: data.email, password: data.password });
        setTwoFactorStep(true);
        setIsLoading(false);
      } else if (result?.error) {
        toast.error(t('auth.loginFailed'), { description: t('auth.wrongCredentials') });
        setIsLoading(false);
      } else if (result?.ok) {
        await redirectAfterLogin();
      }
    } catch {
      toast.error(t('auth.errorOccurred'), { description: t('auth.tryAgainShort') });
      setIsLoading(false);
    }
  };

  const submitTwoFactor = async () => {
    if (!pendingCreds) return;
    const code = twoFactorCode.trim();
    if (code.length < 6) {
      toast.error('6 haneli kodu veya kurtarma kodunu girin');
      return;
    }
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: pendingCreds.email,
        password: pendingCreds.password,
        twoFactorCode: code,
        redirect: false,
      });
      if (result?.ok) {
        await redirectAfterLogin();
      } else {
        toast.error('2FA kodu hatalı', { description: 'Tekrar deneyin veya kurtarma kodu kullanın.' });
        setTwoFactorCode('');
        setIsLoading(false);
      }
    } catch {
      toast.error(t('auth.errorOccurred'));
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (account: (typeof demoAccounts)[number]) => {
    setValue('email', account.email);
    setValue('password', account.password);

    setIsLoading(true);
    const label = t(`auth.demo.accounts.${account.accountKey}.label`);
    try {
      const result = await signIn('credentials', {
        email: account.email,
        password: account.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(t('auth.demoLoginFailed'), {
          description: t('auth.demoLoginFailedDesc'),
        });
        setIsLoading(false);
      } else if (result?.ok) {
        toast.success(`${label}${t('auth.demoLoginSuccessSuffix')}`);

        await new Promise((resolve) => setTimeout(resolve, 500));

        const roleRoutes = {
          ADMIN: '/admin',
          DEALER: '/dealer',
          CUSTOMER: '/customer',
        };

        window.location.href = roleRoutes[account.role];
      }
    } catch {
      toast.error(t('auth.errorOccurred'));
      setIsLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const email = magicEmail.trim().toLowerCase();
    if (!email) {
      toast.error(t('validation.login.emailRequired'));
      return;
    }
    setMagicSending(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const safeCb = safePostLoginRedirect(
        callbackUrl && callbackUrl !== '/' ? callbackUrl : undefined,
        origin
      );
      const payload: { email: string; callbackUrl?: string } = { email };
      if (safeCb) payload.callbackUrl = safeCb;

      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status === 403) {
        toast.error(t('auth.magicLinkDisabled'));
      } else if (res.status === 503) {
        toast.error(data.error || t('auth.loginMagicLinkNeedMail'));
      } else if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : t('common.error'));
      } else {
        toast.success(t('auth.magicLinkSent'));
        setMagicEmail('');
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setMagicSending(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl });
  };

  return (
    <motion.div
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('auth.demo.sectionLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((account) => {
                const label = t(`auth.demo.accounts.${account.accountKey}.label`);
                const description = t(`auth.demo.accounts.${account.accountKey}.description`);
                return (
                  <motion.button
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
                    <span className="text-[10px] text-muted-foreground text-center">{description}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

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

          {twoFactorStep ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">İki Adımlı Doğrulama</Label>
                <p className="text-sm text-muted-foreground">
                  Authenticator uygulamanızdaki 6 haneli kodu veya bir kurtarma kodunu girin.
                </p>
                <Input
                  id="twoFactorCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && submitTwoFactor()}
                  placeholder="123456 veya XXXX-XXXX"
                />
              </div>
              <Button type="button" className="w-full" onClick={submitTwoFactor} disabled={isLoading}>
                {isLoading ? t('auth.loading') : 'Doğrula ve giriş yap'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setTwoFactorStep(false);
                  setTwoFactorCode('');
                  setPendingCreds(null);
                }}
                disabled={isLoading}
              >
                Geri dön
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  className="pl-10"
                  error={!!errors.email}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.email.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
                <Link
                  href={forgotPasswordHref}
                  className="text-sm text-primary hover:underline shrink-0"
                  title={
                    authFeatures && !authFeatures.mailConfigured
                      ? t('auth.forgotPasswordMailNotConfigured')
                      : undefined
                  }
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  error={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.password.message)}
                </p>
              )}
            </div>

            <Button type="submit" variant="gradient" className="w-full" loading={isLoading} aria-label={t('auth.loginSubmitAria')}>
              {t('auth.loginButton')}
            </Button>
          </form>
          )}

          {!twoFactorStep && authFeatures?.magicLink ? (
            <div className="space-y-3 pt-1">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('auth.loginMagicLinkSection')}</span>
                </div>
              </div>
              {authFeatures.mailConfigured ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t('auth.magicLinkDesc')}</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Input
                      type="email"
                      autoComplete="email"
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
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('auth.loginMagicLinkNeedMail')}</p>
              )}
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
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              {t('auth.registerLink')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
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
