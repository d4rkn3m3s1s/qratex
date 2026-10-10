'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/states';
import { exportFileSlug } from '@/lib/dealer-surveys/csv';
import { useSurveyCopy } from './copy';

/**
 * Anket QR'ı. `qrcode` kütüphanesi yalnız paylaşım paneli açılınca yüklenir (lazy); görsel
 * istemcide üretilir. QR her temada siyah-beyaz kalır (okunurluk). İndirilen PNG baskıya uygun
 * boyuttadır (1024 px).
 */
export function SurveyQr({ url, title }: { url: string; title: string }) {
  const { copy } = useSurveyCopy();
  const [preview, setPreview] = useState<string | null>(null);
  const [print, setPrint] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    import('qrcode')
      .then(async (mod) => {
        const opts = { margin: 2, errorCorrectionLevel: 'M' as const, color: { dark: '#111111', light: '#ffffff' } };
        const [small, big] = await Promise.all([
          mod.default.toDataURL(url, { ...opts, width: 320 }),
          mod.default.toDataURL(url, { ...opts, width: 1024 }),
        ]);
        if (alive) {
          setPreview(small);
          setPrint(big);
        }
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
    <div className="flex flex-col items-center gap-4 rounded-card border border-subtle bg-surface-2 p-4 text-center sm:flex-row sm:text-left">
      <div className="grid size-40 shrink-0 place-items-center rounded-control bg-white p-2 shadow-sm">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, optimizasyon gereksiz
          <img src={preview} alt={copy.qrAlt(title)} width={144} height={144} className="size-36" />
        ) : (
          <Loader2 aria-hidden className="size-6 animate-spin text-black/50 motion-reduce:animate-none" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="qx-small font-semibold text-fg">{copy.qrTitle}</p>
        <p className="qx-small text-fg-muted">{copy.qrHint}</p>
        {print && (
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <a href={print} download={`anket-qr-${exportFileSlug(title)}.png`}>
              <Download aria-hidden className="size-4" />
              {copy.qrDownload}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
