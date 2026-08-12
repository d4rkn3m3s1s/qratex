'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Gift, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * OAuth (Google/GitHub) ile giriş/kayıt sonrası callback.
 *  1) ŞİFRE YOKSA (yeni OAuth hesabı) → "şifre oluştur" adımı (opsiyonel, atlanabilir).
 *     Böylece email+şifre ile de girilebilir. Email OAuth ile zaten doğrulanmış sayılır.
 *  2) URL'de ref varsa davet kodunu uygular, sonra next'e yönlendirir.
 */
function AuthCompleteContent() {
  const t = useAppT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const refCode = searchParams.get('ref')?.trim().toUpperCase() || null;
  const nextUrl = searchParams.get('next') || '/customer';
  const safeNext = nextUrl.startsWith('/') ? nextUrl : '/customer';

  const [phase, setPhase] = useState<'checking' | 'password' | 'finishing' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Referral uygula (varsa) → yönlendir. Şifre adımından sonra çağrılır.
  const finishAndRedirect = useCallback(async () => {
    setPhase('finishing');
    if (refCode) {
      await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: refCode }),
      }).catch(() => {});
    }
    setPhase('done');
    setTimeout(() => router.replace(safeNext), refCode ? 1200 : 400);
  }, [refCode, safeNext, router]);

  // Oturum hazır olunca: şifre var mı kontrol et.
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { router.replace('/auth/login'); return; }
    if (phase !== 'checking') return;
    let cancelled = false;
    fetch('/api/auth/set-password')
      .then((r) => (r.ok ? r.json() : { hasPassword: true }))
      .then((d) => {
        if (cancelled) return;
        // Şifresi yoksa (yeni OAuth) → şifre adımını göster; varsa doğrudan bitir.
        if (d?.hasPassword === false) setPhase('password');
        else void finishAndRedirect();
      })
      .catch(() => { if (!cancelled) void finishAndRedirect(); });
    return () => { cancelled = true; };
  }, [status, phase, router, finishAndRedirect]);

  const submitPassword = async () => {
    setPwError(null);
    if (password.length < 8) { setPwError('Şifre en az 8 karakter olmalıdır'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data?.error || 'Şifre kaydedilemedi');
      await finishAndRedirect();
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Şifre kaydedilemedi');
      setSaving(false);
    }
  };

  // ── ŞİFRE OLUŞTURMA ADIMI ──
  if (phase === 'password') {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Hesabını tamamla</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Google ile giriş yaptın. İstersen bir <b>şifre</b> belirle — böylece email + şifre
            ile de giriş yapabilirsin. E-postan Google ile doğrulanmış sayılır.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Şifre</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden />
            <Input
              id="new-password"
              type={showPw ? 'text' : 'password'}
              placeholder="En az 8 karakter"
              className="pl-10 pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && submitPassword()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {pwError && <p className="text-sm text-destructive" role="alert">{pwError}</p>}
        </div>
        <Button onClick={submitPassword} loading={saving} className="w-full">Şifreyi Kaydet ve Devam Et</Button>
        <Button variant="ghost" className="w-full" disabled={saving} onClick={() => void finishAndRedirect()}>
          Şimdilik atla
        </Button>
      </div>
    );
  }

  // ── REFERRAL / YÖNLENDİRME ──
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={phase !== 'done'}
      aria-atomic="true"
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-sm backdrop-blur-sm"
    >
      {phase === 'done' && refCode ? (
        <>
          <CheckCircle2 className="h-14 w-14 text-emerald-500" aria-hidden />
          <p className="text-lg font-medium">{t('auth.completeReferralApplied')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.completeRedirectingApp')}</p>
        </>
      ) : (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
          <p className="text-center text-muted-foreground">
            {refCode ? (
              <>
                <Gift className="mr-1 -mt-0.5 inline h-4 w-4 shrink-0 align-text-bottom text-primary" aria-hidden />
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
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
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
