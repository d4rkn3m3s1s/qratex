'use client';

import { m as Motion } from 'framer-motion';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { featureDefs } from '@/lib/landing-content';
import { useAppT } from '@/lib/app-locale';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function FeaturesSection() {
  const t = useAppT();
  return (
    <section id="features" className="py-20 lg:py-32 relative scroll-mt-20 [content-visibility:auto]" tabIndex={-1}>
      <div className="container px-4">
        <Motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{t('landing.features.badge')}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {t('landing.features.heading')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-balance leading-relaxed">
            {t('landing.features.sub')}
          </p>
        </Motion.div>
        <Motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {featureDefs.map((feature) => (
            <Motion.div key={feature.id} variants={fadeInUp}>
              <Card hover className="h-full group">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle>{t(`landing.features.items.${feature.id}.title`)}</CardTitle>
                  <CardDescription>{t(`landing.features.items.${feature.id}.description`)}</CardDescription>
                </CardHeader>
              </Card>
            </Motion.div>
          ))}
        </Motion.div>
      </div>
    </section>
  );
}
