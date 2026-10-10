'use client';

/**
 * Bekleyen bağlama — oturumsuz gönderilmiş yorumun puanını, giriş/kayıt sonrası hesaba
 * bağlar (Bulgu 7: "Kayıt ol ve puan kazan" vaadi artık gerçekten karşılanıyor).
 * `?claim=1` ile dönüldüyse ve bu QR'ın belirteci varsa kendiliğinden dener.
 */
import * as React from 'react';
import { CheckCircle2, Gift, Loader2 } from 'lucide-react';
import { announce } from '@/components/ds/a11y/live-region';
import { moments } from '@/lib/moments/client';
import { postClaim } from './api';
import { newIdempotencyKey, readClaims, removeClaim, type PendingClaim } from './storage';
import { btnPrimary } from './button-styles';
import type { FunnelCopy } from './copy';

type State =
  | { kind: 'idle'; claim: PendingClaim }
  | { kind: 'busy'; claim: PendingClaim }
  | { kind: 'done'; points: number }
  | { kind: 'error'; claim: PendingClaim; message: string };

export function ClaimBanner({ code, copy, auto }: { code: string; copy: FunnelCopy; auto: boolean }) {
  const [state, setState] = React.useState<State | null>(null);
  const autoTried = React.useRef(false);
  const idemKey = React.useRef<string>('');

  const run = React.useCallback(
    async (claim: PendingClaim) => {
      setState({ kind: 'busy', claim });
      if (!idemKey.current) idemKey.current = newIdempotencyKey();
      const res = await postClaim(claim.token, idemKey.current);
      if (res.ok) {
        removeClaim(claim.token);
        idemKey.current = '';
        const r = res.data.reward;
        setState({ kind: 'done', points: r.points });
        announce(copy.claimDone);
        moments.points({ points: r.points, xp: r.xp });
        moments.refresh();
        return;
      }
      // Kalıcı sonuçlar: belirteci at (süre doldu, başkası bağladı, işletme içi, geçersiz).
      const permanent =
        res.kind === 'conflict' || res.kind === 'not_found' || (res.kind === 'validation' && res.reason !== null) || res.reason === 'insider';
      if (permanent) removeClaim(claim.token);
      idemKey.current = '';
      const message =
        res.kind === 'forbidden' && res.reason !== 'insider'
          ? copy.claimNotCustomer
          : res.reason === 'expired'
            ? copy.claimExpired
            : (res.message ?? copy.claimFailed);
      setState({ kind: 'error', claim, message });
      announce(message, { politeness: 'assertive' });
    },
    [copy]
  );

  React.useEffect(() => {
    const claims = readClaims();
    const mine = claims.find((c) => c.code === code) ?? claims[claims.length - 1];
    if (!mine) return;
    setState({ kind: 'idle', claim: mine });
    if (auto && mine.code === code && !autoTried.current) {
      autoTried.current = true;
      void run(mine);
    }
    // yalnız ilk yükleme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return null;

  if (state.kind === 'done') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-card border border-success-border bg-success-subtle p-3 text-fg">
        <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success" />
        <p className="qx-small font-medium">
          {copy.claimDone} · +{state.points} {copy.points}
        </p>
      </div>
    );
  }

  const claim = state.claim;
  return (
    <section aria-labelledby="fb-pending-claim" className="rounded-card border border-brand-border bg-brand-subtle p-4">
      <p id="fb-pending-claim" className="flex items-center gap-2 qx-body font-semibold text-fg">
        <Gift aria-hidden className="h-5 w-5 shrink-0 text-brand" />
        {copy.claimPendingTitle(claim.points)}
      </p>
      <p className="mt-1 qx-small text-fg-muted">{copy.claimPendingBody(claim.venueName)}</p>
      {state.kind === 'error' && (
        <p role="alert" className="mt-2 qx-small font-medium text-danger">
          {state.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary + ' w-auto flex-1'}
          disabled={state.kind === 'busy'}
          onClick={() => void run(claim)}
        >
          {state.kind === 'busy' ? <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" /> : null}
          {state.kind === 'busy' ? copy.claiming : copy.claimAction}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-control px-4 qx-small font-medium text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => {
            removeClaim(claim.token);
            setState(null);
          }}
        >
          {copy.claimDismiss}
        </button>
      </div>
    </section>
  );
}
