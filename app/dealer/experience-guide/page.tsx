'use client';

import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { LayoutGrid, ClipboardList, Users, ArrowUpRight, Radio } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'layout' as const, code: 'A', icon: LayoutGrid },
  { key: 'ops' as const, code: 'B', icon: ClipboardList },
  { key: 'team' as const, code: 'C', icon: Users },
] as const;

const shortcuts: { href: string; labelKey: 'linkGrowth' | 'linkDiscover' | 'linkOps' | 'linkSettings' }[] = [
  { href: '/dealer/growth-hub', labelKey: 'linkGrowth' },
  { href: '/dealer/discover', labelKey: 'linkDiscover' },
  { href: '/dealer/operations-brief', labelKey: 'linkOps' },
  { href: '/dealer/settings', labelKey: 'linkSettings' },
];

const fade = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-32px' },
  transition: { duration: 0.4, ease: [0.25, 0.8, 0.25, 1] },
};

export default function DealerExperienceGuidePage() {
  const t = useAppT();

  return (
    <div className="relative mx-auto max-w-6xl pb-16 pt-1">
      <div
        className="pointer-events-none absolute inset-x-0 -top-4 h-72 bg-[linear-gradient(105deg,transparent_0%,rgb(245_158_11/0.07)_35%,transparent_55%),linear-gradient(-25deg,transparent_40%,hsl(var(--primary)/0.08)_70%,transparent_95%)] dark:opacity-90"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-32 h-[120%] w-px -translate-x-1/2 bg-gradient-to-b from-amber-500/25 via-border to-transparent opacity-60 dark:from-amber-400/20 md:block hidden"
        aria-hidden
      />

      <div className="relative space-y-10">
        <DashboardPageHero
          eyebrow={t('dealerExperienceGuide.eyebrow')}
          title={t('dealerExperienceGuide.title')}
          description={t('dealerExperienceGuide.subtitle')}
          icon={<Radio className="size-7" aria-hidden />}
          tone="auto"
          aside={
            <Motion.div {...fade} className="w-full max-w-sm lg:pt-1">
              <div className="rounded-xl border-2 border-dashed border-amber-500/35 bg-muted/30 px-4 py-4 font-mono text-[11px] leading-relaxed text-foreground shadow-sm dark:border-amber-400/25 dark:bg-muted/20">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                  {t('dealerExperienceGuide.railTag')}
                </p>
                <p className="mt-3 text-[13px] font-medium leading-snug text-foreground">{t('dealerExperienceGuide.heroRail')}</p>
              </div>
            </Motion.div>
          }
        />

        <div className="relative space-y-6">
          <div className="absolute left-0 top-0 bottom-0 hidden w-1 bg-gradient-to-b from-amber-500/40 via-amber-500/20 to-transparent md:block" aria-hidden />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <Motion.div
                key={step.key}
                {...fade}
                transition={{ ...fade.transition, delay: 0.08 + idx * 0.07 }}
                className="relative md:ml-6"
              >
                <div
                  className={cn(
                    'relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-background/95 to-background/80 p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-amber-500/30 dark:bg-gradient-to-br dark:from-background/90 dark:to-background/70'
                  )}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 font-mono text-sm font-bold text-amber-700 dark:text-amber-300">
                        {step.code}
                      </span>
                      <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                        <Icon className="size-5" aria-hidden />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
                        {t('dealerExperienceGuide.stepPrefix')} {step.code}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        {t(`dealerExperienceGuide.block.${step.key}.title`)}
                      </h2>
                      <p className="text-sm leading-relaxed text-foreground/85">{t(`dealerExperienceGuide.block.${step.key}.body`)}</p>
                    </div>
                  </div>
                </div>
              </Motion.div>
            );
          })}
        </div>

        <Motion.div {...fade} transition={{ ...fade.transition, delay: 0.32 }} className="space-y-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{t('dealerExperienceGuide.ctaBand')}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.06] dark:hover:bg-amber-500/10"
              >
                <span className="truncate">{t(`dealerExperienceGuide.${s.labelKey}`)}</span>
                <ArrowUpRight className="size-4 shrink-0 text-amber-600 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-amber-400" aria-hidden />
              </Link>
            ))}
          </div>
        </Motion.div>
      </div>
    </div>
  );
}
