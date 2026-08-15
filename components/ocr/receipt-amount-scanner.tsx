'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Fiş/makbuz OCR — Tesseract.js (TAMAMEN ÜCRETSİZ, tarayıcıda çalışır).
 * Fotoğraftan TOPLAM tutarı okuyup forma ön-doldurur. Sunucuya resim GİTMEZ,
 * hiçbir API kotası harcanmaz, Vercel CPU'su yakılmaz.
 *
 * GÜVENLİK: yalnızca INPUT'u ön-doldurur — tutarı bayi görüp onaylar, sunucu
 * tarafındaki puan tavanı ([[points-economy-invariants]]) değişmez.
 */

interface ReceiptAmountScannerProps {
  /** OCR tutarı bulunca çağrılır (string, input'a yazılabilir formatta). */
  onAmountDetected: (amount: string) => void;
  disabled?: boolean;
}

/**
 * OCR metninden toplam tutarı çıkarır.
 * Strateji: "TOPLAM/TUTAR/GENEL TOPLAM" satırındaki sayıyı tercih et; yoksa
 * metindeki EN BÜYÜK parasal sayıyı al (fişlerde toplam genelde en büyüktür).
 */
export function extractAmountFromText(raw: string): string | null {
  if (!raw) return null;
  const text = raw.replace(/ /g, ' ');

  // 1.234,56 / 1234.56 / 1234,56 / 1,234.56 biçimlerini yakala
  const numberPattern = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;

  const toNumber = (s: string): number | null => {
    let v = s.trim().replace(/\s/g, '');
    const lastComma = v.lastIndexOf(',');
    const lastDot = v.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      // Hangisi sonda ise ondalık ayırıcıdır
      if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
      else v = v.replace(/,/g, '');
    } else if (lastComma > -1) {
      // Yalnız virgül: ondalık mı binlik mi? Son grup 1-2 hane ise ondalık.
      v = v.length - lastComma - 1 <= 2 ? v.replace(',', '.') : v.replace(/,/g, '');
    }
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  // 1) TOPLAM/TUTAR içeren satırlar (en güvenilir)
  const preferredLine = text
    .split(/\r?\n/)
    .filter((line) => /topl?am|tutar|toplam|genel|odenecek|ödenecek|total/i.test(line))
    .pop();

  if (preferredLine) {
    const matches = preferredLine.match(numberPattern);
    if (matches?.length) {
      const nums = matches.map(toNumber).filter((n): n is number => n !== null && n > 0);
      if (nums.length) return String(Math.max(...nums));
    }
  }

  // 2) Fallback: metindeki en büyük makul tutar
  const all = (text.match(numberPattern) || [])
    .map(toNumber)
    .filter((n): n is number => n !== null && n > 0 && n < 1_000_000);
  if (all.length) return String(Math.max(...all));

  return null;
}

export function ReceiptAmountScanner({ onAmountDetected, disabled }: ReceiptAmountScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      // Dinamik import: Tesseract (~ağır) yalnız kullanılınca indirilir.
      const { createWorker } = await import('tesseract.js');
      // 'tur' + 'eng': Türkçe fişler + İngilizce etiketler.
      const worker = await createWorker(['tur', 'eng'], 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      try {
        const { data } = await worker.recognize(file);
        const amount = extractAmountFromText(data.text || '');
        if (amount) {
          onAmountDetected(amount);
        } else {
          setError('Tutar okunamadı — elle girebilirsin.');
        }
      } finally {
        await worker.terminate();
      }
    } catch {
      setError('OCR başlatılamadı — elle girebilirsin.');
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        disabled={disabled || busy}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Fiş okunuyor… {progress > 0 && `%${progress}`}
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" />
            Fişten tutarı oku
          </>
        )}
      </Button>
      {busy && progress > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <X className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
