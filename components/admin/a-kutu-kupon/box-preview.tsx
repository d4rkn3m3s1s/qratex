'use client';

import { useEffect, useRef, useState } from 'react';
import { Coins, Gift, Package, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RarityBadge } from '@/components/ds/play';
import { useMotionPolicy } from '@/lib/motion';
import { boxTier } from '@/lib/wallet-rewards/rules';
import SignatureGiftBox3D, { type BoxPhase } from '@/components/rewards/signature-gift-box-lazy';
import { fmtNumber } from './format';

/**
 * Müşterinin göreceği kutunun önizlemesi (Ödüllerim → kutu açılışı ile aynı içerik ve kademe).
 * 3B imza kutusu (three.js, ayrı chunk) OTOMATİK yüklenmez: yalnız "Açılışı oynat"a basınca
 * `next/dynamic` ile iner (§4.2: admin'de 3B yalnız müşteri içeriği önizlemesinde).
 * Azaltılmış harekette sahne oynatılmaz; içerik doğrudan gösterilir.
 */
const T_SHAKE = 900;
const T_OPEN = 700;

export function BoxPreview({ title, message, points, couponCode }: { title: string; message: string; points: number; couponCode: string | null }) {
  const policy = useMotionPolicy();
  const [play, setPlay] = useState(false);
  const [phase, setPhase] = useState<BoxPhase>('idle');
  const timers = useRef<number[]>([]);
  const tier = boxTier({ points, couponCode });

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const start = () => {
    clear();
    setPlay(true);
    setPhase('shaking');
    timers.current.push(window.setTimeout(() => setPhase('opening'), T_SHAKE));
    timers.current.push(window.setTimeout(() => setPhase('reveal'), T_SHAKE + T_OPEN));
  };

  const showContent = !play || phase === 'reveal' || phase === 'done';

  return (
    <section aria-label="Müşteri görünümü önizlemesi" className="space-y-3 rounded-card border border-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="qx-overline text-fg-muted">Müşteri böyle görecek</p>
        <RarityBadge rarity={tier} register="ops" />
      </div>

      {play && !policy.reduce ? (
        <div className="mx-auto aspect-square w-full max-w-[220px]">
          <SignatureGiftBox3D phase={phase} className="h-full w-full" />
        </div>
      ) : null}

      {showContent ? (
        <div className="space-y-3 text-center" aria-live="polite">
          <span aria-hidden className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle text-brand">
            {couponCode ? <Gift className="h-6 w-6" /> : points > 0 ? <Coins className="h-6 w-6" /> : <Package className="h-6 w-6" />}
          </span>
          <p className="qx-h4 break-words text-fg">{title.trim() || 'Başlık'}</p>
          {message.trim() ? <p className="qx-small whitespace-pre-line break-words text-fg-muted">{message.trim()}</p> : null}
          {points > 0 ? <p className="qx-num text-2xl font-semibold text-fg">+{fmtNumber(points)} puan</p> : null}
          {couponCode ? (
            <div className="rounded-control border border-dashed border-strong bg-surface-2 px-3 py-2">
              <p className="qx-caption text-fg-muted">Kupon kodun</p>
              <p className="select-all break-all font-mono text-lg font-semibold tracking-wider text-fg">{couponCode}</p>
            </div>
          ) : null}
          {points === 0 && !couponCode && !message.trim() ? <p className="qx-small text-warning">Kutu boş görünecek: puan, kupon ya da mesaj ekleyin.</p> : null}
        </div>
      ) : (
        <p className="qx-small text-center text-fg-muted" aria-live="polite">
          Kutu açılıyor…
        </p>
      )}

      <div className="flex justify-center">
        {policy.reduce ? (
          <p className="qx-caption text-center text-fg-muted">Hareket azaltma açık: açılış animasyonu oynatılmaz.</p>
        ) : (
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={start}>
            {play ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {play ? 'Yeniden oynat' : 'Açılışı 3B oynat'}
          </Button>
        )}
      </div>
    </section>
  );
}
