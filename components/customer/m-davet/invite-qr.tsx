'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/states';
import { useInviteCopy } from './copy';

/**
 * Yüz yüze davet QR'ı. `qrcode` kütüphanesi yalnız bu panel açılınca yüklenir (lazy);
 * görsel istemcide üretilir, sunucuya gönderilmez.
 */
export function InviteQr({ url, code }: { url: string; code: string }) {
  const { copy } = useInviteCopy();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    import('qrcode')
      .then((mod) =>
        mod.default.toDataURL(url, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'M',
          // QR her temada siyah-beyaz kalır (okunurluk); çevresi kart rengini alır.
          color: { dark: '#111111', light: '#ffffff' },
        })
      )
      .then((dataUrl) => {
        if (alive) setSrc(dataUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [url, attempt]);

  if (failed) {
    return (
      <InlineError variant="banner" onRetry={() => setAttempt((n) => n + 1)}>
        {copy.qrError}
      </InlineError>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-subtle bg-surface-2 p-card text-center sm:flex-row sm:text-left">
      <div className="grid size-44 shrink-0 place-items-center rounded-control bg-white p-2 shadow-sm">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, optimizasyon gereksiz
          <img src={src} alt={copy.qrAlt(code)} width={160} height={160} className="size-40" />
        ) : (
          <Loader2 aria-hidden className="size-6 animate-spin text-black/50 motion-reduce:animate-none" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="qx-small font-semibold text-fg">{copy.qrTitle}</p>
        <p className="qx-small text-fg-muted">{copy.qrHint}</p>
        {src && (
          <Button asChild variant="outline" className="min-h-11">
            <a href={src} download={`davet-${code}.png`}>
              <Download aria-hidden className="mr-2 size-4" />
              {copy.qrDownload}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
