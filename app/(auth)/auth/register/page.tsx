'use client';

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, User, Building2, AlertCircle, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { registerSchema, type RegisterInput } from '@/lib/validations';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';
import { translateKnownMessageKey } from '@/lib/translate-known-message';

const ROLE_OPTIONS = [
  { value: 'CUSTOMER' as const, roleMsgKey: 'customer' as const, icon: User },
  { value: 'DEALER' as const, roleMsgKey: 'business' as const, icon: Building2 },
];

function interpolateAuth(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function EmailInTemplate({ template, email }: { template: string; email: string }) {
  const parts = template.split('{{email}}');
  if (parts.length !== 2) {
    return <>{template}</>;
  }
  return (
    <>
      {parts[0]}
      <strong>{email}</strong>
      {parts[1]}
    </>
  );
}

function RegisterPageFallback() {
  const t = useAppT();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useAppT();
  const refCode = useMemo(() => searchParams.get('ref')?.trim().toUpperCase() || null, [searchParams]);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'DEALER'>('CUSTOMER');
  const [verifyResult, setVerifyResult] = useState<{ verifyUrl: string; email: string; emailSent?: boolean } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'CUSTOMER',
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      const payload = { ...data } as Record<string, unknown>;
      if (refCode) payload.referralCode = refCode;
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        const errText = typeof result.error === 'string' ? result.error : '';
        toast.error(t('auth.toastRegisterFailed'), {
          description: errText ? translateKnownMessageKey(t, errText) : t('auth.toastUnknownError'),
        });
        return;
      }

      if (result.verifyUrl) {
        toast.success(t('auth.registerSuccessTitle'), {
          description: t('auth.toastVerifyHint'),
        });
        setVerifyResult({
          verifyUrl: result.verifyUrl,
          email: data.email,
          emailSent: result.emailSent === true,
        });
        return;
      }

      toast.success(t('auth.registerSuccessTitle'), {
        description: result.referralApplied ? t('auth.toastReferralBonus') : t('auth.toastCanSignIn'),
      });

      await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      router.push(selectedRole === 'DEALER' ? '/dealer' : '/customer');
      router.refresh();
    } catch {
      toast.error(t('auth.toastUnknownError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = (role: 'CUSTOMER' | 'DEALER') => {
    setSelectedRole(role);
    setValue('role', role);
  };

  const baseCallback = selectedRole === 'DEALER' ? '/dealer' : '/customer';
  const callbackWithRef = refCode
    ? `/auth/complete?ref=${encodeURIComponent(refCode)}&next=${encodeURIComponent(baseCallback)}`
    : baseCallback;

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: callbackWithRef });
  };

  const handleGitHubSignIn = () => {
    signIn('github', { callbackUrl: callbackWithRef });
  };

  if (verifyResult) {
    const templateKey = verifyResult.emailSent ? 'auth.verifySentTemplate' : 'auth.verifyDevTemplate';
    const openLabel = verifyResult.emailSent ? t('auth.verifyOpenLinkSent') : t('auth.verifyOpenLinkDev');
    const openAria = verifyResult.emailSent ? t('auth.verifyOpenLinkSentAria') : t('auth.verifyOpenLinkDevAria');

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card glass>
          <CardHeader>
            <CardTitle className="text-center">{t('auth.verifyEmailCardTitle')}</CardTitle>
            <CardDescription className="text-center">
              <EmailInTemplate template={t(templateKey)} email={verifyResult.email} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <a href={verifyResult.verifyUrl} aria-label={openAria}>
                {openLabel}
              </a>
            </Button>
            <p className="text-xs text-muted-foreground text-center">{t('auth.verifyFootnote')}</p>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setVerifyResult(null)}
              aria-label={t('auth.verifyOtherAccountAria')}
            >
              {t('auth.verifyOtherAccount')}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <Card glass>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-balance tracking-tight">{t('auth.registerTitle')}</CardTitle>
          <CardDescription className="text-pretty">
            {t('auth.registerSubtitle')}
            {refCode && (
              <span className="mt-2 flex items-center justify-center gap-1.5 text-primary">
                <Gift className="h-4 w-4 shrink-0" aria-hidden /> {t('auth.inviteBonusLine')}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('auth.accountTypeAria')}>
            {ROLE_OPTIONS.map((type) => {
              const label = t(`auth.roles.${type.roleMsgKey}.label`);
              const description = t(`auth.roles.${type.roleMsgKey}.description`);
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleRoleChange(type.value)}
                  aria-pressed={selectedRole === type.value}
                  aria-label={interpolateAuth(t('auth.accountTypeOptionAria'), { label, description })}
                  className={cn(
                    'flex min-h-[120px] touch-manipulation flex-col items-center justify-center gap-2 rounded-xl border-2 outline-none ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    selectedRole === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      'h-6 w-6 shrink-0',
                      selectedRole === type.value ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <span className={cn('font-medium', selectedRole === type.value ? 'text-primary' : '')}>{label}</span>
                  <span className="text-xs text-muted-foreground text-center">{description}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              aria-label={t('auth.googleRegisterAria')}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGitHubSignIn}
              disabled={isLoading}
              aria-label={t('auth.githubRegisterAria')}
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('auth.separatorEmailRegister')}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input type="hidden" {...register('role')} />

            <div className="space-y-2">
              <Label htmlFor="name">{t('auth.nameLabel')}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder={t('auth.namePlaceholder')}
                  className="pl-10"
                  error={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  aria-invalid={!!errors.name}
                  {...register('name')}
                />
              </div>
              {errors.name && (
                <p id="name-error" className="flex items-center gap-1 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.name.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('auth.emailPlaceholder')}
                  className="pl-10"
                  error={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="flex items-center gap-1 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.email.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  error={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 flex h-11 min-h-11 min-w-11 -translate-y-1/2 cursor-pointer touch-manipulation items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="flex items-center gap-1 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.password.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPasswordLabel')}</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="pl-10"
                  error={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && (
                <p id="confirmPassword-error" className="flex items-center gap-1 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {translateKnownMessageKey(t, errors.confirmPassword.message)}
                </p>
              )}
            </div>

            <Button type="submit" variant="gradient" className="w-full" loading={isLoading} aria-label={t('auth.registerSubmitAria')}>
              {t('auth.registerButton')}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            {t('auth.termsBefore')}
            <Link
              href="/kullanim-sartlari"
              className="rounded-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('auth.termsLink')}
            </Link>
            {t('auth.termsAnd')}
            <Link
              href="/gizlilik-politikasi"
              className="rounded-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('auth.privacyLink')}
            </Link>
            {t('auth.termsAfter')}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {t('auth.haveAccount')}{' '}
            <Link
              href="/auth/login"
              className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('auth.loginLinkCapitalized')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterPageFallback />}>
      <RegisterContent />
    </Suspense>
  );
}
