'use client';

import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pricingPlanDefs } from '@/lib/landing-content';
import { useAppLocale } from '@/lib/app-locale';
import { getMessages } from '@/i18n/request';

export default function PricingSection() {
  const { locale } = useAppLocale();
  const m = getMessages(locale);
  const plans = m.landing.pricing.plans;

  return (
    <section id="pricing" className="py-20 lg:py-32 scroll-mt-20 [content-visibility:auto]">
      <div className="container px-4">
        <Motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{m.landing.pricing.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {m.landing.pricing.heading}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-balance leading-relaxed">
            {m.landing.pricing.sub}
          </p>
        </Motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingPlanDefs.map((plan, index) => {
            const copy = plans[plan.id];
            return (
            <Motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={`relative h-full ${
                  plan.popular ? 'border-primary shadow-lg shadow-primary/20' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className="shadow-lg">
                      <Star className="w-3 h-3 mr-1" />
                      {m.landing.pricing.popular}
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{copy.name}</CardTitle>
                  <CardDescription>{copy.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {'period' in plan && plan.period ? (
                      <span className="text-muted-foreground">{m.landing.pricing.perMonth}</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {copy.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="w-full"
                    variant={plan.popular ? 'gradient' : 'outline'}
                  >
                    <Link href="/auth/register">{copy.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            </Motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
