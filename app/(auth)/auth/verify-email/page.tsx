'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, Link2Off, Loader2, WifiOff, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TONE_CHIP } from '@/components/states';
import { useAuthCopy } from '../_components/auth-copy';
import { AuthNotice } from '../_components/auth-notice';
import { VerifyPending } from '../_components/verify-pending';
import { useResendVerification } from '../_components/use-resend-verification';

type View =
  | { status: 'loading' }
  | { status: 'verified' | 'already_verified' }
  | { status: 'expired'; maskedEmail: string }
  | { status: 'invalid' }
  | { status: 'network' };

/**
 * E-posta doğrulama sonucu (P0-39).
 * - Sunucu durum kodu döndürür; metin burada TR/EN çizilir.
 * - İdempotent: ikinci tıklama "zaten doğrulanmış" (başarı) olarak gösterilir.
 * - Süresi dolmuşsa tek dokunuşla yeni bağlantı (token ile, e-posta yazdırmadan).
 * - Token adres çubuğundan hemen silinir (geçmiş/analitik sızıntısı yok).
 */
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const copy = useAuthCopy();
  const tokenRef = useRef<string>(searchParams.get('token') || '');
  const startedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<View>({ status: 'loading' });
  const resend = useResendVerification();

  const run = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setView({ status: 'invalid' });
      return;
    }
    setView({ status: 'loading' });
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; maskedEmail?: string };
      if (data.status === 'verified' || data.status === 'already_verified') setView({ status: data.status });
      else if (data.status === 'expired') setView({ status: 'expired', maskedEmail: data.maskedEmail || '***' });
      else if (data.status === 'invalid') setView({ status: 'invalid' });
      else setView({ status: 'network' });
    } catch {
      setView({ status: 'network' });
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (tokenRef.current) {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void run();
  }, [run]);

  useEffect(() => {
    if (view.status !== 'loading') headingRef.current?.focus();
  }, [view.status]);

  if (view.status === 'invalid') {
    return (
      <div className="w-full max-w-md">
        <Card glass>
          <CardContent className="space-y-4 pt-6">
            <AuthNotice tone="danger" title={copy.verifyInvalidTitle}>
              {copy.verifyInvalidBody}
            </AuthNotice>
            <VerifyPending />
          </CardContent>
        </Card>
      </div>
    );
  }

  const icon =
    view.status === 'loading' ? (
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
    ) : view.status === 'verified' || view.status === 'already_verified' ? (
      <CheckCircle2 className="h-7 w-7" aria-hidden />
    ) : view.status === 'expired' ? (
      <Clock className="h-7 w-7" aria-hidden />
    ) : view.status === 'network' ? (
      <WifiOff className="h-7 w-7" aria-hidden />
    ) : (
      <Link2Off className="h-7 w-7" aria-hidden />
    );
  const tone =
    view.status === 'verified' || view.status === 'already_verified'
      ? 'success'
      : view.status === 'expired' || view.status === 'network'
        ? 'warning'
        : 'brand';

  const title =
    view.status === 'loading'
      ? copy.verifyWorking
      : view.status === 'verified'
        ? copy.verifySuccessTitle
        : view.status === 'already_verified'
          ? copy.verifyAlreadyTitle
          : view.status === 'expired'
            ? copy.verifyExpiredTitle
            : copy.verifyNetworkTitle;
  const body =
    view.status === 'verified'
      ? copy.verifySuccessBody
      : view.status === 'already_verified'
        ? copy.verifyAlreadyBody
        : view.status === 'expired'
          ? copy.verifyExpiredBody(view.maskedEmail)
          : view.status === 'network'
            ? copy.verifyNetworkBody
            : null;

  return (
    <div className="w-full max-w-md">
      <Card glass>
        <CardContent className="space-y-5 pt-6 text-center">
          <div role="status" aria-live="polite" aria-busy={view.status === 'loading'} className="flex flex-col items-center gap-3">
            <div className={cn('grid h-14 w-14 place-items-center rounded-full', TONE_CHIP[tone])}>{icon}</div>
            <h1 ref={headingRef} tabIndex={-1} className="qx-h2 text-fg outline-none">
              {title}
            </h1>
            {body ? <p className="qx-body text-fg-muted text-pretty">{body}</p> : null}
          </div>

          {view.status === 'verified' || view.status === 'already_verified' ? (
            <Button asChild className="w-full" variant="gradient">
              <Link href="/auth/login?verified=1">{copy.continueToLogin}</Link>
            </Button>
          ) : null}

          {view.status === 'expired' ? (
            <div className="space-y-3">
              <Button
                type="button"
                className="w-full gap-2"
                loading={resend.state === 'sending'}
                disabled={resend.cooldown > 0}
                onClick={() => void resend.send({ token: tokenRef.current })}
              >
                <RotateCw className="h-4 w-4" aria-hidden />
                {resend.cooldown > 0 ? copy.resendIn(resend.cooldown) : copy.resend}
              </Button>
              {resend.state === 'sent' ? <AuthNotice tone="success">{copy.resendSent}</AuthNotice> : null}
              {resend.state === 'mail_unavailable' ? <AuthNotice tone="warning">{copy.mailUnavailable}</AuthNotice> : null}
              {resend.state === 'error' || resend.state === 'rate_limited' ? (
                <AuthNotice tone="warning">{copy.resendFailed}</AuthNotice>
              ) : null}
            </div>
          ) : null}

          {view.status === 'network' ? (
            <Button type="button" className="w-full gap-2" onClick={() => void run()}>
              <RotateCw className="h-4 w-4" aria-hidden />
              {copy.tryAgain}
            </Button>
          ) : null}

          {view.status !== 'verified' && view.status !== 'already_verified' && view.status !== 'loading' ? (
            <Link
              href="/auth/login"
              className="qx-small inline-block rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.backToLogin}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function VerifyEmailLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
