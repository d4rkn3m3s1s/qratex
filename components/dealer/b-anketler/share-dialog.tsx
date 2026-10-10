'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { announce } from '@/components/ds/a11y';
import { TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { publicSurveyUrl } from './api';
import { useSurveyCopy } from './copy';
import { canNativeShare, copyText, nativeShare, whatsappUrl } from './share';
import { SurveyQr } from './survey-qr';

export type ShareTarget = { id: string; title: string; isActive: boolean };

/**
 * Paylaşım paneli: bağlantı (yedekli kopyalama), QR (önizleme + baskı PNG), WhatsApp, cihazın
 * paylaş menüsü ve müşteri görünümü. Durdurulmuş ankette ölü bağlantı vermek yerine uyarı +
 * "Yayına al" (denetim dealer_surveys #8).
 */
export function SurveyShareDialog({
  target,
  open,
  onOpenChange,
  onPublish,
  publishing,
}: {
  target: ShareTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish?: (id: string) => void;
  publishing?: boolean;
}) {
  const { copy } = useSurveyCopy();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkId = useId();

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(canNativeShare());
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setCopyFailed(false);
    }
  }, [open]);

  const url = target && origin ? publicSurveyUrl(origin, target.id) : '';

  async function onCopy() {
    if (!url) return;
    const ok = await copyText(url);
    setCopied(ok);
    setCopyFailed(!ok);
    if (ok) {
      announce(copy.linkCopied);
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  async function onNativeShare() {
    if (!target || !url) return;
    const outcome = await nativeShare({ title: target.title, text: copy.shareText(target.title), url });
    if (outcome === 'copied') announce(copy.linkCopied);
    if (outcome === 'failed') setCopyFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.shareTitle}</DialogTitle>
          <DialogDescription>{target ? `${target.title} · ${copy.shareDescription}` : copy.shareDescription}</DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            {!target.isActive && (
              <div role="status" className={cn('flex flex-col gap-3 rounded-card border p-3 sm:flex-row sm:items-center', TONE_CALLOUT.warning)}>
                <p className="qx-small flex flex-1 items-start gap-2">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {copy.pausedShareWarning}
                </p>
                {onPublish && (
                  <Button size="sm" className="min-h-11 shrink-0" loading={publishing} onClick={() => onPublish(target.id)}>
                    {copy.publishNow}
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={linkId}>{copy.linkLabel}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={linkId}
                  ref={inputRef}
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 font-mono text-sm"
                  aria-describedby={copyFailed ? `${linkId}-err` : undefined}
                />
                <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-2" onClick={() => void onCopy()} disabled={!url}>
                  {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                  {copied ? copy.copied : copy.copyLink}
                </Button>
              </div>
              {copyFailed && (
                <p id={`${linkId}-err`} role="alert" className="qx-caption text-danger">
                  {copy.copyFailed}
                </p>
              )}
            </div>

            {url && <SurveyQr url={url} title={target.title} />}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="min-h-11 gap-2">
                <a href={url ? whatsappUrl(copy.shareText(target.title), url) : undefined} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="size-4" />
                  {copy.whatsapp}
                </a>
              </Button>
              {canShare ? (
                <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => void onNativeShare()}>
                  <Share2 aria-hidden className="size-4" />
                  {copy.nativeShare}
                </Button>
              ) : (
                <Button asChild variant="outline" className="min-h-11 gap-2">
                  <a href={url || undefined} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden className="size-4" />
                    {copy.openPreview}
                  </a>
                </Button>
              )}
            </div>
            {canShare && (
              <Button asChild variant="ghost" className="min-h-11 w-full gap-2">
                <a href={url || undefined} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden className="size-4" />
                  {copy.openPreview}
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
