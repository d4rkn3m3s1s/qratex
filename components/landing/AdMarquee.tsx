'use client';

import { useAppT } from '@/lib/app-locale';

/**
 * AdMarquee — ana sayfa için sonsuz kayan işletme logosu şeridi.
 * Her işletme, tasarlanmış bir SVG monogram logosuyla temsil edilir (emoji değil).
 * Gerçek reklam verenler geldiğinde `items` prop'u ile beslenir; varsayılan
 * demo markalar QRateX'i kullanan tipik işletme türlerini yansıtır.
 * Saf CSS animasyon; `prefers-reduced-motion` tercihinde durur.
 * Şerit iki kez render edilir (A + A) ki döngü kesintisiz görünsün.
 */

type MarqueeItem = { label: string; logo: React.ReactNode };

/** Yuvarlak amblem çerçevesi + iki harf monogram + tematik renk. */
function Monogram({ mono, from, to, glyph }: { mono: string; from: string; to: string; glyph?: React.ReactNode }) {
  const id = `mg-${mono}-${from}`.replace(/[^a-zA-Z0-9-]/g, '');
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="14" fill={`url(#${id})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="14" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="1" />
      {glyph ?? (
        <text x="24" y="31" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight="700" fontSize="18" fill="white">{mono}</text>
      )}
    </svg>
  );
}

// Demo işletme logoları (tasarlanmış SVG monogramlar). Gerçek reklam verenler `items` ile gelir.
const DEMO_ITEMS: MarqueeItem[] = [
  { label: 'Kafe Aroma', logo: <Monogram mono="KA" from="#b45309" to="#78350f" /> },
  { label: 'Lezzet Durağı', logo: <Monogram mono="LD" from="#dc2626" to="#7f1d1d" /> },
  { label: 'Fırın & Co', logo: <Monogram mono="FC" from="#d97706" to="#92400e" /> },
  { label: 'Yeşil Bahçe', logo: <Monogram mono="YB" from="#16a34a" to="#14532d" /> },
  { label: 'Deniz Restoran', logo: <Monogram mono="DR" from="#0891b2" to="#164e63" /> },
  { label: 'Tatlı Köşe', logo: <Monogram mono="TK" from="#db2777" to="#831843" /> },
  { label: 'Kahve Molası', logo: <Monogram mono="KM" from="#92400e" to="#451a03" /> },
  { label: 'Şehir Bistro', logo: <Monogram mono="ŞB" from="#7c3aed" to="#4c1d95" /> },
];

export default function AdMarquee({ items = DEMO_ITEMS }: { items?: MarqueeItem[] }) {
  const t = useAppT();
  const row = [...items, ...items]; // kesintisiz döngü için iki kopya

  return (
    <section
      className="relative overflow-hidden border-y border-border/30 bg-background/20 py-8 backdrop-blur-sm"
      aria-label={t('landing.adMarquee.aria')}
    >
      <div className="mb-3 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t('landing.adMarquee.title')}
      </div>

      {/* kenar solması (fade) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background/80 to-transparent" />

      <div className="group flex select-none">
        <ul className="qx-marquee-track flex shrink-0 items-center gap-8 pr-8" aria-hidden={false}>
          {row.map((item, i) => (
            <li key={`${item.label}-${i}`}>
              <div className="flex items-center gap-3 whitespace-nowrap text-base font-semibold text-foreground/55 grayscale transition-all duration-300 hover:text-foreground/90 hover:grayscale-0">
                {item.logo}
                {item.label}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
