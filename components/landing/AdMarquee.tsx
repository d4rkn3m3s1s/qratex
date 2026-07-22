'use client';

import { useAppT } from '@/lib/app-locale';

/**
 * AdMarquee — ana sayfa için sonsuz kayan reklam/logo şeridi.
 * Placeholder içerik: gerçek reklam görselleri/logolar sonradan `items` ile beslenecek.
 * Saf CSS animasyon (framer-motion'dan hafif); `prefers-reduced-motion` tercihinde durur.
 * Şerit iki kez render edilir (A + A) ki döngü kesintisiz görünsün.
 */

type MarqueeItem = { label: string; hint?: string };

// TODO(assets): gerçek reklam veren logoları/görselleri geldiğinde buradan beslenecek.
const PLACEHOLDER_ITEMS: MarqueeItem[] = [
  { label: 'Kafe Aroma', hint: '☕' },
  { label: 'Lezzet Durağı', hint: '🍽️' },
  { label: 'Fırın & Co', hint: '🥐' },
  { label: 'Yeşil Bahçe', hint: '🌿' },
  { label: 'Deniz Restoran', hint: '🐟' },
  { label: 'Tatlı Köşe', hint: '🍰' },
  { label: 'Kahve Molası', hint: '☕' },
  { label: 'Şehir Bistro', hint: '🍷' },
];

export default function AdMarquee({ items = PLACEHOLDER_ITEMS }: { items?: MarqueeItem[] }) {
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
              <div className="flex items-center gap-3 whitespace-nowrap text-base font-semibold text-foreground/45 transition-colors duration-300 hover:text-foreground/80">
                <span
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-fuchsia-500/15 text-lg ring-1 ring-border/40"
                >
                  {item.hint}
                </span>
                {item.label}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
