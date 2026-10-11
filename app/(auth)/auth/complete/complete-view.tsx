'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Gift, Loader2, ShieldCheck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { resolvePostLoginTarget, roleHome } from '@/lib/auth/post-login-target';
import { AuthCard } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { useAuthCopy } from '@/components/auth/p-auth/copy';
import { PasswordField } from '@/components/auth/p-auth/password-field';
import { evaluatePassword } from '@/components/auth/p-auth/password-policy';
import { applyReferralCode, type ReferralOutcome } from '../_components/referral-outcome';

type Phase = 'password' | 'finishing' | 'dealer_mismatch' | 'done';

const DISMISS_KEY = 'qx_pw_prompt_dismissed:';

function readDismissed(userId: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY + userId) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(userId: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY + userId, '1');
  } catch {
    /* gizli pencere vb. — yok say */
  }
}

/**
 * OAuth sonrası ara durak (istemci adası).
 *  1) Şifre yoksa isteğe bağlı "şifre oluştur" (kayıtla aynı politika + canlı kural listesi);
 *     "şimdilik atla" bu cihazda hatırlanır.
 *  2) `ref` varsa davet kodu uygulanır ve SONUÇ dürüstçe gösterilir (yalnız gerçekten işlenen
 *     ödül "eklendi" der).
 *  3) Hedef `resolvePostLoginTarget` ile çözülür (P0-02). İşletme niyetiyle gelip mevcut müşteri
 *     hesabına bağlanan kullanıcıya sessiz yönlendirme yerine açıklama gösterilir.
 */
export function CompleteView({
  userId,
  email,
  role,
  hasPassword,
  provider,
  refCode,
  rawNext,
}: {
  userId: string;
  email: string;
  role: string | null;
  hasPassword: boolean;
  provider: string;
  refCode: string | null;
  rawNext: string | null;
}) {
  const copy = useAuthCopy();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(hasPassword ? 'finishing' : 'password');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState<ReferralOutcome | null>(null);
  const startedRef = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  const target = useCallback(
    () => resolvePostLoginTarget(rawNext, role, typeof window !== 'undefined' ? window.location.origin : null),
    [rawNext, role]
  );

  const finish = useCallback(async () => {
    setPhase('finishing');
    const outcome = refCode ? await applyReferralCode(refCode) : null;
    setReferral(outcome);
    track('oauth_completed', { provider: provider.toLowerCase(), referral: outcome?.kind ?? 'none' });
    if (rawNext?.startsWith('/dealer') && role && role !== 'DEALER') {
      setPhase('dealer_mismatch');
      return;
    }
    setPhase('done');
    // Başarısız davet sonucunda kullanıcı metni okuyabilsin diye otomatik yönlendirme yok.
    if (outcome?.kind === 'failed') return;
    redirectTimer.current = setTimeout(() => router.replace(target()), outcome ? 1600 : 0);
  }, [refCode, rawNext, role, router, target, provider]);

  // Şifre adımı gerekmiyorsa (veya bu cihazda atlandıysa) doğrudan bitir.
  useEffect(() => {
    if (startedRef.current) return;
    if (phase === 'password' && !readDismissed(userId)) return;
    startedRef.current = true;
    void finish();
  }, [phase, userId, finish]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const ev = evaluatePassword(password);
    if (ev.tooLong) return setPwError(copy.passwordTooLong);
    if (!ev.meetsPolicy) return setPwError(copy.passwordWeak);
    setPwError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string };
      if (res.ok && data.success) {
        startedRef.current = true;
        await finish();
        return;
      }
      if (data.code === 'ALREADY_SET') {
        startedRef.current = true;
        await finish();
        return;
      }
      setPwError(
        data.code === 'WEAK_PASSWORD'
          ? copy.passwordWeak
          : data.code === 'PASSWORD_TOO_LONG'
            ? copy.passwordTooLong
            : data.code === 'RATE_LIMITED'
              ? copy.resetRateLimited
              : copy.completePasswordFailed
      );
    } catch {
      setPwError(copy.networkError);
    }
    setSaving(false);
  };

  const skip = () => {
    writeDismissed(userId);
    startedRef.current = true;
    void finish();
  };

  if (phase === 'password') {
    return (
      <AuthCard
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title={copy.completeAccountTitle}
        description={copy.completeAccountBody(provider)}
      >
        <form onSubmit={submitPassword} noValidate className="space-y-4">
          {/* Parola yöneticisi şifreyi doğru hesapla eşleştirsin diye gizli kullanıcı adı alanı. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <PasswordField
            id="complete-password"
            name="new-password"
            label={copy.passwordLabel}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            error={pwError}
            showStrength
          />
          <Button type="submit" loading={saving} className="w-full">
            {copy.completePasswordSave}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={saving} onClick={skip}>
            {copy.completePasswordSkip}
          </Button>
        </form>
      </AuthCard>
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
      <AuthNotice tone="warning" title={copy.completeReferralFailedTitle}>
        {referral.reason ?? copy.completeReferralFailedBody}
      </AuthNotice>
    ) : null;

  if (phase === 'dealer_mismatch') {
    return (
      <AuthCard
        tone="warning"
        icon={<Store className="h-6 w-6" aria-hidden />}
        title={copy.completeDealerTitle}
        description={copy.completeDealerBody}
      >
        {referralNotice}
        <Button className="w-full" onClick={() => router.replace(roleHome(role))}>
          {copy.completeDealerContinue}
        </Button>
      </AuthCard>
    );
  }

  if (phase === 'done' && referral?.kind === 'failed') {
    return (
      <AuthCard tone="warning" icon={<Gift className="h-6 w-6" aria-hidden />} title={copy.completeReferralFailedTitle}>
        {referralNotice}
        <div className="grid gap-2">
          <Button className="w-full" onClick={() => router.replace(target())}>
            {copy.completeContinue}
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/customer/me/invite">{copy.completeReferralLink}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const done = phase === 'done';
  return (
    <AuthCard
      tone={done ? 'success' : 'brand'}
      icon={
        done ? (
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        )
      }
      title={done ? copy.redirecting : refCode ? copy.completeProcessingReferral : copy.completeRedirecting}
      live="polite"
    >
      {done ? referralNotice : null}
    </AuthCard>
  );
}
