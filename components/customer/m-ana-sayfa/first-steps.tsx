'use client';

import Link from 'next/link';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlowCard } from '@/components/ds/play';
import { HOME_LINKS } from '@/lib/customer-home/core';
import { useHomeCopy } from './copy';

/** Hiç değerlendirme yapmamış müşteriye (DB'den) üç adımlı başlangıç. Yüklenirken asla görünmez. */
export function FirstSteps() {
  const { copy } = useHomeCopy();
  return (
    <GlowCard role="region" aria-labelledby="home-first-title" className="flex flex-col gap-4">
      <h2 id="home-first-title" className="qx-h3 text-fg">
        {copy.firstTitle}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {copy.firstSteps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand qx-small font-bold text-brand-fg" aria-hidden>
              {i + 1}
            </span>
            <span>
              <span className="block qx-body font-medium text-fg">{step.title}</span>
              <span className="block qx-small text-fg-muted">{step.desc}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button asChild className="min-h-11 gap-2 self-start">
        <Link href={HOME_LINKS.scan}>
          <QrCode className="size-4" aria-hidden />
          {copy.firstCta}
        </Link>
      </Button>
    </GlowCard>
  );
}
