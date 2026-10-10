'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Sun } from 'lucide-react';
import { FullscreenModal } from '@/components/ds/a11y';
import { useWalletCopy } from './copy';
import { QrCode } from './qr-code';

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * "Kasada göster" — tam ekran, yüksek kontrastlı kod kartı. Açıkken ekran kararmasın diye
 * Screen Wake Lock istenir (destekleyen tarayıcıda; desteklemiyorsa sessizce atlanır).
 */
export function ShowAtCounter({
  open,
  onOpenChange,
  title,
  code,
  qrValue,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Büyük punto ile okunacak kod / başvuru numarası. */
  code: string;
  /** Verilirse QR çizilir (yalnız kasada okunabilen gerçek kod için). */
  qrValue?: string | null;
  children?: ReactNode;
}) {
  const copy = useWalletCopy();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    nav.wakeLock
      ?.request('screen')
      .then((s) => {
        if (cancelled) void s.release();
        else {
          sentinel = s;
          setLocked(true);
        }
      })
      .catch(() => setLocked(false));
    return () => {
      cancelled = true;
      setLocked(false);
      void sentinel?.release().catch(() => undefined);
    };
  }, [open]);

  return (
    <FullscreenModal open={open} onOpenChange={onOpenChange} title={copy.passes.showTitle} description={copy.passes.showHint} desktop="panel">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 py-4 text-center">
        <p className="qx-h2 text-fg">{title}</p>
        {qrValue ? <QrCode value={qrValue} alt={copy.passes.qrAlt(code)} failedText={copy.passes.qrFailed} className="max-w-[18rem]" /> : null}
        <p className="select-all break-all rounded-control border-2 border-dashed border-strong bg-surface-1 px-4 py-3 font-mono text-2xl font-bold tracking-wider text-fg">
          {code}
        </p>
        {children}
        {locked && (
          <p className="qx-caption inline-flex items-center gap-1 text-fg-muted" role="status">
            <Sun aria-hidden className="size-3.5" />
            {copy.passes.wakeLockOn}
          </p>
        )}
      </div>
    </FullscreenModal>
  );
}
