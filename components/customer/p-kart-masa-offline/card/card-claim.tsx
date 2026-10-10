'use client';

/**
 * Kart sahiplenme adası — "Okut, sahiplen, kutla" (rapor B6, eksik özellik 2-3).
 *
 *  - Tek birincil eylem: "Kartı benim yap" → POST /api/cards/[token]/activate.
 *  - Başarıda sayfa yeniden YÜKLENMEZ (eski akış tam ekran spinner'a düşüyordu): kart ikizi
 *    yerinde döner (CSS 3D, framer `rotateY`), arka yüzde sahibin adı belirir, tek seferlik
 *    ışıma (≤ 1,2 sn; azaltılmış harekette yalnız çapraz geçiş). Otomatik yönlendirme YOK;
 *    sonraki adımlar kullanıcıya bırakılır (Kartım, Cüzdan'a ekle, QR okut).
 *  - Konum dış sarmalayıcıda (perspektif + oran), dönüş içteki Motion elemanında (§4.2-2).
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { ArrowRight, CreditCard, ScanLine, Sparkles, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { announce } from '@/components/ds/a11y';
import { TONE_CALLOUT } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { CardTwin } from './card-twin';
import { fill, type CardCopy } from './copy';

type Phase = { type: 'idle' } | { type: 'pending' } | { type: 'error'; code: string } | { type: 'done'; cardId: string; released: boolean };

/** Kutlama bütçesi (≤ 1,2 sn): yarısı dönüş, yarısı ışıma. */
const FLIP_S = DURATION.celebrate / 2;

export function CardClaim({
  token,
  copy,
  maskedToken,
  viewerName,
  hasOtherCard,
  orphan,
  wallet,
}: {
  token: string;
  copy: CardCopy;
  maskedToken: string;
  viewerName: string | null;
  hasOtherCard: boolean;
  orphan: boolean;
  wallet: { apple: boolean; google: boolean };
}) {
  const policy = useMotionPolicy();
  const [phase, setPhase] = useState<Phase>({ type: 'idle' });
  const [platform, setPlatform] = useState<'ios' | 'other' | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState(false);
  const successRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    setPlatform(/iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'other');
    track('card_page_claim_viewed', { orphan });
  }, [orphan]);

  useEffect(() => {
    if (phase.type === 'done') {
      announce(copy.successTitle);
      // Dönüş bitince odak başlığa (ekran okuyucu yeni durumu okur).
      const id = window.setTimeout(() => successRef.current?.focus(), policy.reduce ? 0 : FLIP_S * 1000);
      return () => window.clearTimeout(id);
    }
  }, [phase.type, copy.successTitle, policy.reduce]);

  const activate = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase({ type: 'error', code: 'offline' });
      return;
    }
    setPhase({ type: 'pending' });
    track('card_activation_started', { orphan });
    let res: Response;
    try {
      res = await fetch(`/api/cards/${encodeURIComponent(token)}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
    } catch {
      setPhase({ type: 'error', code: 'offline' });
      return;
    }
    const json = (await res.json().catch(() => ({}))) as {
      code?: string;
      data?: { card?: { id?: string } };
      card?: { id?: string };
    };
    if (res.ok) {
      const cardId = json.data?.card?.id ?? json.card?.id ?? '';
      track('card_activation_completed', { orphan });
      setPhase({ type: 'done', cardId, released: orphan });
      return;
    }
    if (json.code === 'ALREADY_YOURS') {
      // Başka sekmede zaten bağlanmış: başarı gibi davran (bayat ekran kalmasın).
      setPhase({ type: 'done', cardId: '', released: false });
      return;
    }
    const code = res.status === 429 ? 'RATE_LIMITED' : res.status === 401 ? 'UNAUTHENTICATED' : (json.code ?? 'generic');
    setPhase({ type: 'error', code });
    announce(copy.errors[code] ?? copy.errors.generic, { politeness: 'assertive' });
  };

  const addToWallet = async (kind: 'apple' | 'google', cardId: string) => {
    setWalletError(false);
    if (kind === 'apple') {
      // iOS Safari pkpass'i yalnız doğrudan gezinmeyle Wallet'a açar.
      window.location.assign(`/api/wallet/apple?cardId=${encodeURIComponent(cardId)}`);
      return;
    }
    setWalletBusy(true);
    try {
      const res = await fetch(`/api/wallet/google?cardId=${encodeURIComponent(cardId)}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { saveUrl?: string; data?: { saveUrl?: string } };
      const url = body.saveUrl ?? body.data?.saveUrl;
      if (res.ok && url) window.location.assign(url);
      else setWalletError(true);
    } catch {
      setWalletError(true);
    } finally {
      setWalletBusy(false);
    }
  };

  const done = phase.type === 'done';
  const holder = viewerName?.trim() || copy.twinMember;
  const flipTransition = { duration: policy.reduce ? DURATION.fast : FLIP_S, ease: EASE.emphasized };

  return (
    <div className="flex flex-col gap-6">
      {/* Dış sarmalayıcı: oran + perspektif (konum CSS'te). */}
      <div className="relative aspect-[1.586/1] w-full" style={{ perspective: '1200px' }}>
        {policy.reduce ? (
          <>
            <Motion.div className="absolute inset-0" initial={false} animate={{ opacity: done ? 0 : 1 }} transition={flipTransition}>
              <CardTwin
                variant="claimable"
                holder={copy.twinNamePlaceholder}
                maskedToken={maskedToken}
                caption={copy.twinCaption}
                ariaLabel={fill(copy.twinAria, { masked: maskedToken })}
              />
            </Motion.div>
            <Motion.div className="absolute inset-0" initial={false} animate={{ opacity: done ? 1 : 0 }} transition={flipTransition} aria-hidden={!done}>
              <CardTwin
                variant="owner"
                holder={holder}
                maskedToken={maskedToken}
                caption={copy.twinCaption}
                ariaLabel={fill(copy.twinAria, { masked: maskedToken })}
              />
            </Motion.div>
          </>
        ) : (
          <Motion.div
            className="absolute inset-0"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ rotateY: 0, y: 12, opacity: 0 }}
            animate={{ rotateY: done ? 180 : 0, y: 0, opacity: 1 }}
            transition={done ? flipTransition : { duration: DURATION.slow, ease: EASE.emphasized }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }} aria-hidden={done}>
              <CardTwin
                variant="claimable"
                holder={copy.twinNamePlaceholder}
                maskedToken={maskedToken}
                caption={copy.twinCaption}
                ariaLabel={fill(copy.twinAria, { masked: maskedToken })}
              />
            </div>
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              aria-hidden={!done}
            >
              <CardTwin
                variant="owner"
                holder={holder}
                maskedToken={maskedToken}
                caption={copy.twinCaption}
                ariaLabel={fill(copy.twinAria, { masked: maskedToken })}
              />
            </div>
          </Motion.div>
        )}
        {done && policy.allowCelebrate && (
          // Tek seferlik ışıma (celebrate bütçesi ≤ 1,2 sn); azaltılmış harekette çizilmez.
          <Motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[22px]"
            initial={{ opacity: 0, boxShadow: '0 0 0 0 hsl(var(--brand) / 0.55)' }}
            animate={{ opacity: [0, 1, 0], boxShadow: ['0 0 0 0 hsl(var(--brand) / 0.55)', '0 0 0 18px hsl(var(--brand) / 0)', '0 0 0 18px hsl(var(--brand) / 0)'] }}
            transition={{ duration: FLIP_S, delay: FLIP_S, ease: EASE.standard }}
          />
        )}
      </div>

      {!done ? (
        <section aria-labelledby="claim-title" className="space-y-4">
          <div className="space-y-1.5">
            {viewerName && <p className="text-sm font-medium text-fg-muted">{fill(copy.claimHello, { name: viewerName })}</p>}
            <h1 id="claim-title" className="qx-h1 text-fg">
              {copy.claimTitle}
            </h1>
            <p className="text-base text-fg-muted">{orphan ? copy.claimBodyOrphan : copy.claimBody}</p>
          </div>
          {hasOtherCard && (
            <p className={cn('rounded-control border p-3 text-sm', TONE_CALLOUT.info)}>{copy.claimHasOther}</p>
          )}
          {phase.type === 'error' && (
            <p role="alert" className={cn('rounded-control border p-3 text-sm', TONE_CALLOUT.danger)}>
              {copy.errors[phase.code] ?? copy.errors.generic}
            </p>
          )}
          {phase.type === 'error' && phase.code === 'UNAUTHENTICATED' ? (
            <Button asChild size="lg" className="min-h-12 w-full">
              <Link href={`/auth/login?callbackUrl=${encodeURIComponent(`/c/${token}`)}`}>{copy.signIn}</Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full"
              onClick={() => void activate()}
              loading={phase.type === 'pending'}
              disabled={phase.type === 'error' && (phase.code === 'ALREADY_ACTIVATED' || phase.code === 'CARD_BLOCKED' || phase.code === 'CARD_NOT_FOUND')}
            >
              <CreditCard className="h-5 w-5" aria-hidden />
              {phase.type === 'error' && !['ALREADY_ACTIVATED', 'CARD_BLOCKED', 'CARD_NOT_FOUND'].includes(phase.code) ? copy.retry : copy.claimCta}
            </Button>
          )}
        </section>
      ) : (
        <Motion.section
          aria-labelledby="claim-success"
          initial={policy.reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE.standard, delay: policy.reduce ? 0 : FLIP_S }}
          className="space-y-4"
        >
          <div className="space-y-1.5" role="status">
            <h1 id="claim-success" ref={successRef} tabIndex={-1} className="qx-h1 flex items-center gap-2 text-fg outline-none">
              <Sparkles className="h-6 w-6 text-brand" aria-hidden />
              {copy.successTitle}
            </h1>
            <p className="text-base text-fg-muted">{copy.successBody}</p>
            {phase.released && <p className="text-sm text-fg-muted">{copy.successReleased}</p>}
          </div>
          <div className="rounded-card border border-border bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-fg">{copy.nextTitle}</h2>
            <div className="mt-3 flex flex-col gap-2">
              <Button asChild className="min-h-12 w-full justify-between">
                <Link href="/customer/wallet/card">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" aria-hidden />
                    {copy.nextWallet}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              {phase.cardId && platform === 'ios' && wallet.apple && (
                <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => void addToWallet('apple', phase.cardId)}>
                  <Wallet className="h-5 w-5" aria-hidden />
                  {copy.addApple}
                </Button>
              )}
              {phase.cardId && platform === 'other' && wallet.google && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full"
                  loading={walletBusy}
                  onClick={() => void addToWallet('google', phase.cardId)}
                >
                  <Wallet className="h-5 w-5" aria-hidden />
                  {copy.addGoogle}
                </Button>
              )}
              <Button asChild variant="ghost" className="min-h-12 w-full">
                <Link href="/customer/scan">
                  <ScanLine className="h-5 w-5" aria-hidden />
                  {copy.nextScan}
                </Link>
              </Button>
            </div>
            {walletError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {copy.walletFailed}
              </p>
            )}
          </div>
        </Motion.section>
      )}
    </div>
  );
}
