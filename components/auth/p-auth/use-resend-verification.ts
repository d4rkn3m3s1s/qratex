'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ResendState = 'idle' | 'sending' | 'sent' | 'rate_limited' | 'mail_unavailable' | 'error';

/**
 * `POST /api/auth/verify-email/resend` istemcisi + geri sayım.
 * Sunucu yanıtı hesabın varlığından bağımsızdır; istemci yalnız gönderim/oran durumunu gösterir.
 */
export function useResendVerification(initialCooldownSec = 0) {
  const [state, setState] = useState<ResendState>('idle');
  const [cooldown, setCooldown] = useState(initialCooldownSec);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((sec: number) => {
    if (timer.current) clearInterval(timer.current);
    setCooldown(sec);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (initialCooldownSec > 0) startCooldown(initialCooldownSec);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [initialCooldownSec, startCooldown]);

  const send = useCallback(
    async (input: { email?: string; token?: string }) => {
      if (cooldown > 0 || state === 'sending') return;
      setState('sending');
      try {
        const res = await fetch('/api/auth/verify-email/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json().catch(() => ({}))) as { cooldownSec?: number; retryAfterSec?: number; code?: string };
        if (res.ok) {
          setState('sent');
          startCooldown(typeof data.cooldownSec === 'number' ? data.cooldownSec : 60);
        } else if (res.status === 429) {
          setState('rate_limited');
          startCooldown(typeof data.retryAfterSec === 'number' ? data.retryAfterSec : 60);
        } else if (res.status === 503) {
          setState('mail_unavailable');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    },
    [cooldown, state, startCooldown]
  );

  return { state, cooldown, send };
}
