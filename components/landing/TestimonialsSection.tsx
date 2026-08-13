'use client';

import { m as Motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useAppLocale } from '@/lib/app-locale';
import { getMessages } from '@/i18n/request';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function TestimonialsSection() {
  const { locale } = useAppLocale();
  const landing = getMessages(locale).landing.testimonials;

  return (
    <section id="testimonials" className="py-20 lg:py-32 [content-visibility:auto]">
      <div className="container px-4">
        <Motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="secondary" className="mb-4">{landing.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-balance tracking-tight">
            {landing.heading}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-balance leading-relaxed">
            {landing.sub}
          </p>
        </Motion.div>
        <Motion.div
          className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {landing.items.map((item) => (
            <Motion.div key={item.name} variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground mb-6">&ldquo;{item.content}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(item.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm text-muted-foreground">{item.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Motion.div>
          ))}
        </Motion.div>
      </div>
    </section>
  );
}
