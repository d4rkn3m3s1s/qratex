'use client';

/**
 * Personel daveti kabul ekranı (P0-04 kalıcı çözüm).
 *
 * Akış: davet e-postasındaki bağlantı → önizleme (işletme, maskeli e-posta) →
 *  - hesap yoksa: ad + KENDİ şifresini belirleyip hesabını açar;
 *  - hesap varsa: giriş yapar (aynı ekrana geri döner) ve daveti KENDİSİ onaylar.
 * Bayi hiçbir aşamada şifre belirlemez ve var olan hesaba dokunamaz.
 *
 * Kimlik yüzeyinin ortak kiti kullanılır (AuthCard tek h1 + CSS giriş hareketi, AuthNotice,
 * PasswordField göster/gizle + canlı kural listesi): eskiden bu ekran ayrı bir shadcn kart
 * iskeleti (h3 başlık), kabuğun üstüne ikinci dolgu, framer sarmalayıcı ve kayıttan farklı
 * yerel şifre kuralı kullanıyordu; alan hataları da alana bağlı değildi.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { signOut } from '@/lib/native/sign-out';
import { Building2, CheckCircle2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, InlineError, SkeletonForm } from '@/components/states';
import { AuthCard } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { PasswordField, PasswordMatchHint } from '@/components/auth/p-auth/password-field';
import { validateInviteSignup, type FieldErrors } from './validate';
import { useFormatters, useLocaleSafe } from '@/lib/app-locale';

/** Metinler (TR/EN — mobil-erisilebilirlik-i18n B1): personelin ilk temas ekranı. */
const COPY = {
  tr: {
    missingLink: 'Davet bağlantısı eksik. E-postadaki bağlantıyı yeniden açın.',
    loadFailed: 'Davet bilgisi alınamadı.',
    network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
    loginRequired: 'Devam etmek için giriş yapın.',
    acceptFailed: 'Davet kabul edilemedi.',
    networkShort: 'Bağlantı kurulamadı. Lütfen tekrar deneyin.',
    loading: 'Davet yükleniyor',
    unusable: 'Davet kullanılamıyor',
    openFailed: 'Davet açılamadı',
    home: 'Ana sayfaya dön',
    joined: 'Ekibe katıldınız',
    joinedFallback: 'Davet kabul edildi.',
    staffLogin: 'Personel olarak giriş yap',
    inviteTitle: (business: string) => `${business} sizi ekibine davet ediyor`,
    sentTo: 'Davet',
    sentToAfter: 'adresine gönderildi',
    role: 'Görev:',
    expires: (d: string) => `. Son geçerlilik: ${d}.`,
    notExpected: 'Bu daveti beklemiyorsanız sayfayı kapatabilirsiniz; hesabınızda hiçbir değişiklik yapılmaz.',
    wrongAccount: 'Şu an başka bir hesapla giriş yaptınız. Daveti kabul etmek için davet edilen e-posta adresinin hesabıyla giriş yapın.',
    needsLogin: 'Bu e-posta ile zaten bir hesabınız var. Daveti kabul etmek için önce giriş yapın; bu sayfaya geri döneceksiniz.',
    convertBefore: 'Kabul ettiğinizde hesabınız ',
    convertStrong: 'personel hesabına',
    convertAfter:
      ' dönüşür ve müşteri paneline erişiminiz kapanır. Şifreniz ve kişisel bilgileriniz değişmez. Kabulden sonra yeniden giriş yapmanız gerekir.',
    switchAccount: 'Çıkış yap ve doğru hesapla giriş yap',
    signIn: 'Giriş yap',
    createIntro: 'Hesabınızı oluşturun. Şifrenizi yalnızca siz belirlersiniz; işletme şifrenizi göremez.',
    name: 'Adınız soyadınız',
    password: 'Şifre',
    confirm: 'Şifre (tekrar)',
    createAndJoin: 'Hesabımı oluştur ve katıl',
    accept: 'Daveti kabul et',
  },
  en: {
    missingLink: 'The invitation link is incomplete. Open the link in the email again.',
    loadFailed: 'The invitation could not be loaded.',
    network: 'Could not connect. Check your internet connection and try again.',
    loginRequired: 'Sign in to continue.',
    acceptFailed: 'The invitation could not be accepted.',
    networkShort: 'Could not connect. Please try again.',
    loading: 'Loading invitation',
    unusable: 'This invitation can no longer be used',
    openFailed: 'The invitation could not be opened',
    home: 'Back to home',
    joined: 'You joined the team',
    joinedFallback: 'The invitation was accepted.',
    staffLogin: 'Sign in as staff',
    inviteTitle: (business: string) => `${business} invites you to join their team`,
    sentTo: 'The invitation was sent to',
    sentToAfter: '',
    role: 'Role:',
    expires: (d: string) => `. Valid until ${d}.`,
    notExpected: 'If you were not expecting this invitation you can close this page; nothing changes in your account.',
    wrongAccount: 'You are signed in with a different account. To accept, sign in with the account of the invited email address.',
    needsLogin: 'You already have an account with this email. Sign in first to accept; you will come back to this page.',
    convertBefore: 'When you accept, your account becomes a ',
    convertStrong: 'staff account',
    convertAfter:
      ' and you lose access to the customer panel. Your password and personal details stay the same. You will need to sign in again after accepting.',
    switchAccount: 'Sign out and sign in with the right account',
    signIn: 'Sign in',
    createIntro: 'Create your account. Only you set your password; the business cannot see it.',
    name: 'Full name',
    password: 'Password',
    confirm: 'Password (again)',
    createAndJoin: 'Create my account and join',
    accept: 'Accept invitation',
  },
} as const;

type Preview = {
  businessName: string;
  emailMasked: string;
  jobTitle: string | null;
  expiresAt: string;
  accountExists: boolean;
  signedInAsInvitee: boolean;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; code?: string }
  | { kind: 'ready'; preview: Preview }
  | { kind: 'done'; message: string; createdAccount: boolean };

function StaffInviteInner() {
  const locale = useLocaleSafe() === 'en' ? 'en' : 'tr';
  const copy = COPY[locale];
  const fmt = useFormatters();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { data: session, status: sessionStatus } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selfHref = `/auth/staff-invite?token=${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    if (!token) {
      setState({ kind: 'error', message: copy.missingLink });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/dealer/staff/invitations/accept?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // Sunucu metni dil çerezine göre (zarf v2, lib/http/error-locale).
        setState({ kind: 'error', message: data.error || copy.loadFailed, code: data.code });
        return;
      }
      setState({ kind: 'ready', preview: data.invitation as Preview });
    } catch {
      setState({ kind: 'error', message: copy.network });
    }
  }, [token, copy]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    void load();
  }, [load, sessionStatus]);

  const accept = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (state.kind !== 'ready' || submitting) return;
    setFormError(null);
    setFieldErrors({});
    const needsSignup = !session?.user && !state.preview.accountExists;
    if (needsSignup) {
      const errs = validateInviteSignup({ name, password, confirm }, locale);
      if (errs.name || errs.password || errs.confirm) {
        setFieldErrors(errs);
        const first = errs.name ? 'invite-name' : errs.password ? 'invite-password' : 'invite-confirm';
        document.getElementById(first)?.focus();
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/dealer/staff/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsSignup ? { token, name: name.trim(), password } : { token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (data.code === 'LOGIN_REQUIRED') {
          setFormError(data.error || copy.loginRequired);
          return;
        }
        setFormError(data.error || copy.acceptFailed);
        return;
      }
      setPassword('');
      setConfirm('');
      setState({ kind: 'done', message: data.message, createdAccount: !!data.createdAccount });
    } catch {
      setFormError(copy.networkShort);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === 'loading' || sessionStatus === 'loading') {
    return (
      <div role="status" aria-label={copy.loading} className="w-full max-w-md">
        <SkeletonForm fields={3} />
      </div>
    );
  }

  if (state.kind === 'error') {
    const terminal = ['INVITE_USED', 'INVITE_REVOKED', 'INVITE_EXPIRED', 'INVITE_NOT_FOUND'].includes(state.code ?? '');
    return (
      <div className="w-full max-w-md">
        <ErrorState
          kind={terminal ? 'notFound' : 'generic'}
          title={terminal ? copy.unusable : copy.openFailed}
          description={state.message}
          onRetry={terminal ? undefined : load}
          action={
            <Button variant="outline" asChild>
              <Link href="/">{copy.home}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (state.kind === 'done') {
    return (
      <AuthCard
        tone="success"
        icon={<CheckCircle2 className="h-6 w-6" aria-hidden />}
        title={copy.joined}
        description={locale === 'tr' ? state.message || copy.joinedFallback : copy.joinedFallback}
        live="polite"
      >
        <Button
          className="w-full"
          onClick={() => {
            // Rol değişti: eski oturum geçersiz → temiz giriş.
            if (session?.user) void signOut({ callbackUrl: '/auth/login?callbackUrl=%2Fstaff' });
            else void signIn(undefined, { callbackUrl: '/staff' });
          }}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {copy.staffLogin}
        </Button>
      </AuthCard>
    );
  }

  const { preview } = state;
  const signedIn = !!session?.user;
  const wrongAccount = signedIn && !preview.signedInAsInvitee;
  const needsLogin = !signedIn && preview.accountExists;
  const needsSignup = !signedIn && !preview.accountExists;
  const expires = fmt.date(preview.expiresAt, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AuthCard
      icon={<Building2 className="h-6 w-6" aria-hidden />}
      title={copy.inviteTitle(preview.businessName)}
      description={
        <>
          {copy.sentTo} <span className="font-medium text-fg">{preview.emailMasked}</span>
          {copy.sentToAfter ? ` ${copy.sentToAfter}` : null}
          {preview.jobTitle ? (
            <>
              {' · '}
              {copy.role} <span className="font-medium text-fg">{preview.jobTitle}</span>
            </>
          ) : null}
          {copy.expires(expires)}
        </>
      }
      footer={<p className="qx-small text-fg-muted text-pretty">{copy.notExpected}</p>}
    >
      {wrongAccount ? (
        <AuthNotice tone="warning">{copy.wrongAccount}</AuthNotice>
      ) : null}

      {needsLogin ? (
        <AuthNotice tone="info">{copy.needsLogin}</AuthNotice>
      ) : null}

      {signedIn && preview.signedInAsInvitee ? (
        <AuthNotice tone="warning">
          {copy.convertBefore}
          <strong>{copy.convertStrong}</strong>
          {copy.convertAfter}
        </AuthNotice>
      ) : null}

      {formError ? <AuthNotice tone="danger">{formError}</AuthNotice> : null}

      {needsLogin || wrongAccount ? (
        <Button
          type="button"
          className="w-full"
          onClick={() =>
            wrongAccount
              ? void signOut({ callbackUrl: `/auth/login?callbackUrl=${encodeURIComponent(selfHref)}` })
              : void signIn(undefined, { callbackUrl: selfHref })
          }
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {wrongAccount ? copy.switchAccount : copy.signIn}
        </Button>
      ) : (
        <form onSubmit={accept} noValidate className="space-y-4">
          {needsSignup ? (
            <>
              <p className="qx-small text-fg-muted text-pretty">{copy.createIntro}</p>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">{copy.name}</Label>
                <Input
                  id="invite-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
                  error={!!fieldErrors.name}
                  errorId="invite-name-error"
                />
                <InlineError id="invite-name-error">{fieldErrors.name}</InlineError>
              </div>
              <PasswordField
                id="invite-password"
                name="new-password"
                label={copy.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                error={fieldErrors.password}
                showStrength
                visible={showPw}
                onVisibleChange={setShowPw}
              />
              <div className="space-y-1.5">
                <PasswordField
                  id="invite-confirm"
                  name="confirm-password"
                  label={copy.confirm}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  error={fieldErrors.confirm}
                  visible={showPw}
                  onVisibleChange={setShowPw}
                />
                {!fieldErrors.confirm ? <PasswordMatchHint password={password} confirm={confirm} /> : null}
              </div>
            </>
          ) : null}
          <Button type="submit" className="w-full" loading={submitting}>
            {!submitting ? <UserPlus className="h-4 w-4" aria-hidden /> : null}
            {needsSignup ? copy.createAndJoin : copy.accept}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

function InviteFallback() {
  const copy = COPY[useLocaleSafe() === 'en' ? 'en' : 'tr'];
  return (
    <div role="status" aria-label={copy.loading} className="w-full max-w-md">
      <SkeletonForm fields={3} />
    </div>
  );
}

export default function StaffInvitePage() {
  // Kenar boşluğu ve ortalama kabuktan (AuthShell) gelir; giriş hareketi AuthCard'ın CSS'inde
  // (`qx-enter`, azaltılmış harekette kapalı).
  return (
    <Suspense
      fallback={<InviteFallback />}
    >
      <StaffInviteInner />
    </Suspense>
  );
}
