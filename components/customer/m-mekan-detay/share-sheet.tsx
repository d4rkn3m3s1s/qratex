'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, MessageCircle, Share2, Star } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { Field } from '@/components/ds/form';
import { InlineError } from '@/components/states';
import { SHARE_CAPTION_KEYS, SHARE_MOODS, type ShareCaptionKey, type ShareMood, type VenueShareLink } from '@/lib/venue-detail/types';
import { getVenueCopy, type VenueLocale } from './copy';
import { copyText } from './clipboard';

export type ShareTarget = { kind: 'feedback' | 'review'; id: string; rating: number };

type ApiEnvelope<T> = { ok?: boolean; data?: T; error?: string };

/**
 * Deneyim kartı oluşturma alt sayfası — ruh hâli + şablon not seçimi, önizleme,
 * Web Share / WhatsApp / kopyala. Serbest metin yok (denetim B2).
 */
export function ShareSheet({
  open,
  onOpenChange,
  dealerId,
  dealerName,
  target,
  locale,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  dealerName: string;
  target: ShareTarget | null;
  locale: VenueLocale;
  onCreated?: (link: VenueShareLink) => void;
}) {
  const copy = getVenueCopy(locale);
  const [mood, setMood] = useState<ShareMood>('great');
  const [captionKey, setCaptionKey] = useState<ShareCaptionKey>('recommend');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: VenueShareLink; reused: boolean } | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Hedef değişince (başka deneyim) eski link ve hata sıfırlanır (denetim B11).
  useEffect(() => {
    setResult(null);
    setError(null);
    setMood(target && target.rating >= 5 ? 'great' : 'good');
  }, [target?.kind, target?.id, target]);

  const create = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/experience-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId, experience: { kind: target.kind, id: target.id }, captionKey, mood }),
      });
      const json = (await res.json().catch(() => ({}))) as ApiEnvelope<{ link: VenueShareLink & { reused?: boolean } }>;
      if (!res.ok || !json.data?.link) throw new Error(json.error || copy.shareFailed);
      const reused = Boolean(json.data.link.reused);
      setResult({ link: json.data.link, reused });
      onCreated?.(json.data.link);
      announce(reused ? copy.shareReused : copy.shareReady);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : copy.shareFailed;
      setError(msg);
      announce(msg, { politeness: 'assertive' });
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async () => {
    if (!result) return;
    const okCopy = await copyText(result.link.url);
    if (okCopy) {
      announce(copy.shareCopied);
      setError(null);
    } else {
      linkRef.current?.focus();
      linkRef.current?.select();
      setError(copy.shareCopyFailed);
    }
  };

  const doNativeShare = async () => {
    if (!result) return;
    try {
      await navigator.share({ title: dealerName, text: copy.shareMessage(dealerName), url: result.link.url });
    } catch {
      /* kullanıcı vazgeçti */
    }
  };

  const captionText = copy.captions[captionKey];
  const whatsapp = result
    ? `https://wa.me/?text=${encodeURIComponent(`${copy.shareMessage(dealerName)} ${result.link.url}`)}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-sheet">
        <SheetHeader className="text-left">
          <SheetTitle>{copy.shareTitle}</SheetTitle>
          <SheetDescription>{copy.shareDesc}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Field label={copy.shareMood} kind="labelledby">
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={SHARE_MOODS.map((v) => ({ value: v, label: copy.moods[v] }))}
                value={mood}
                onChange={(v) => v && setMood(v)}
                disabled={busy}
              />
            )}
          </Field>
          <Field label={copy.shareCaption} kind="labelledby">
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={SHARE_CAPTION_KEYS.map((v) => ({ value: v, label: copy.captions[v] }))}
                value={captionKey}
                onChange={(v) => v && setCaptionKey(v)}
                disabled={busy}
              />
            )}
          </Field>

          <figure className="rounded-card border border-brand-border bg-brand-subtle p-4" aria-label={copy.sharePreview}>
            <figcaption className="qx-overline text-brand">{copy.sharePreview}</figcaption>
            <p className="mt-1 text-lg font-semibold text-fg">{dealerName}</p>
            <p className="mt-1 text-fg">{captionText}</p>
            {target && (
              <p className="mt-2 inline-flex items-center gap-1 text-sm text-fg-muted">
                <Star aria-hidden className="h-4 w-4 fill-current text-warning" />
                <span>{copy.ratingAria(target.rating)}</span>
                <span aria-hidden>· {copy.moods[mood]}</span>
              </p>
            )}
          </figure>

          {error && <InlineError variant="banner">{error}</InlineError>}

          {!result ? (
            <Button type="button" className="w-full gap-2" onClick={() => void create()} disabled={busy || !target}>
              {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Share2 aria-hidden className="h-4 w-4" />}
              {busy ? copy.shareCreating : copy.shareCreate}
            </Button>
          ) : (
            <div className="space-y-3" aria-live="polite">
              <p className="font-medium text-success">{result.reused ? copy.shareReused : copy.shareReady}</p>
              <label className="block">
                <span className="qx-small text-fg-muted">{copy.shareLinkLabel}</span>
                <input
                  ref={linkRef}
                  readOnly
                  value={result.link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {canNativeShare && (
                  <Button type="button" className="gap-2" onClick={() => void doNativeShare()}>
                    <Share2 aria-hidden className="h-4 w-4" />
                    {copy.shareNative}
                  </Button>
                )}
                {whatsapp && (
                  <Button asChild variant="outline" className="gap-2">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      {copy.shareWhatsApp}
                    </a>
                  </Button>
                )}
                <Button type="button" variant="outline" className="gap-2" onClick={() => void doCopy()}>
                  <Copy aria-hidden className="h-4 w-4" />
                  {copy.shareCopy}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
