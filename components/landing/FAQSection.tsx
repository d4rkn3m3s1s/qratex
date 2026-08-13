'use client';

import { m as Motion } from 'framer-motion';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppLocale } from '@/lib/app-locale';
import { getMessages } from '@/i18n/request';

export default function FAQSection() {
  const { locale } = useAppLocale();
  const faq = getMessages(locale).landing.faq;

  return (
    <section id="faq" className="py-20 lg:py-32 scroll-mt-20 [content-visibility:auto]">
      <div className="container px-4">
        <Motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{faq.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {faq.heading}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-balance leading-relaxed">
            {faq.sub}
          </p>
        </Motion.div>
        <div className="max-w-2xl mx-auto space-y-6">
          {faq.items.map((item, i) => (
            <Motion.div
              key={item.q}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(i, 10) * 0.05 }}
            >
              <Card className="border-border/60 transition-colors hover:border-primary/25">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base sm:text-lg">{item.q}</CardTitle>
                  <CardDescription className="text-sm mt-1">{item.a}</CardDescription>
                </CardHeader>
              </Card>
            </Motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
