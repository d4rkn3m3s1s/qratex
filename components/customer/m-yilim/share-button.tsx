'use client';

/**
 * Paylaşım kartı düğmesi: PNG'yi üretir, Web Share API ile paylaşır. Dosya paylaşımı olmayan
 * tarayıcıda etiket dürüstçe "Kartı kaydet" olur ve kart cihaza kaydedilir.
 * Sonuç ekran okuyucuya duyurulur (sessiz başarısızlık yok).
 */
import { useEffect, useState } from 'react';
import { Loader2, Share2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { announce } from '@/components/ds/a11y/live-region';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';
import { buildShareCardData, canShareFiles, renderYearCard, shareYearCard } from './share-card';

type Props = {
  summary: YearSummary;
  copy: YearCopy;
  /** Daha önce üretilmiş PNG (önizleme) varsa tekrar çizilmez. */
  blob?: Blob | null;
  variant?: 'default' | 'outline';
  /** Koyu zemin üstünde (durum metni açık renk). */
  onDark?: boolean;
  className?: string;
};

export function ShareCardButton({ summary, copy, blob, variant = 'default', onDark = false, className }: Props) {
  const [supportsShare, setSupportsShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setSupportsShare(canShareFiles());
  }, []);

  const label = supportsShare ? copy.shareCard : copy.saveCard;
  const periodLabel = copy.periodLabel(summary.period.year, summary.period.month);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setStatus(copy.share.working);
    try {
      const png = blob ?? (await renderYearCard(buildShareCardData(summary, copy), copy));
      const outcome = await shareYearCard(
        png,
        `qratex-yilim-${summary.period.key}.png`,
        copy.share.title(periodLabel),
        copy.share.text(periodLabel)
      );
      const msg = outcome === 'shared' ? copy.share.shared : outcome === 'downloaded' ? copy.share.downloaded : null;
      setStatus(msg);
      if (msg) announce(msg);
    } catch {
      setStatus(copy.share.failed);
      announce(copy.share.failed, { politeness: 'assertive' });
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : supportsShare ? Share2 : Download;
  return (
    <div className={cn('flex flex-col items-stretch gap-1', className)}>
      <Button type="button" onClick={onClick} aria-busy={busy} variant={variant} className="min-h-12 gap-2 px-5 text-base font-semibold">
        <Icon className={cn('size-4', busy && 'animate-spin')} aria-hidden="true" />
        {label}
      </Button>
      {status ? <p className={cn('qx-caption text-center', onDark ? 'text-white/85' : 'text-muted-foreground')}>{status}</p> : null}
    </div>
  );
}
