'use client';

/**
 * Fişten tutar okuma — Tesseract.js tarayıcıda (sunucuya görüntü gitmez). Okunan tutar SESSİZCE
 * yazılmaz: "Fişte okunan: ₺1.250,00 · Kullan" onay çipi gösterilir; kasiyer onaylar.
 * Tesseract yalnız düğmeye basılınca indirilir.
 */
import { useRef, useState } from 'react';
import { Check, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractReceiptTotal } from '@/lib/dealer/kasa/core';
import { formatMoney } from './api';
import { useKasaCopy } from './copy';

export function ReceiptOcr({ onUse, disabled }: { onUse: (amount: number) => void; disabled?: boolean }) {
  const { copy } = useKasaCopy();
  const c = copy.kasa.ocr;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    setFound(null);
    setError(null);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(['tur', 'eng'], 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      try {
        const { data } = await worker.recognize(file);
        const amount = extractReceiptTotal(data.text || '');
        if (amount != null) setFound(amount);
        else setError(c.notFound);
      } finally {
        await worker.terminate();
      }
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        disabled={disabled || busy}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 gap-2 px-2 text-fg-muted"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Receipt className="h-4 w-4" aria-hidden />}
        {busy ? c.reading(progress) : c.button}
      </Button>
      <div aria-live="polite" className="text-sm">
        {found != null && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-border bg-info-subtle px-3 py-2 text-info">
            <span>{c.found(formatMoney(found, copy.locale))}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 gap-1"
              onClick={() => {
                onUse(found);
                setFound(null);
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
              {c.use}
            </Button>
          </div>
        )}
        {error && <p className="text-fg-muted">{error}</p>}
      </div>
    </div>
  );
}
