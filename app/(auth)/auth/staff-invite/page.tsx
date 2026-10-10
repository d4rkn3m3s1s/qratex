'use client';

/**
 * Personel daveti kabul ekranı (P0-04 kalıcı çözüm).
 *
 * Akış: davet e-postasındaki bağlantı → önizleme (işletme, maskeli e-posta) →
 *  - hesap yoksa: ad + KENDİ şifresini belirleyip hesabını açar;
 *  - hesap varsa: giriş yapar (aynı ekrana geri döner) ve daveti KENDİSİ onaylar.
 * Bayi hiçbir aşamada şifre belirlemez ve var olan hesaba dokunamaz.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { m as Motion } from 'framer-motion';
import { Building2, CheckCircle2, Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, InlineError, SkeletonForm, TONE_CALLOUT, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';

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

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

function StaffInviteInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { data: session, status: sessionStatus } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
    setFormError(null);
    if (state.kind !== 'ready') return;
    const needsSignup = !session?.user && !state.preview.accountExists;
    if (needsSignup) {
      if (name.trim().length < 2) return setFormError('Adınızı yazın (en az 2 karakter).');
      if (password.length < 8 || !PASSWORD_RULE.test(password)) {
        return setFormError('Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.');
      }
      if (password !== confirm) return setFormError('Şifreler eşleşmiyor.');
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
      <div role="status" aria-label="Davet yükleniyor" className="w-full">
        <SkeletonForm fields={3} />
      </div>
    );
  }

  if (state.kind === 'error') {
    const terminal = ['INVITE_USED', 'INVITE_REVOKED', 'INVITE_EXPIRED', 'INVITE_NOT_FOUND'].includes(state.code ?? '');
    return (
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
    );
  }

  if (state.kind === 'done') {
    return (
      <Card className="border-border bg-surface-1">
        <CardHeader className="text-center">
          <div className={cn('mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full', TONE_CHIP.success)}>
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">Ekibe katıldınız</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            className="w-full"
            onClick={() => {
              // Rol değişti: eski oturum geçersiz → temiz giriş.
              if (session?.user) void signOut({ callbackUrl: '/auth/login?callbackUrl=%2Fstaff' });
              else void signIn(undefined, { callbackUrl: '/staff' });
            }}
          >
            <LogIn className="mr-2 h-4 w-4" aria-hidden />
            Personel olarak giriş yap
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { preview } = state;
  const signedIn = !!session?.user;
  const wrongAccount = signedIn && !preview.signedInAsInvitee;
  const needsLogin = !signedIn && preview.accountExists;
  const needsSignup = !signedIn && !preview.accountExists;
  const expires = new Date(preview.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Card className="border-border bg-surface-1">
      <CardHeader>
        <div className={cn('mb-3 flex h-12 w-12 items-center justify-center rounded-full', TONE_CHIP.brand)}>
          <Building2 className="h-6 w-6" aria-hidden />
        </div>
        <CardTitle className="text-xl">{preview.businessName} sizi ekibine davet ediyor</CardTitle>
        <CardDescription>
          Davet <span className="font-medium text-fg">{preview.emailMasked}</span> adresine gönderildi
          {preview.jobTitle ? <> · Görev: <span className="font-medium text-fg">{preview.jobTitle}</span></> : null}. Son geçerlilik: {expires}.
        </CardDescription>
      </CardHeader>

      <form onSubmit={accept} noValidate>
        <CardContent className="space-y-4">
          {wrongAccount ? (
            <div role="alert" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
              Şu an başka bir hesapla giriş yaptınız. Daveti kabul etmek için davet edilen e-posta adresinin hesabıyla
              giriş yapın.
            </div>
          ) : null}

          {needsLogin ? (
            <div className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.info)}>
              Bu e-posta ile zaten bir hesabınız var. Daveti kabul etmek için önce giriş yapın; bu sayfaya geri
              döneceksiniz.
            </div>
          ) : null}

          {signedIn && preview.signedInAsInvitee ? (
            <div className={cn('flex gap-2 rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Kabul ettiğinizde hesabınız <strong>personel hesabına</strong> dönüşür ve müşteri paneline erişiminiz
                kapanır. Şifreniz ve kişisel bilgileriniz değişmez. Kabulden sonra yeniden giriş yapmanız gerekir.
              </span>
            </div>
          ) : null}

          {needsSignup ? (
            <>
              <p className="qx-small text-fg-muted">
                Hesabınızı oluşturun. Şifrenizi yalnızca siz belirlersiniz; işletme şifrenizi göremez.
              </p>
              <div className="space-y-2">
                <Label htmlFor="invite-name">Adınız soyadınız</Label>
                <Input
                  id="invite-name"
                  autoComplete="name"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password">Şifre</Label>
                <Input
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="invite-password-hint"
                />
                <p id="invite-password-hint" className="qx-small text-fg-muted">
                  En az 8 karakter; küçük harf, büyük harf ve rakam içermeli.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-confirm">Şifre (tekrar)</Label>
                <Input
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <InlineError id="invite-form-error">{formError}</InlineError>
        </CardContent>

        <CardFooter className="flex-col gap-2">
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
              <LogIn className="mr-2 h-4 w-4" aria-hidden />
              {wrongAccount ? 'Çıkış yap ve doğru hesapla giriş yap' : 'Giriş yap'}
            </Button>
          ) : (
            <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              )}
              {needsSignup ? 'Hesabımı oluştur ve katıl' : 'Daveti kabul et'}
            </Button>
          )}
          <p className="qx-small text-center text-fg-muted">
            Bu daveti beklemiyorsanız sayfayı kapatabilirsiniz; hesabınızda hiçbir değişiklik yapılmaz.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function StaffInvitePage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Suspense
          fallback={
            <div role="status" aria-label="Davet yükleniyor">
              <SkeletonForm fields={3} />
            </div>
          }
        >
          <StaffInviteInner />
        </Suspense>
      </Motion.div>
    </div>
  );
}
