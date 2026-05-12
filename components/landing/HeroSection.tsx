'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicBackground, type BackgroundVariant } from '@/components/ui/backgrounds';
import { HyperText } from '@/components/ui/hyper-text';
import { AuroraText } from '@/components/ui/aurora-text';
import { BRAND_ACCENT_PINK_HEX, BRAND_AURORA_HEX_STOPS, BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import {
  LANDING_SNOW_FUCHSIA_200,
  LANDING_SNOW_FUCHSIA_400,
  LANDING_SNOW_VIOLET_300,
} from '@/lib/landing-hero-colors';
import { CHART_HEX } from '@/lib/chart-palette';
import { useAppT } from '@/lib/app-locale';

/** Deterministic 0-1 value from seed (SSR/client hydration-safe) */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function formatStatValue(
  kind: 'users' | 'businesses' | 'feedbacks' | 'rating',
  raw: { users: number; businesses: number; feedbacks: number; rating: number }
): string {
  switch (kind) {
    case 'users':
      return raw.users >= 1_000_000 ? `${Math.floor(raw.users / 1_000_000)}M+` : raw.users >= 1000 ? `${Math.floor(raw.users / 1000)}K+` : `${raw.users}+`;
    case 'businesses':
      return raw.businesses >= 1000 ? `${Math.floor(raw.businesses / 1000)}K+` : `${raw.businesses}+`;
    case 'feedbacks':
      return raw.feedbacks >= 1_000_000 ? `${Math.floor(raw.feedbacks / 1_000_000)}M+` : raw.feedbacks >= 1000 ? `${Math.floor(raw.feedbacks / 1000)}K+` : `${raw.feedbacks}+`;
    case 'rating':
      return String(raw.rating.toFixed(1));
    default:
      return '';
  }
}

export type HeroSectionProps = {
  backgroundEffect: BackgroundVariant;
  reducedMotion: boolean;
};

type StatRow = { value: string; label: string };

export default function HeroSection({ backgroundEffect, reducedMotion }: HeroSectionProps) {
  const t = useAppT();
  const [stats, setStats] = useState<StatRow[] | null>(null);

  const fallbackStats = useMemo(
    () => [
      { value: '10K+', label: t('landing.hero.stats.activeUsers') },
      { value: '500+', label: t('landing.hero.stats.businesses') },
      { value: '1M+', label: t('landing.hero.stats.feedbacks') },
      { value: '4.9', label: t('landing.hero.stats.avgRating') },
    ],
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { users: number; businesses: number; feedbacks: number; rating: number } | null) => {
        if (cancelled || !data) return;
        const hasMeaningfulData = data.users > 0 || data.businesses > 0 || data.feedbacks > 0;
        if (!hasMeaningfulData) return;
        setStats([
          { value: formatStatValue('users', data), label: t('landing.hero.stats.activeUsers') },
          { value: formatStatValue('businesses', data), label: t('landing.hero.stats.businesses') },
          { value: formatStatValue('feedbacks', data), label: t('landing.hero.stats.feedbacks') },
          { value: formatStatValue('rating', data), label: t('landing.hero.stats.avgRating') },
        ]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [t]);

  const displayStats = stats ?? fallbackStats;

  return (
    <>
      {backgroundEffect !== 'none' && backgroundEffect !== 'original' && (
        <DynamicBackground variant={backgroundEffect} fetchFromApi={false}>
          <div />
        </DynamicBackground>
      )}

      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden pt-16">
        {(backgroundEffect === 'original' || backgroundEffect === 'none') && (
          <>
            <div className="absolute inset-0 gradient-mesh opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/50 to-background" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/30 to-background z-[1]" aria-hidden="true" />

        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {backgroundEffect === 'original' && !reducedMotion &&
            [
              { size: 120, x: '10%', y: '20%', color: 'bg-primary/45', blur: 'blur-2xl', duration: 8 },
              { size: 100, x: '80%', y: '15%', color: 'bg-primary/35', blur: 'blur-2xl', duration: 10 },
              { size: 150, x: '70%', y: '60%', color: 'bg-primary/50', blur: 'blur-3xl', duration: 12 },
              { size: 80, x: '20%', y: '70%', color: 'bg-primary/40', blur: 'blur-xl', duration: 7 },
              { size: 130, x: '50%', y: '80%', color: 'bg-primary/35', blur: 'blur-2xl', duration: 9 },
              { size: 90, x: '85%', y: '45%', color: 'bg-primary/40', blur: 'blur-xl', duration: 11 },
              { size: 110, x: '5%', y: '50%', color: 'bg-primary/40', blur: 'blur-2xl', duration: 8 },
              { size: 70, x: '40%', y: '30%', color: 'bg-primary/30', blur: 'blur-xl', duration: 6 },
            ].map((orb, i) => (
              <motion.div
                key={`orb-${i}`}
                className={`absolute rounded-full ${orb.color} ${orb.blur}`}
                style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y }}
                animate={{
                  x: [0, 30 * (i % 2 === 0 ? 1 : -1), -20 * (i % 2 === 0 ? 1 : -1), 0],
                  y: [0, -25, 35, 0],
                  scale: [1, 1.15, 0.9, 1],
                  opacity: [0.5, 0.8, 0.4, 0.5],
                }}
                transition={{ duration: orb.duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
              />
            ))}

          {backgroundEffect === 'original' && !reducedMotion && [...Array(40)].map((_, i) => {
            const startX = seeded(i * 10) * 100;
            const size = 3 + seeded(i * 10 + 1) * 6;
            const duration = 8 + seeded(i * 10 + 2) * 8;
            const delay = seeded(i * 10 + 3) * 10;
            const drift = (seeded(i * 10 + 4) - 0.5) * 100;
            return (
              <motion.div
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
                  boxShadow: i % 4 === 0 ? '0 0 10px 3px rgba(240, 171, 252, 0.6)' : i % 4 === 1 ? '0 0 10px 3px rgba(232, 121, 249, 0.6)' : i % 4 === 2 ? '0 0 10px 3px rgba(244, 114, 182, 0.6)' : '0 0 10px 3px rgba(192, 132, 252, 0.6)',
                }}
                animate={{ y: ['0vh', '110vh'], x: [0, drift, drift * 0.5, drift * 1.2, 0], rotate: [0, 360], opacity: [0, 1, 1, 1, 0] }}
                transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
              />
            );
          })}

          {backgroundEffect === 'original' && !reducedMotion && [...Array(15)].map((_, i) => {
            const startX = 5 + seeded(1000 + i * 10) * 90;
            const size = 8 + seeded(1000 + i * 10 + 1) * 8;
            const duration = 12 + seeded(1000 + i * 10 + 2) * 8;
            const delay = seeded(1000 + i * 10 + 3) * 8;
            return (
              <motion.div
                key={`bigsnow-${i}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  left: `${startX}%`,
                  top: '-5%',
                  background: `radial-gradient(circle, rgba(255,255,255,0.9) 0%, ${LANDING_SNOW_FUCHSIA_200} 50%, ${BRAND_ACCENT_PINK_HEX} 100%)`,
                  boxShadow: '0 0 20px 6px rgba(240, 171, 252, 0.7), 0 0 40px 10px rgba(217, 70, 239, 0.4)',
                }}
                animate={{ y: ['0vh', '110vh'], x: [0, 50 * (i % 2 === 0 ? 1 : -1), -30 * (i % 2 === 0 ? 1 : -1), 40, 0], scale: [0.8, 1.2, 1, 1.1, 0.8], opacity: [0, 1, 0.9, 0.8, 0] }}
                transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
              />
            );
          })}

          {backgroundEffect === 'original' && !reducedMotion && [...Array(12)].map((_, i) => (
            <motion.div key={`sparkle-${i}`} className="absolute" style={{ left: `${5 + seeded(2000 + i * 5) * 90}%`, top: `${5 + seeded(2000 + i * 5 + 1) * 90}%` }}>
              <motion.div
                className="w-1 h-1 bg-white rounded-full"
                style={{ boxShadow: '0 0 10px 4px rgba(255,255,255,0.8), 0 0 20px 8px rgba(240, 171, 252, 0.5)' }}
                animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2 + seeded(2000 + i * 5 + 2) * 2, repeat: Infinity, ease: 'easeInOut', delay: seeded(2000 + i * 5 + 3) * 4 }}
              />
            </motion.div>
          ))}
        </div>

        <div className="container relative z-10 px-4 py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <Badge variant="secondary" className="mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              {t('landing.hero.badge')}
            </Badge>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance leading-[1.05]">
              {t('landing.hero.headlineLine1')}
              <br />
              <AuroraText colors={[...BRAND_AURORA_HEX_STOPS]} speed={0.8}>
                {t('landing.hero.headlineAccent')}
              </AuroraText>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 text-balance leading-relaxed">
              {t('landing.hero.sub')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="xl" variant="gradient">
                <Link href="/auth/register">
                  {t('landing.hero.ctaStart')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="#demo">
                  <Play className="w-5 h-5 mr-2" />
                  {t('landing.hero.ctaDemo')}
                </Link>
              </Button>
            </div>
            <motion.div
              className="mt-20 max-w-3xl mx-auto rounded-2xl border border-border/50 bg-card/35 backdrop-blur-md px-4 py-8 sm:px-8 shadow-glass"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                {displayStats.map((stat, i) => (
                  <div key={i} className="text-center min-h-[4.5rem] flex flex-col justify-center">
                    <HyperText className="text-3xl sm:text-4xl font-bold text-gradient justify-center tabular-nums" startOnView animateOnHover delay={i * 150} duration={1000}>
                      {stat.value}
                    </HyperText>
                    <div className="text-sm text-muted-foreground mt-1.5 leading-snug">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <motion.div className="flex flex-col items-center" aria-hidden="true" animate={{ y: [0, 10, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2">
              <motion.div className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ y: [0, 16, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
            </div>
          </motion.div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => {
              const el = document.getElementById('features');
              el?.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => (el as HTMLElement)?.focus({ preventScroll: true }), 300);
            }}
          >
            {t('landing.hero.scrollHint')}
          </Button>
        </div>
      </section>
    </>
  );
}
