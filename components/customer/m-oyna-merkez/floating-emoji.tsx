'use client';

import { m as Motion } from 'framer-motion';
import { Ambient } from '@/components/ds/play';
import { DURATION, EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Öne çıkan kartın emojisi: play kaydında, görünürken ve hareket politikası izin verdiğinde
 * hafifçe süzülür (`<Ambient>`); aksi hâlde statik. Ekran okuyucudan gizlidir (başlık zaten
 * oyunun adını verir). Konum dış sarmalayıcıda, animasyon içteki `m.span`'de.
 */
export function FloatingEmoji({ emoji, className }: { emoji: string; className?: string }) {
  const still = <span className="inline-block">{emoji}</span>;
  return (
    <span aria-hidden className={cn('inline-grid select-none place-items-center leading-none', className)}>
      <Ambient as="span" fallback={still}>
        <Motion.span
          className="inline-block"
          animate={{ y: [0, -5] }}
          transition={{ duration: DURATION.celebrate * 2, ease: EASE.standard, repeat: Infinity, repeatType: 'mirror' }}
        >
          {emoji}
        </Motion.span>
      </Ambient>
    </span>
  );
}
