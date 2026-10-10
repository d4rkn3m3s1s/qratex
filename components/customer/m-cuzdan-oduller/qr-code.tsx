'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Kod için QR görüntüsü. `qrcode` paketi yalnız gerektiğinde (dinamik import) yüklenir.
 * Her temada okunabilsin diye QR beyaz zemin + siyah modül (yüksek kontrast) çizilir.
 */
export function QrCode({ value, alt, failedText, className }: { value: string; alt: string; failedText: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    import('qrcode')
      .then((mod) => (mod.default ?? mod).toDataURL(value, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
      .then((url: string) => alive && setSrc(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [value]);

  if (failed) return <p className="qx-small text-center text-fg-muted">{failedText}</p>;
  return (
    <div className={cn('aspect-square w-full max-w-[16rem] rounded-control bg-white p-3', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL, optimizasyona gerek yok
        <img src={src} alt={alt} className="h-full w-full [image-rendering:pixelated]" />
      ) : (
        <div className="h-full w-full rounded bg-surface-muted" aria-hidden />
      )}
    </div>
  );
}
