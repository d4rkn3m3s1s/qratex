'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const btn =
  'inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface-1 px-3.5 text-sm font-medium text-fg transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Paylaş: cihaz paylaşım menüsü (Web Share API varsa) + her zaman "Bağlantıyı kopyala".
 * Sonuç `aria-live` ile duyurulur; kopyalama başarısızsa dürüst hata metni gösterilir.
 */
export function ShareActions({ url, title, slug, className }: { url: string; title: string; slug: string; className?: string }) {
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flash = (s: 'copied' | 'error') => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2500);
  };

  const onShare = async () => {
    try {
      await navigator.share({ title, url });
      track('blog_share', { slug, method: 'native' });
    } catch {
      /* kullanıcı iptal etti — sessiz */
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      flash('copied');
      track('blog_share', { slug, method: 'copy' });
    } catch {
      flash('error');
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2 print:hidden', className)}>
      {canShare ? (
        <button type="button" className={btn} onClick={onShare}>
          <Share2 className="h-4 w-4" aria-hidden />
          Paylaş
        </button>
      ) : null}
      <button type="button" className={btn} onClick={onCopy}>
        {status === 'copied' ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {status === 'copied' ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
      </button>
      <span role="status" aria-live="polite" className={cn('text-sm', status === 'error' ? 'text-danger' : 'sr-only')}>
        {status === 'copied' ? 'Bağlantı panoya kopyalandı.' : status === 'error' ? 'Kopyalanamadı; adres çubuğundan kopyalayın.' : ''}
      </span>
    </div>
  );
}
