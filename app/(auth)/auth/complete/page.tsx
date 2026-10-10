'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Gift, Lock, Eye, EyeOff, ShieldCheck, Store } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { resolvePostLoginTarget, roleHome } from '@/lib/auth/post-login-target';
import { useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';
import { applyReferralCode, type ReferralOutcome } from '../_components/referral-outcome';

type Phase = 'checking' | 'password' | 'finishing' | 'dealer_mismatch' | 'done';

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };
const DISMISS_KEY = 'qx_pw_prompt_dismissed:';

function readDismissed(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY + userId) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(userId: string | undefined) {
  if (!userId) return;
  try {
    window.localStorage.setItem(DISMISS_KEY + userId, '1');
  } catch {
    /* gizli pencere vb. — yok say */
  }
}

/**
 * OAuth (Google/GitHub) ile giriş/kayıt sonrası ara durak.
 *  1) Şifre yoksa (yeni OAuth hesabı) → isteğe bağlı "şifre oluştur" (atlama bu cihazda hatırlanır).
 *  2) `ref` varsa davet kodunu uygular ve SONUCU dürüstçe gösterir (eskiden yanıt okunmadan
 *     her durumda "bonus eklendi" yazıyordu).
 *  3) Hedef `resolvePostLoginTarget` ile çözülür (P0-02: `next=//evil.com` / `/\evil.com`
 *     dış siteye yönlendiriyordu). İşletme niyetiyle gelip müşteri hesabına düşen kullanıcıya
 *     sessiz yönlendirme yerine açıklama gösterilir.
 */
function AuthCompleteContent() {
  const t = useAppT();
  const copy = useAuthCopy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const refCode = searchParams.get('ref')?.trim().toUpperCase() || null;
  const rawNext = searchParams.get('next');
  const role = session?.user?.role ?? null;
  const userId = session?.user?.id;

  const [phase, setPhase] = useState<Phase>('checking');
  const [provider, setProvider] = useState('Google');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState<ReferralOutcome | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  const target = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    return resolvePostLoginTarget(rawNext, role, origin);
  }, [rawNext, role]);

  // Yanıt `interpretReferralResponse` ile okunur: yalnız gerçekten işlenen ödül "eklendi" der.
  const applyReferral = useCallback(
    async (): Promise<ReferralOutcome | null> => (refCode ? applyReferralCode(refCode) : null),
    [refCode]
  );

  const finish = useCallback(async () => {
    setPhase('finishing');
    const outcome = await applyReferral();
    setReferral(outcome);
    // İşletme niyetiyle geldi ama hesap işletme değil (mevcut müşteri hesabına bağlandı).
    if (rawNext?.startsWith('/dealer') && role && role !== 'DEALER') {
      setPhase('dealer_mismatch');
      return;
    }
    setPhase('done');
    // Başarısız davet sonucunda kullanıcı metni okuyabilsin diye otomatik yönlendirme yok.
    if (outcome?.kind === 'failed') return;
    redirectTimer.current = setTimeout(() => router.replace(target()), outcome ? 1600 : 300);
  }, [applyReferral, rawNext, role, router, target]);

  // Oturum hazır olunca: şifre var mı kontrol et.
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      const back = `/auth/complete?${searchParams.toString()}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(back)}`);
      return;
    }
    if (phase !== 'checking') return;
    let cancelled = false;
    fetch('/api/auth/set-password')
      .then((r) => (r.ok ? r.json() : { hasPassword: true }))
      .then((d: { hasPassword?: boolean; providers?: string[] }) => {
        if (cancelled) return;
        const p = d?.providers?.find((x) => PROVIDER_LABEL[x]);
        if (p) setProvider(PROVIDER_LABEL[p]);
        if (d?.hasPassword === false && !readDismissed(userId)) setPhase('password');
        else void finish();
      })
      .catch(() => {
        if (!cancelled) void finish();
      });
    return () => {
      cancelled = true;
    };
  }, [status, phase, router, finish, userId, searchParams]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (password.length < 8) {
      setPwError(copy.completePasswordMin);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(typeof data.error === 'string' ? data.error : copy.completePasswordFailed);
      await finish();
    } catch (err) {
      setPwError(err instanceof Error && err.message ? err.message : copy.completePasswordFailed);
      setSaving(false);
    }
  };

  const skip = () => {
    writeDismissed(userId);
    void finish();
  };

  // ── ŞİFRE OLUŞTURMA ADIMI ──
  if (phase === 'password') {
    return (
      <form
        onSubmit={submitPassword}
        className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card border border-border bg-surface/80 p-6 shadow-sm backdrop-blur-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-subtle ring-1 ring-inset ring-brand-border">
            <ShieldCheck className="h-6 w-6 text-brand" aria-hidden />
          </div>
          <h1 className="qx-h2 text-fg">{copy.completeAccountTitle}</h1>
          <p className="qx-small text-fg-muted text-pretty">{copy.completeAccountBody(provider)}</p>
        </div>
        {/* Parola yöneticisi şifreyi doğru hesapla eşleştirsin diye gizli kullanıcı adı alanı. */}
        <input type="email" name="username" autoComplete="username" value={session?.user?.email ?? ''} readOnly hidden />
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{copy.completePasswordLabel}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="new-password"
              name="new-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={copy.completePasswordPlaceholder}
              className="pl-10 pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!pwError}
              errorId="new-password-error"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPw ? copy.hidePassword : copy.showPassword}
            >
              {showPw ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
            </button>
          </div>
          <InlineError id="new-password-error">{pwError}</InlineError>
        </div>
        <Button type="submit" loading={saving} className="w-full">
          {copy.completePasswordSave}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={saving} onClick={skip}>
          {copy.completePasswordSkip}
        </Button>
      </form>
    );
  }

  const referralNotice =
    referral?.kind === 'credited' ? (
      <AuthNotice tone="success" title={copy.completeReferralTitle(referral.points)} />
    ) : referral?.kind === 'pending' ? (
      <AuthNotice tone="info" title={copy.completeReferralPendingTitle}>
        {copy.verifyReferralPending}
      </AuthNotice>
    ) : referral?.kind === 'failed' ? (
      <AuthNotice
        tone="warning"
        title={copy.completeReferralFailedTitle}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => router.replace(target())}>
              {t('auth.completeRedirectingApp')}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/customer/referral">{copy.completeReferralLink}</Link>
            </Button>
          </div>
        }
      >
        {referral.reason ?? copy.completeReferralFailedBody}
      </AuthNotice>
    ) : null;

  if (phase === 'dealer_mismatch') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card border border-border bg-surface/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-warning-subtle ring-1 ring-inset ring-warning-border">
            <Store className="h-6 w-6 text-warning" aria-hidden />
          </div>
          <h1 className="qx-h2 text-fg">{copy.completeDealerTitle}</h1>
          <p className="qx-small text-fg-muted text-pretty">{copy.completeDealerBody}</p>
        </div>
        {referralNotice}
        <Button className="w-full" onClick={() => router.replace(roleHome(role))}>
          {copy.completeDealerContinue}
        </Button>
      </div>
    );
  }

  // ── DAVET / YÖNLENDİRME ──
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={phase !== 'done'}
      className="mx-auto flex min-h-[40vh] w-full max-w-md flex-col items-center justify-center gap-4 rounded-card border border-border bg-surface/80 p-6 shadow-sm backdrop-blur-sm"
    >
      {phase === 'done' && referralNotice ? (
        <div className="w-full space-y-3">
          {referralNotice}
          {referral?.kind !== 'failed' ? (
            <p className="qx-small text-center text-fg-muted">{t('auth.completeRedirectingApp')}</p>
          ) : null}
        </div>
      ) : (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
          <p className="text-center text-fg-muted">
            {refCode ? (
              <>
                <Gift className="mr-1 -mt-0.5 inline h-4 w-4 shrink-0 align-text-bottom text-brand" aria-hidden />
                {t('auth.completeProcessingReferral')}
              </>
            ) : (
              t('auth.completeRedirecting')
            )}
          </p>
        </>
      )}
    </div>
  );
}

function AuthCompleteFallback() {
  const t = useAppT();
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
      <span className="sr-only">{t('auth.completeLoadingSr')}</span>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteFallback />}>
      <AuthCompleteContent />
    </Suspense>
  );
}
