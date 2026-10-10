'use client';

import { m as Motion } from 'framer-motion';
import { Ambient } from '@/components/ds/play';

/**
 * Efsanevi rozet folyosu — ızgarada TEK sonsuz efekt (efekt bütçesi: yaygın/nadir statik,
 * destansı ince kenar, efsanevi folyo). `<Ambient>` içinde: yalnız görünürken, sekme açıkken,
 * play kaydında ve hareket politikası izin verdiğinde akar; aksi hâlde statik kare.
 * three.js yok — CSS gradient + `mix-blend-mode`. İmleç tepkisi `--holo-x/--holo-y`
 * değişkenleriyle (ebeveyn `onPointerMove` yazar), döngü değil.
 */
const FOIL =
  'linear-gradient(115deg, transparent 20%, hsl(var(--category-4) / 0.35) 36%, hsl(var(--category-7) / 0.3) 46%, hsl(var(--category-2) / 0.28) 56%, transparent 72%)';

export function HoloFoil() {
  return (
    <>
      {/* İmleç ışığı — statik katman, yalnız değişken değişince yer değiştirir. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background:
            'radial-gradient(120px circle at var(--holo-x, 50%) var(--holo-y, 30%), hsl(var(--category-4) / 0.22), transparent 70%)',
        }}
      />
      <Ambient
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        fallback={<span className="absolute inset-0 opacity-60 mix-blend-soft-light" style={{ backgroundImage: FOIL, backgroundSize: '220% 100%', backgroundPosition: '40% 50%' }} />}
      >
        <Motion.span
          className="absolute inset-0 opacity-70 mix-blend-soft-light"
          style={{ backgroundImage: FOIL, backgroundSize: '220% 100%' }}
          initial={{ backgroundPosition: '0% 50%' }}
          animate={{ backgroundPosition: '100% 50%' }}
          transition={{ duration: 6, ease: 'linear', repeat: Infinity, repeatType: 'mirror' }}
        />
      </Ambient>
    </>
  );
}
