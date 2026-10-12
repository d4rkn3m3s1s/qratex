'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Gift, Mail, User, UserPlus, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { track } from '@/lib/analytics';
import { translateKnownMessageKey } from '@/lib/translate-known-message';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AuthCard, AuthDivider, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { useAuthCopy } from '@/components/auth/p-auth/copy';
import { recallAuthEmail, rememberAuthEmail } from '@/components/auth/p-auth/email-handoff';
import { OAuthButtons, type OAuthProvider } from '@/components/auth/p-auth/oauth-buttons';
import { PasswordField, PasswordMatchHint } from '@/components/auth/p-auth/password-field';
import { evaluatePassword } from '@/components/auth/p-auth/password-policy';
import { RolePicker, type SignupRole } from '@/components/auth/p-auth/role-picker';
import { useCountdown } from '@/components/auth/p-auth/use-countdown';
import { useResendVerification } from '@/components/auth/p-auth/use-resend-verification';
import type { ReferralPreview } from '@/components/auth/p-auth/server-data';

// Ağır/geç gereken parçalar ilk yükten ayrılır (Lighthouse perf): doğrulama ekranı yalnız kayıttan
// sonra, zod şeması (lib/validations) yalnız gönderimde, next-auth signIn yalnız sosyal kayıtta yüklenir.
const VerifyPending = dynamic(() => import('@/components/auth/p-auth/verify-pending').then((m) => m.VerifyPending));

type Field = 'name' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, string>>;

type ServerError =
  | { kind: 'taken'; email: string }
  | { kind: 'rate'; sec: number }
  | { kind: 'closed' }
  | { kind: 'generic'; text?: string };

type VerifyState = { email: string; emailSent?: boolean; devVerifyUrl?: string | null; referralPending?: boolean };

export function RegisterView({
  rawCallback,
  refCode,
  referral,
  features,
  initialRole,
}: {
  rawCallback: string | null;
  refCode: string | null;
  referral: ReferralPreview | null;
  /** `registrationOpen: false` → yönetici yeni kayıtları kapattı; form hiç gösterilmez. */
  features: { google: boolean; github: boolean; registrationOpen?: boolean };
  initialRole: SignupRole;
}) {
  const t = useAppT();
  const copy = useAuthCopy();
  const { locale } = useAppLocale();
  const throttle = useCountdown();
  const resend = useResendVerification();

  const [role, setRole] = useState<SignupRole>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [verify, setVerify] = useState<VerifyState | null>(null);

  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const safeCallback = useMemo(() => sanitizeCallbackPath(rawCallback, origin), [rawCallback, origin]);
  const loginHref = safeCallback ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/login';
  const forgotHref = safeCallback ? `/auth/forgot-password?callbackUrl=${encodeURIComponent(safeCallback)}` : '/auth/forgot-password';

  useEffect(() => {
    const remembered = recallAuthEmail();
    if (remembered) setEmail((cur) => cur || remembered);
  }, []);

  const validate = async (): Promise<FieldErrors> => {
    const { registerSchema } = await import('@/lib/validations');
    const parsed = registerSchema.safeParse({ name: name.trim(), email: normalizeEmail(email), password, confirmPassword: confirm, role });
    if (parsed.success) return {};
    const out: FieldErrors = {};
    for (const issue of parsed.error.errors) {
      const key = issue.path[0] as Field | undefined;
      if (key && !out[key]) out[key] = translateKnownMessageKey(t, issue.message);
    }
    if (out.password) out.password = evaluatePassword(password).tooLong ? copy.passwordTooLong : out.password;
    return out;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || throttle.remaining > 0) return;
    const fieldErrors = await validate();
    setErrors(fieldErrors);
    setServerError(null);
    if (Object.keys(fieldErrors).length > 0) {
      const first = (['name', 'email', 'password', 'confirmPassword'] as Field[]).find((f) => fieldErrors[f]);
      if (first) document.getElementById(`register-${first}`)?.focus();
      return;
    }
    const normalized = normalizeEmail(email);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: normalized,
          password,
          confirmPassword: confirm,
          role,
          locale,
          ...(refCode ? { referralCode: refCode } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        field?: string;
        retryAfterSec?: number;
        emailSent?: boolean;
        verifyUrl?: string;
        referralPending?: boolean;
      };
      if (res.ok) {
        track('user_registered', { role, method: 'email', referral: !!refCode });
        setVerify({
          email: normalized,
          emailSent: typeof data.emailSent === 'boolean' ? data.emailSent : undefined,
          devVerifyUrl: typeof data.verifyUrl === 'string' ? data.verifyUrl : null,
          referralPending: data.referralPending === true,
        });
        return;
      }
      if (data.code === 'REGISTRATION_CLOSED') {
        // Sayfa açıkken yönetici kaydı kapattı: genel "beklenmeyen hata" yerine gerçek neden.
        setServerError({ kind: 'closed' });
      } else if (data.code === 'EMAIL_TAKEN' || res.status === 409) {
        setServerError({ kind: 'taken', email: normalized });
      } else if (res.status === 429) {
        const sec = typeof data.retryAfterSec === 'number' ? data.retryAfterSec : Number(res.headers.get('Retry-After')) || 60;
        throttle.start(sec);
        setServerError({ kind: 'rate', sec });
      } else if (res.status === 400 && typeof data.field === 'string' && ['name', 'email', 'password', 'confirmPassword'].includes(data.field)) {
        setErrors({ [data.field as Field]: translateKnownMessageKey(t, data.error) || copy.registerInvalid });
      } else {
        setServerError({ kind: 'generic' });
      }
      track('register_failed', { code: data.code ?? String(res.status) });
    } catch {
      setServerError({ kind: 'generic', text: copy.networkError });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * OAuth'a geçmeden hesap türü niyeti sunucuya yazılır (httpOnly, 15 dk, yalnız YENİ hesapta
   * uygulanır). İşletme seçiliyken niyet yazılamazsa OAuth BAŞLATILMAZ — aksi halde hesap
   * sessizce müşteri olarak açılırdı.
   */
  const onOAuth = async (provider: OAuthProvider) => {
    if (oauthPending || submitting) return;
    setOauthPending(provider);
    setServerError(null);
    let intentOk = false;
    try {
      const res = await fetch('/api/auth/signup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      intentOk = res.ok;
    } catch {
      intentOk = false;
    }
    if (role === 'DEALER' && !intentOk) {
      setOauthPending(null);
      setServerError({ kind: 'generic', text: copy.intentFailed });
      return;
    }
    track('register_method_selected', { method: provider, role });
    const base = safeCallback ?? (role === 'DEALER' ? '/dealer' : '/customer');
    const qs = new URLSearchParams({ next: base });
    if (refCode && role === 'CUSTOMER') qs.set('ref', refCode);
    void import('next-auth/react').then(({ signIn }) => signIn(provider, { callbackUrl: `/auth/complete?${qs.toString()}` }));
  };

  // Yönetici yeni kayıtları kapattıysa form, sosyal kayıt ve davet vaadi gösterilmez (eskiden
  // form doldurulup gönderilince genel "beklenmeyen hata", Google'da "giriş iptal edildi" çıkıyordu).
  if (features.registrationOpen === false && !verify) {
    return (
      <AuthCard
        tone="warning"
        icon={<UserX className="h-6 w-6" aria-hidden />}
        title={copy.registerClosedTitle}
        description={copy.registerClosedBody}
      >
        <Button asChild className="w-full">
          <Link href={loginHref}>{copy.signInLink}</Link>
        </Button>
      </AuthCard>
    );
  }

  if (verify) {
    return (
      <VerifyPending
        email={verify.email}
        emailSent={verify.emailSent}
        devVerifyUrl={verify.devVerifyUrl}
        referralPending={verify.referralPending}
        initialCooldownSec={verify.emailSent === false ? 0 : 60}
        backHref={loginHref}
        onBack={() => setVerify(null)}
      />
    );
  }

  const busy = submitting || oauthPending !== null;
  const inviteVisible = !!referral;

  const serverNotice = (() => {
    if (!serverError) return null;
    if (serverError.kind === 'taken') {
      return (
        <AuthNotice
          tone="warning"
          title={copy.emailTakenTitle}
          action={
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-4">
                <Link href={loginHref} onClick={() => rememberAuthEmail(serverError.email)} className={authLinkClass}>
                  {copy.signInLink}
                </Link>
                <Link href={forgotHref} onClick={() => rememberAuthEmail(serverError.email)} className={authLinkClass}>
                  {copy.forgotPassword}
                </Link>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit"
                loading={resend.state === 'sending'}
                disabled={resend.cooldown > 0}
                onClick={() => void resend.send({ email: serverError.email })}
              >
                {resend.cooldown > 0 ? copy.resendIn(resend.cooldown) : copy.resend}
              </Button>
              {resend.state === 'sent' ? <p className="qx-small text-success">{copy.resendSent}</p> : null}
              {resend.state === 'mail_unavailable' ? <p className="qx-small text-warning">{copy.mailUnavailable}</p> : null}
              {resend.state === 'error' || resend.state === 'rate_limited' ? <p className="qx-small text-warning">{copy.resendFailed}</p> : null}
            </div>
          }
        >
          {copy.emailTakenBody}
        </AuthNotice>
      );
    }
    if (serverError.kind === 'closed') {
      return (
        <AuthNotice tone="warning" title={copy.registerClosedTitle}>
          {copy.registerClosedBody}
        </AuthNotice>
      );
    }
    if (serverError.kind === 'rate') {
      return <AuthNotice tone="warning">{copy.registerRateLimited(copy.waitSeconds(throttle.remaining || serverError.sec))}</AuthNotice>;
    }
    return (
      <AuthNotice tone="danger" title={copy.registerFailedTitle}>
        {serverError.text ?? copy.registerFailedBody}
      </AuthNotice>
    );
  })();

  return (
    <AuthCard
      icon={<UserPlus className="h-6 w-6" aria-hidden />}
      title={copy.registerTitle}
      description={copy.registerSubtitle}
      footer={
        <p className="qx-small text-fg-muted">
          {copy.haveAccount}{' '}
          <Link href={loginHref} onClick={() => rememberAuthEmail(email)} className={authLinkClass}>
            {copy.signInLink}
          </Link>
        </p>
      }
    >
      {inviteVisible ? (
        <div className="flex items-start gap-3 rounded-control border border-brand-border bg-brand-subtle px-4 py-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="qx-small font-semibold text-fg">
              {referral?.inviterFirstName ? copy.inviteTitle(referral.inviterFirstName) : copy.inviteGenericTitle}
            </p>
            <p className="qx-small text-fg-muted text-pretty">
              {role === 'DEALER'
                ? copy.inviteDealerNote
                : referral?.referredPoints
                  ? copy.inviteBody(referral.referredPoints)
                  : copy.inviteBodyNoPoints}
            </p>
          </div>
        </div>
      ) : null}

      {serverNotice}

      <RolePicker value={role} onChange={setRole} disabled={busy} />

      {features.google || features.github ? (
        <>
          {role === 'DEALER' ? <p className="qx-small text-fg-muted text-pretty">{copy.dealerOAuthHint}</p> : null}
          <OAuthButtons google={features.google} github={features.github} busy={busy} pending={oauthPending} onSelect={(p) => void onOAuth(p)} />
          <AuthDivider label={copy.or} />
        </>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="register-name">{copy.nameLabel}</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              id="register-name"
              name="name"
              autoComplete="name"
              placeholder={copy.namePlaceholder}
              className="pl-10"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              error={!!errors.name}
              errorId="register-name-error"
            />
          </div>
          <InlineError id="register-name-error">{errors.name}</InlineError>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="register-email">{copy.emailLabel}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              id="register-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={copy.emailPlaceholder}
              className="pl-10"
              value={email}
              maxLength={320}
              onChange={(e) => setEmail(e.target.value)}
              error={!!errors.email}
              errorId="register-email-error"
            />
          </div>
          <InlineError id="register-email-error">{errors.email}</InlineError>
        </div>

        <PasswordField
          id="register-password"
          name="new-password"
          label={copy.passwordLabel}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={errors.password}
          showStrength
          visible={showPw}
          onVisibleChange={setShowPw}
        />

        <div className="space-y-1.5">
          <PasswordField
            id="register-confirmPassword"
            name="confirm-password"
            label={copy.confirmPasswordLabel}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={errors.confirmPassword}
            visible={showPw}
            onVisibleChange={setShowPw}
          />
          {!errors.confirmPassword ? <PasswordMatchHint password={password} confirm={confirm} /> : null}
        </div>

        <Button type="submit" className="w-full" loading={submitting} disabled={busy || throttle.remaining > 0}>
          {throttle.remaining > 0 ? copy.waitSeconds(throttle.remaining) : copy.createAccount}
        </Button>
      </form>

      <p className="qx-caption text-center text-fg-muted text-pretty">
        {copy.termsBefore}
        <Link href="/kullanim-sartlari" className="font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copy.termsLink}
        </Link>
        {copy.termsAnd}
        <Link href="/gizlilik-politikasi" className="font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copy.privacyLink}
        </Link>
        {copy.termsAfter}
      </p>
    </AuthCard>
  );
}
