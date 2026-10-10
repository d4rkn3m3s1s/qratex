'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Link2, MessageCircle, QrCode, Share2, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlowCard } from '@/components/ds/play';
import { announce } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { formatPoints, useInviteCopy } from './copy';
import { buildInviteUrl, buildWhatsAppUrl, copyText, shareInvite, spellCode } from './share';
import { InviteQr } from './invite-qr';

export type InviteHeroProps = {
  code: string | null;
  codeActive: boolean;
  codeState: 'ready' | 'preparing' | 'error';
  onRetryCode: () => void;
  referrerPoints: number;
  referredPoints: number;
  pendingTtlDays: number;
  siteName: string;
  /** Birincil paylaş butonunun id'si (boş liste CTA'sı odağı buraya taşır). */
  shareButtonId?: string;
};

type CopiedKey = 'link' | 'code' | null;

export function InviteHero({
  code,
  codeActive,
  codeState,
  onRetryCode,
  referrerPoints,
  referredPoints,
  pendingTtlDays,
  siteName,
  shareButtonId,
}: InviteHeroProps) {
  const { copy, locale } = useInviteCopy();
  const headingId = useId();
  const manualId = useId();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState<CopiedKey>(null);
  const [manual, setManual] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const manualRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (manual) manualRef.current?.select();
  }, [manual]);

  const you = formatPoints(referrerPoints, locale);
  const friend = formatPoints(referredPoints, locale);
  const url = code && origin ? buildInviteUrl(origin, code) : '';
  const canShare = !!url && codeActive;
  const shareText = copy.shareText(siteName, friend);

  const flash = (key: Exclude<CopiedKey, null>, message: string) => {
    setCopied(key);
    setManual(false);
    announce(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1500);
  };

  const onShare = async () => {
    if (!canShare) return;
    const outcome = await shareInvite({ title: copy.shareTitle(siteName), text: shareText, url });
    if (outcome === 'copied') flash('link', copy.linkCopied);
    else if (outcome === 'failed') {
      setManual(true);
      announce(copy.copyFailed, { politeness: 'assertive' });
    }
    // 'shared' → sistem sayfası kendi geri bildirimini verir; 'cancelled' → sessiz.
  };

  const onCopy = async (key: Exclude<CopiedKey, null>) => {
    const text = key === 'link' ? url : code;
    if (!text) return;
    if (await copyText(text)) flash(key, key === 'link' ? copy.linkCopied : copy.codeCopied);
    else {
      setManual(true);
      announce(copy.copyFailed, { politeness: 'assertive' });
    }
  };

  return (
    <GlowCard asChild className="overflow-hidden">
      <section aria-labelledby={headingId}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,hsl(var(--brand)/0.14),transparent_60%),radial-gradient(70%_60%_at_100%_100%,hsl(var(--gradient-to)/0.12),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-5">
        {/* Teklif */}
        <div>
          <h2 id={headingId} className="qx-overline flex items-center gap-1.5 text-brand">
            <Sparkles aria-hidden className="size-3.5" />
            {copy.title}
          </h2>
          <p className="sr-only">{copy.offerAria(you, friend)}</p>
          <div aria-hidden className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-control border border-brand-border/60 bg-brand-subtle px-3 py-2.5">
              <p className="qx-caption text-fg-muted">{copy.offerYou}</p>
              <p className="font-display text-2xl font-bold tabular-nums text-brand sm:text-3xl">+{you}</p>
              <p className="qx-caption text-fg-muted">{copy.pointsUnit}</p>
            </div>
            <div className="rounded-control border border-subtle bg-surface-2 px-3 py-2.5">
              <p className="qx-caption text-fg-muted">{copy.offerFriend}</p>
              <p className="font-display text-2xl font-bold tabular-nums text-fg sm:text-3xl">+{friend}</p>
              <p className="qx-caption text-fg-muted">{copy.pointsUnit}</p>
            </div>
          </div>
        </div>

        {/* Kod */}
        <div>
          <p className="qx-small mb-1.5 font-medium text-fg-muted">{copy.yourCode}</p>
          {codeState === 'error' ? (
            <InlineError variant="banner" onRetry={onRetryCode}>
              {copy.codeError}
            </InlineError>
          ) : code ? (
            <p
              aria-label={copy.codeAria(spellCode(code))}
              className="select-all rounded-control border border-dashed border-strong bg-surface-1 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-fg sm:text-3xl"
            >
              {code}
            </p>
          ) : (
            <p role="status" className="qx-small rounded-control border border-dashed border-subtle bg-surface-1 px-4 py-4 text-center text-fg-muted">
              {copy.codePreparing}
            </p>
          )}
          {code && !codeActive && (
            <InlineError variant="banner" tone="warning" className="mt-3">
              {copy.codeInactive}
            </InlineError>
          )}
        </div>

        {/* Eylemler: birincil paylaş, ikincil kopyala / WhatsApp / QR */}
        <div className="flex flex-col gap-2">
          <Button
            id={shareButtonId}
            type="button"
            size="lg"
            onClick={() => void onShare()}
            disabled={!canShare}
            className="min-h-12 w-full"
          >
            <Share2 aria-hidden className="mr-2 size-5" />
            {copy.shareLink}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => void onCopy('link')} disabled={!canShare} className="min-h-11">
              {copied === 'link' ? <Check aria-hidden className="mr-2 size-4 text-success" /> : <Link2 aria-hidden className="mr-2 size-4" />}
              {copied === 'link' ? copy.copied : copy.copyLink}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onCopy('code')} disabled={!code || !codeActive} className="min-h-11">
              {copied === 'code' ? <Check aria-hidden className="mr-2 size-4 text-success" /> : <Copy aria-hidden className="mr-2 size-4" />}
              {copied === 'code' ? copy.copied : copy.copyCode}
            </Button>
            {canShare ? (
              <Button asChild variant="outline" className="min-h-11">
                <a href={buildWhatsAppUrl(shareText, url)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="mr-2 size-4" />
                  {copy.whatsapp}
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled className="min-h-11">
                <MessageCircle aria-hidden className="mr-2 size-4" />
                {copy.whatsapp}
              </Button>
            )}
            <Button
              type="button"
              variant={qrOpen ? 'secondary' : 'outline'}
              aria-expanded={qrOpen}
              aria-controls={`${headingId}-qr`}
              onClick={() => setQrOpen((v) => !v)}
              disabled={!canShare}
              className="min-h-11"
            >
              <QrCode aria-hidden className="mr-2 size-4" />
              {qrOpen ? copy.hideQr : copy.showQr}
            </Button>
          </div>

          {manual && url && (
            <div className="mt-1 space-y-1">
              <InlineError variant="field" id={`${manualId}-hint`}>
                {copy.copyFailed}
              </InlineError>
              <label htmlFor={manualId} className="sr-only">
                {copy.manualLinkLabel}
              </label>
              <input
                id={manualId}
                ref={manualRef}
                readOnly
                value={url}
                aria-describedby={`${manualId}-hint`}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full min-h-11 rounded-control border border-strong bg-surface-1 px-3 font-mono text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </div>
          )}
        </div>

        <div id={`${headingId}-qr`} hidden={!qrOpen}>
          {qrOpen && url && code && <InviteQr url={url} code={code} />}
        </div>

        {/* Nasıl çalışır */}
        <div className="rounded-control border border-subtle bg-surface-1/70 p-4">
          <p className="qx-small mb-2 flex items-center gap-1.5 font-semibold text-fg">
            <Gift aria-hidden className="size-4 text-brand" />
            {copy.howTitle}
          </p>
          <ol className="space-y-2">
            {[copy.how1, copy.how2, copy.how3(pendingTtlDays)].map((text, i) => (
              <li key={i} className="qx-small flex items-start gap-2.5 text-fg-muted">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                    i === 2 ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-fg'
                  )}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      </section>
    </GlowCard>
  );
}
