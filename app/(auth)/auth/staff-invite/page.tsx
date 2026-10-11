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
import { signIn, signOut, useSession } from 'next-auth/react';
import { Building2, CheckCircle2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, InlineError, SkeletonForm } from '@/components/states';
import { AuthCard } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { PasswordField, PasswordMatchHint } from '@/components/auth/p-auth/password-field';
import { validateInviteSignup, type FieldErrors } from './validate';

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
      setState({ kind: 'error', message: 'Davet bağlantısı eksik. E-postadaki bağlantıyı yeniden açın.' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/dealer/staff/invitations/accept?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setState({ kind: 'error', message: data.error || 'Davet bilgisi alınamadı.', code: data.code });
        return;
      }
      setState({ kind: 'ready', preview: data.invitation as Preview });
    } catch {
      setState({ kind: 'error', message: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.' });
    }
  }, [token]);

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
      const errs = validateInviteSignup({ name, password, confirm });
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
          setFormError(data.error || 'Devam etmek için giriş yapın.');
          return;
        }
        setFormError(data.error || 'Davet kabul edilemedi.');
        return;
      }
      setPassword('');
      setConfirm('');
      setState({ kind: 'done', message: data.message, createdAccount: !!data.createdAccount });
    } catch {
      setFormError('Bağlantı kurulamadı. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === 'loading' || sessionStatus === 'loading') {
    return (
      <div role="status" aria-label="Davet yükleniyor" className="w-full max-w-md">
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
          title={terminal ? 'Davet kullanılamıyor' : 'Davet açılamadı'}
          description={state.message}
          onRetry={terminal ? undefined : load}
          action={
            <Button variant="outline" asChild>
              <Link href="/">Ana sayfaya dön</Link>
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
        title="Ekibe katıldınız"
        description={state.message}
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
          Personel olarak giriş yap
        </Button>
      </AuthCard>
    );
  }

  const { preview } = state;
  const signedIn = !!session?.user;
  const wrongAccount = signedIn && !preview.signedInAsInvitee;
  const needsLogin = !signedIn && preview.accountExists;
  const needsSignup = !signedIn && !preview.accountExists;
  const expires = new Date(preview.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AuthCard
      icon={<Building2 className="h-6 w-6" aria-hidden />}
      title={`${preview.businessName} sizi ekibine davet ediyor`}
      description={
        <>
          Davet <span className="font-medium text-fg">{preview.emailMasked}</span> adresine gönderildi
          {preview.jobTitle ? (
            <>
              {' '}
              · Görev: <span className="font-medium text-fg">{preview.jobTitle}</span>
            </>
          ) : null}
          . Son geçerlilik: {expires}.
        </>
      }
      footer={
        <p className="qx-small text-fg-muted text-pretty">
          Bu daveti beklemiyorsanız sayfayı kapatabilirsiniz; hesabınızda hiçbir değişiklik yapılmaz.
        </p>
      }
    >
      {wrongAccount ? (
        <AuthNotice tone="warning">
          Şu an başka bir hesapla giriş yaptınız. Daveti kabul etmek için davet edilen e-posta adresinin hesabıyla giriş yapın.
        </AuthNotice>
      ) : null}

      {needsLogin ? (
        <AuthNotice tone="info">
          Bu e-posta ile zaten bir hesabınız var. Daveti kabul etmek için önce giriş yapın; bu sayfaya geri döneceksiniz.
        </AuthNotice>
      ) : null}

      {signedIn && preview.signedInAsInvitee ? (
        <AuthNotice tone="warning">
          Kabul ettiğinizde hesabınız <strong>personel hesabına</strong> dönüşür ve müşteri paneline erişiminiz kapanır.
          Şifreniz ve kişisel bilgileriniz değişmez. Kabulden sonra yeniden giriş yapmanız gerekir.
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
          {wrongAccount ? 'Çıkış yap ve doğru hesapla giriş yap' : 'Giriş yap'}
        </Button>
      ) : (
        <form onSubmit={accept} noValidate className="space-y-4">
          {needsSignup ? (
            <>
              <p className="qx-small text-fg-muted text-pretty">
                Hesabınızı oluşturun. Şifrenizi yalnızca siz belirlersiniz; işletme şifrenizi göremez.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Adınız soyadınız</Label>
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
                label="Şifre"
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
                  label="Şifre (tekrar)"
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
            {needsSignup ? 'Hesabımı oluştur ve katıl' : 'Daveti kabul et'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function StaffInvitePage() {
  // Kenar boşluğu ve ortalama kabuktan (AuthShell) gelir; giriş hareketi AuthCard'ın CSS'inde
  // (`qx-enter`, azaltılmış harekette kapalı).
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Davet yükleniyor" className="w-full max-w-md">
          <SkeletonForm fields={3} />
        </div>
      }
    >
      <StaffInviteInner />
    </Suspense>
  );
}
