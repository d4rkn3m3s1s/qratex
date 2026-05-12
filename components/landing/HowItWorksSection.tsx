'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { howItWorksStepDefs } from '@/lib/landing-content';
import { useAppT } from '@/lib/app-locale';

export default function HowItWorksSection() {
  const t = useAppT();
  return (
    <section className="py-20 lg:py-32 bg-muted/20 dark:bg-muted/30 [content-visibility:auto]">
      <div className="container px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{t('landing.howItWorks.badge')}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {t('landing.howItWorks.heading')}
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {howItWorksStepDefs.map((item, index) => (
            <motion.div
              key={item.step}
              className="relative text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
            >
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold mb-2">{t(`landing.howItWorks.steps.${item.id}.title`)}</h3>
              <p className="text-muted-foreground">{t(`landing.howItWorks.steps.${item.id}.description`)}</p>
              {index < howItWorksStepDefs.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
