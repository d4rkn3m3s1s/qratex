'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { announce } from '@/components/ds/a11y';
import { inviteLinkPath } from '@/lib/squads/rules';
import { useKlanCopy } from './copy';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Davet döngüsü (Bulgu 11): kod + kopyala + paylaş (Web Share) + derin link
 * (`/customer/squads?join=KOD` → giriş sonrası dolu katılım diyaloğu) + QR (qrcode lazy).
 */
export function InviteSheet({
  open,
  onOpenChange,
  squadName,
  code,
  memberCount,
  maxMembers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  squadName: string;
  code: string;
  memberCount: number;
  maxMembers: number;
}) {
  const copy = useKlanCopy();
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const full = memberCount >= maxMembers;

  useEffect(() => {
    if (!open) return;
    const url = `${window.location.origin}${inviteLinkPath(code)}`;
    setLink(url);
    let cancelled = false;
    import('qrcode')
      .then((mod) => mod.default.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }))
      .then((data) => {
        if (!cancelled) setQr(data);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, code]);

  const doCopy = async (text: string) => {
    if (await copyText(text)) {
      toast.success(copy.copied);
      announce(copy.copied);
    } else {
      toast.error(copy.copyFailed);
    }
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const doShare = async () => {
    try {
      await navigator.share({ title: squadName, text: copy.shareText(squadName, code), url: link });
    } catch {
      /* kullanıcı vazgeçti */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:mx-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle>{copy.inviteTitle}</SheetTitle>
          <SheetDescription>{full ? copy.inviteFull : copy.inviteDesc(memberCount, maxMembers)}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-brand-border bg-brand-subtle p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{copy.inviteCode}</p>
            <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.3em] text-fg" aria-live="polite">
              {code}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => doCopy(code)}>
              <Copy className="h-4 w-4" aria-hidden /> {copy.copyCode}
            </Button>
            <Button variant="outline" onClick={() => doCopy(link)} disabled={!link}>
              <Link2 className="h-4 w-4" aria-hidden /> {copy.copyLink}
            </Button>
            {canShare ? (
              <Button onClick={doShare} disabled={!link}>
                <Share2 className="h-4 w-4" aria-hidden /> {copy.share}
              </Button>
            ) : null}
          </div>
          {qr ? (
            <figure className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI, optimizasyon gereksiz */}
              <img src={qr} alt={copy.qrAlt} width={180} height={180} className="rounded-xl bg-white p-2" />
              <figcaption className="text-xs text-fg-muted">{copy.qrHint}</figcaption>
            </figure>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
