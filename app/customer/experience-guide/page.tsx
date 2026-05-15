'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Type, Sparkles, Compass, ArrowUpRight } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

const BLOCKS = [
  { key: 'readability' as const, step: '01', icon: Type, span: 'md:col-span-4' },
  { key: 'motion' as const, step: '02', icon: Sparkles, span: 'md:col-span-2' },
  { key: 'shortcuts' as const, step: '03', icon: Compass, span: 'md:col-span-6' },
];

const linkChips: { href: string; labelKey: 'linkProgress' | 'linkDiscover' | 'linkSettings'; tone: string }[] = [
  { href: '/customer/progress-hub', labelKey: 'linkProgress', tone: 'from-emerald-500/20 via-primary/15 to-cyan-500/15' },
  { href: '/customer/discover', labelKey: 'linkDiscover', tone: 'from-cyan-500/15 via-primary/15 to-violet-500/15' },
  { href: '/customer/settings', labelKey: 'linkSettings', tone: 'from-violet-500/15 via-primary/15 to-rose-500/10' },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

export default function CustomerExperienceGuidePage() {
  const t = useAppT();

  return (
    <div className="relative mx-auto max-w-6xl pb-16 pt-1">
      <div
        className="pointer-events-none absolute -inset-x-4 -top-6 h-[28rem] rounded-[2.75rem] bg-[radial-gradient(ellipse_85%_60%_at_50%_0%,hsl(var(--primary)/0.2),transparent_58%),radial-gradient(ellipse_50%_40%_at_100%_20%,hsl(var(--primary)/0.08),transparent_50%)] opacity-90 dark:opacity-75"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-40 h-64 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000,transparent)] opacity-40 dark:opacity-25"
        aria-hidden
      />

      <div className="relative space-y-10">
        <DashboardPageHero
          eyebrow={t('customerExperienceGuide.eyebrow')}
          title={t('customerExperienceGuide.title')}
          description={t('customerExperienceGuide.subtitle')}
          icon={<Sparkles className="size-7" aria-hidden />}
          tone="auto"
          aside={
            <motion.div {...fadeUp} className="w-full max-w-sm space-y-3 lg:pt-1">
              <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.09] via-card to-cyan-500/[0.06] p-5 shadow-[0_20px_50px_-28px_hsl(var(--primary)/0.45)] dark:from-primary/15 dark:to-card">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary/90">{t('customerExperienceGuide.railTag')}</p>
                <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">{t('customerExperienceGuide.heroRail')}</p>
              </div>
            </motion.div>
          }
        />

        <div className="grid auto-rows-fr gap-4 md:grid-cols-6">
          {BLOCKS.map((b, idx) => {
            const Icon = b.icon;
            return (
              <motion.article
                key={b.key}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.06 * (idx + 1) }}
                className={cn(
                  'group relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_60px_-32px_hsl(var(--primary)/0.35)] dark:bg-card/60',
                  b.span
                )}
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-primary/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                  <span className="select-none text-5xl font-black tabular-nums leading-none tracking-tighter text-primary/[0.12] transition-colors duration-300 group-hover:text-primary/25 dark:text-primary/[0.18]">
                    {b.step}
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-border/80 bg-muted/50 text-primary shadow-inner transition-transform duration-300 group-hover:scale-[1.03]">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      {t(`customerExperienceGuide.block.${b.key}.title`)}
                    </h2>
                    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                      {t(`customerExperienceGuide.block.${b.key}.body`)}
                    </p>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.28 }} className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t('customerExperienceGuide.ctaBand')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {linkChips.map((chip) => (
              <Link
                key={chip.href}
                href={chip.href}
                className={cn(
                  'group relative flex min-h-[5.5rem] flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-4 transition-all duration-300',
                  'hover:border-primary/35 hover:shadow-lg',
                  'bg-gradient-to-br',
                  chip.tone
                )}
              >
                <span className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
                  {t(`customerExperienceGuide.${chip.labelKey}`)}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-90">
                  {t('customerExperienceGuide.openAction')}
                  <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
