'use client';

import { useEffect, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { DynamicBackground, type BackgroundVariant } from '@/components/ui/backgrounds';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';
import { BRAND_ACCENT_PINK_HEX, BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import {
  LANDING_SNOW_FUCHSIA_200,
  LANDING_SNOW_FUCHSIA_400,
  LANDING_SNOW_VIOLET_300,
} from '@/lib/landing-hero-colors';
import { CHART_HEX } from '@/lib/chart-palette';

/** Deterministic 0-1 value from seed (SSR/client hydration-safe) */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export type LandingBackgroundProps = {
  initialBackgroundEffect?: BackgroundVariant;
};

/**
 * LandingBackground — TÜM public sayfayı (header + main + footer) kaplayan tek
 * bütünsel hareketli arka plan. `fixed inset-0` ile scroll'dan bağımsız, sabit kalır;
 * her section/başlık/footer bunun üstünde şeffaf durur (ayrı renk/blok YOK — her yer aynı zemin).
 * Kendi içinde background efektini ve reduced-motion tercihini çeker, bu yüzden layout'ta
 * (server component) prop'suz kullanılabilir.
 */
export default function LandingBackground({ initialBackgroundEffect = 'original' }: LandingBackgroundProps) {
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundVariant>(initialBackgroundEffect);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/background', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { backgroundEffect?: unknown } | null) => {
        if (cancelled || !data) return;
        setBackgroundEffect(parseBackgroundEffectFromDb(data.backgroundEffect));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isOriginal = backgroundEffect === 'original';
  const isCustomVariant = backgroundEffect !== 'none' && backgroundEffect !== 'original';

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Admin'den seçilen özel varyant (original/none dışında) */}
      {isCustomVariant && (
        <DynamicBackground variant={backgroundEffect} fetchFromApi={false}>
          <div />
        </DynamicBackground>
      )}

      {/* Varsayılan "original" zemin: yalnızca gradient-mesh.
          Örtücü dikey gradyan KALDIRILDI (aksi halde sayfanın altını karartıp
          orb'ları gizliyordu). Metin okunabilirliği için hafif zemin globals'taki
          body arka planından gelir; orb'lar bunun üstünde tüm sayfada görünür. */}
      {(isOriginal || backgroundEffect === 'none') && (
        <div className="absolute inset-0 gradient-mesh opacity-[0.40]" />
      )}

      {/* Hareketli katman (yalnızca original + hareket açıkken) */}
      {isOriginal && !reducedMotion && (
        <>
          {/* Yumuşak parlayan orb'lar */}
          {[
            { size: 220, x: '8%', y: '8%', color: 'bg-primary/50', blur: 'blur-3xl', duration: 9 },
            { size: 160, x: '84%', y: '6%', color: 'bg-fuchsia-500/40', blur: 'blur-3xl', duration: 11 },
            { size: 260, x: '70%', y: '34%', color: 'bg-primary/45', blur: 'blur-3xl', duration: 13 },
            { size: 140, x: '15%', y: '48%', color: 'bg-fuchsia-500/40', blur: 'blur-2xl', duration: 8 },
            { size: 210, x: '48%', y: '66%', color: 'bg-primary/40', blur: 'blur-3xl', duration: 10 },
            { size: 150, x: '88%', y: '72%', color: 'bg-fuchsia-500/35', blur: 'blur-3xl', duration: 12 },
            { size: 180, x: '5%', y: '82%', color: 'bg-primary/45', blur: 'blur-3xl', duration: 9 },
            { size: 130, x: '40%', y: '22%', color: 'bg-fuchsia-500/30', blur: 'blur-2xl', duration: 7 },
          ].map((orb, i) => (
            <Motion.div
              key={`orb-${i}`}
              className={`absolute rounded-full ${orb.color} ${orb.blur}`}
              style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y }}
              animate={{
                x: [0, 30 * (i % 2 === 0 ? 1 : -1), -20 * (i % 2 === 0 ? 1 : -1), 0],
                y: [0, -25, 35, 0],
                scale: [1, 1.15, 0.9, 1],
                opacity: [0.4, 0.7, 0.35, 0.4],
              }}
              transition={{ duration: orb.duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
            />
          ))}

          {/* Küçük yükselen/düşen renkli parçacıklar */}
          {[...Array(26)].map((_, i) => {
            const startX = seeded(i * 10) * 100;
            const size = 3 + seeded(i * 10 + 1) * 6;
            const duration = 10 + seeded(i * 10 + 2) * 10;
            const delay = seeded(i * 10 + 3) * 12;
            const drift = (seeded(i * 10 + 4) - 0.5) * 120;
            return (
              <Motion.div
                key={`snow-${i}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  left: `${startX}%`,
                  top: '-5%',
                  background:
                    i % 4 === 0
                      ? `radial-gradient(circle, ${LANDING_SNOW_FUCHSIA_200} 0%, ${BRAND_ACCENT_PINK_HEX} 100%)`
                      : i % 4 === 1
                        ? `radial-gradient(circle, ${LANDING_SNOW_FUCHSIA_400} 0%, ${BRAND_PRIMARY_HEX} 100%)`
                        : i % 4 === 2
                          ? `radial-gradient(circle, ${CHART_HEX.pinkLight} 0%, ${CHART_HEX.pink} 100%)`
                          : `radial-gradient(circle, ${LANDING_SNOW_VIOLET_300} 0%, ${BRAND_PRIMARY_HEX} 100%)`,
                  boxShadow:
                    i % 4 === 0
                      ? '0 0 10px 3px rgba(240, 171, 252, 0.5)'
                      : i % 4 === 1
                        ? '0 0 10px 3px rgba(232, 121, 249, 0.5)'
                        : i % 4 === 2
                          ? '0 0 10px 3px rgba(244, 114, 182, 0.5)'
                          : '0 0 10px 3px rgba(192, 132, 252, 0.5)',
                }}
                animate={{ y: ['0vh', '105vh'], x: [0, drift, drift * 0.5, drift * 1.2, 0], rotate: [0, 360], opacity: [0, 1, 1, 1, 0] }}
                transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
              />
            );
          })}

          {/* Işıldayan yıldızlar */}
          {[...Array(6)].map((_, i) => (
            <Motion.div
              key={`sparkle-${i}`}
              className="absolute"
              style={{ left: `${5 + seeded(2000 + i * 5) * 90}%`, top: `${5 + seeded(2000 + i * 5 + 1) * 90}%` }}
            >
              <Motion.div
                className="h-1 w-1 rounded-full bg-white"
                style={{ boxShadow: '0 0 10px 4px rgba(255,255,255,0.8), 0 0 20px 8px rgba(240, 171, 252, 0.5)' }}
                animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2 + seeded(2000 + i * 5 + 2) * 2, repeat: Infinity, ease: 'easeInOut', delay: seeded(2000 + i * 5 + 3) * 4 }}
              />
            </Motion.div>
          ))}
        </>
      )}
    </div>
  );
}
