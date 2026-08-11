'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HyperText } from '@/components/ui/hyper-text';
import { AuroraText } from '@/components/ui/aurora-text';
import { BRAND_AURORA_HEX_STOPS } from '@/lib/brand-colors';
import { useAppT } from '@/lib/app-locale';

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

type StatRow = { value: string; label: string };

// Arka plan (hareketli katman) artık ortak <LandingBackground /> tarafından çizilir;
// Hero yalnızca içerik + okunabilirlik gradyanını taşır, bu yüzden prop almaz.
export default function HeroSection() {
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

  // Tam ekran hero video (opsiyonel). URL yoksa ortak hareketli arka plan görünür (placeholder).
  const heroVideoUrl = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;

  return (
    <>
      {/* Hareketli arka plan ortak LandingBackground'da (tüm sayfa). Hero yalnızca içeriği
          taşır + metnin okunması için hafif bir dikey gradyan uygular. Ayrıca opsiyonel
          tam ekran arka plan videosu — URL verilmezse hareketli zemin görünür. */}
      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden pt-16">
        {heroVideoUrl && (
          <video
            className="absolute inset-0 z-0 h-full w-full object-cover opacity-40"
            src={heroVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            // LCP: dekoratif arka plan videosu tüm dosyayı eager indirip LCP kaynaklarıyla
            // bant yarışına girmesin — metadata yeter (autoPlay yine de akışı başlatır).
            preload="metadata"
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-transparent to-background/25 z-[1]" aria-hidden="true" />

        <div className="container relative z-10 px-4 py-20 text-center">
          {/* LCP FIX + tasarım korundu: başlık (LCP elementi) opacity HEP 1 → ilk paint'te görünür
              (SSR'de opacity:0 basılmaz, FCP/LCP gecikmez). Giriş hissi için SADECE transform (y)
              ile hafif slide-in — transform LCP'yi geciktirmez (element boyanmış sayılır). */}
          <motion.div initial={{ opacity: 1, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
            <Badge variant="secondary" className="mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              {t('landing.hero.badge')}
            </Badge>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-semibold tracking-tight mb-6 text-balance leading-[1.08] sm:leading-[1.06]">
              {t('landing.hero.headlineLine1')}
              <br />
              <AuroraText colors={[...BRAND_AURORA_HEX_STOPS]} speed={0.8}>
                {t('landing.hero.headlineAccent')}
              </AuroraText>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-10 text-balance leading-relaxed">
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
              className="mt-16 sm:mt-20 max-w-3xl mx-auto rounded-2xl border border-border/40 bg-card/25 backdrop-blur-md px-4 py-7 sm:px-8 sm:py-8 shadow-sm"
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
