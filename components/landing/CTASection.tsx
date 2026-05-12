'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuroraText } from '@/components/ui/aurora-text';
import { Spotlight } from '@/components/ui/spotlight';
import { GradientCTACard } from '@/components/ui/gradient-cta-card';
import { BRAND_AURORA_HEX_STOPS } from '@/lib/brand-colors';
import { useAppT } from '@/lib/app-locale';

export default function CTASection() {
  const t = useAppT();
  return (
    <section className="py-20 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-30" />
      <Spotlight className="top-0 left-0 md:left-1/2" fill="hsl(var(--primary))" />
      <div className="container relative z-10 px-4 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="max-w-3xl mx-auto">
          <GradientCTACard>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-balance tracking-tight leading-tight">
            {t('landing.cta.headlineLine1')}
            <br />
            <AuroraText colors={[...BRAND_AURORA_HEX_STOPS]} speed={0.8}>
              {t('landing.cta.headlineAccent')}
            </AuroraText>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 text-balance leading-relaxed">
            {t('landing.cta.sub')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="xl" variant="gradient">
              <Link href="/auth/register">
                {t('landing.cta.primary')}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <a href="mailto:info@qratex.com">{t('landing.cta.sales')}</a>
            </Button>
          </div>
          </GradientCTACard>
        </motion.div>
      </div>
    </section>
  );
}
