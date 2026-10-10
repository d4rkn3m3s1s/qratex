'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Loader2, RotateCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { AuthCard, authLinkClass } from '@/components/auth/p-auth/auth-card';
import { AuthNotice } from '@/components/auth/p-auth/auth-notice';
import { useAuthCopy } from '@/components/auth/p-auth/copy';
import { VerifyPending } from '@/components/auth/p-auth/verify-pending';
import { useResendVerification } from '@/components/auth/p-auth/use-resend-verification';

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
 * - Token adres çubuğundan hemen silinir; sonuç geldiğinde odak başlığa taşınır.
 */
export function VerifyEmailView({ token }: { token: string }) {
  const copy = useAuthCopy();
  const tokenRef = useRef(token);
  const startedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<View>({ status: token ? 'loading' : 'invalid' } as View);
  const resend = useResendVerification();

  const run = useCallback(async () => {
    if (!tokenRef.current) {
      setView({ status: 'invalid' });
      return;
    }
    setView({ status: 'loading' });
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; maskedEmail?: string };
      if (data.status === 'verified' || data.status === 'already_verified') setView({ status: data.status });
      else if (data.status === 'expired') setView({ status: 'expired', maskedEmail: data.maskedEmail || '***' });
      else if (data.status === 'invalid') setView({ status: 'invalid' });
      else setView({ status: 'network' });
      track('email_verified', { outcome: data.status ?? `http_${res.status}` });
    } catch {
      setView({ status: 'network' });
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void run();
  }, [run]);

  useEffect(() => {
    if (view.status !== 'loading') headingRef.current?.focus();
  }, [view.status]);

  const backLink = (
    <Link href="/auth/login" className={authLinkClass}>
      {copy.backToLogin}
    </Link>
  );

  if (view.status === 'invalid') {
    return (
      <VerifyPending
        notice={
          <AuthNotice tone="danger" title={copy.verifyInvalidTitle}>
            {copy.verifyInvalidBody}
          </AuthNotice>
        }
      />
    );
  }

  if (view.status === 'loading') {
    return (
      <AuthCard
        icon={<Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
        title={copy.verifyWorking}
        live="polite"
      />
    );
  }

  if (view.status === 'verified' || view.status === 'already_verified') {
    return (
      <AuthCard
        tone="success"
        icon={<CheckCircle2 className="h-6 w-6" aria-hidden />}
        title={view.status === 'verified' ? copy.verifySuccessTitle : copy.verifyAlreadyTitle}
        description={view.status === 'verified' ? copy.verifySuccessBody : copy.verifyAlreadyBody}
        headingRef={headingRef}
        live="polite"
      >
        <Button asChild className="w-full">
          <Link href="/auth/login?verified=1">{copy.continueToLogin}</Link>
        </Button>
      </AuthCard>
    );
  }

  if (view.status === 'expired') {
    return (
      <AuthCard
        tone="warning"
        icon={<Clock className="h-6 w-6" aria-hidden />}
        title={copy.verifyExpiredTitle}
        description={copy.verifyExpiredBody(view.maskedEmail)}
        headingRef={headingRef}
        footer={backLink}
      >
        <Button
          type="button"
          className="w-full"
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
      </AuthCard>
    );
  }

  return (
    <AuthCard
      tone="warning"
      icon={<WifiOff className="h-6 w-6" aria-hidden />}
      title={copy.verifyNetworkTitle}
      description={copy.verifyNetworkBody}
      headingRef={headingRef}
      footer={backLink}
    >
      <Button type="button" className="w-full" onClick={() => void run()}>
        <RotateCw className="h-4 w-4" aria-hidden />
        {copy.tryAgain}
      </Button>
    </AuthCard>
  );
}
