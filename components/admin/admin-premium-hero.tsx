'use client';

/**
 * Premium sayfa kabı (ortak tasarım dili). Aynı bileşen tüm panellerde kullanılır;
 * nötr isim: `DashboardPageHero` / `DashboardPageHeroChrome` → `@/components/layout/dashboard-page-hero`.
 * Giriş: yalnızca CSS `animate-in` (globals) — bu dosyada Framer yok; tüketen sayfada LazyMotion ile çakışmaz.
 */

import { useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ADMIN_PREMIUM_CHROME_GRADIENT } from '@/lib/panel-hero-gradients';
import { cn } from '@/lib/utils';

function AdminPremiumHeroBackdrop({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="absolute inset-0 size-full overflow-hidden rounded-[inherit]" aria-hidden>
      {/* Işık: sol üst + sağ alt — primary + nötr slate */}
      <div
        className="absolute -left-[20%] -top-[40%] h-[85%] w-[70%] rounded-full opacity-50 blur-[100px] dark:opacity-35"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, hsl(var(--primary) / 0.22) 0%, hsl(var(--primary) / 0.08) 45%, transparent 70%)',
        }}
      />
      <div
        className="absolute -right-[15%] -bottom-[45%] h-[80%] w-[65%] rounded-full opacity-40 blur-[90px] dark:opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.12) 0%, hsl(var(--primary) / 0.1) 40%, transparent 68%)',
        }}
      />

      {!reducedMotion && (
        <div
          className="absolute inset-0 opacity-[0.65] motion-reduce:animate-none motion-reduce:opacity-45 dark:opacity-55 animate-[premium-hero-breathe_10s_ease-in-out_infinite]"
          style={{
            background:
              'radial-gradient(ellipse 120% 80% at 50% -20%, hsl(var(--primary) / 0.08) 0%, transparent 55%)',
          }}
        />
      )}

      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent dark:via-white/15" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-60" />
    </div>
  );
}

export type AdminPremiumHeroChromeTone = 'dark' | 'light' | 'auto';

type AdminPremiumHeroChromeProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  animate?: boolean;
  /**
   * `auto`: uygulama temasına göre — açıkta okunaklı açık kart, `dark` sınıfında premium koyu panel (varsayılan).
   * `dark`: her zaman koyu panel (zorunlu kontrast).
   * `light`: her zaman açık kart (ör. ana dashboard HeroSection).
   */
  tone?: AdminPremiumHeroChromeTone;
};

export function AdminPremiumHeroChrome({
  children,
  className,
  padded = true,
  animate = true,
  tone = 'auto',
}: AdminPremiumHeroChromeProps) {
  const reducedMotion = useReducedMotion() ?? false;

  const innerCard = (
    <div
      className={cn(
        'relative isolate z-10 overflow-hidden rounded-2xl sm:rounded-3xl',
        /* Koyu panelde backdrop-blur, bg-clip-text ile birlikte bazı ortamlarda metni “yok” eder — blur açık / auto:açık dalgasında */
        (tone === 'light' || tone === 'auto') && 'backdrop-blur-xl dark:backdrop-blur-none',
        tone === 'dark' && [
          'border border-white/[0.08]',
          ADMIN_PREMIUM_CHROME_GRADIENT.darkToneBg,
          'text-white shadow-[0_20px_50px_-24px_rgba(0,0,0,0.72)]',
          ADMIN_PREMIUM_CHROME_GRADIENT.darkToneDarkVariant,
        ],
        tone === 'light' && [
          'border border-border/80 bg-background/92',
          'text-foreground shadow-sm dark:border-white/[0.08] dark:bg-card/90',
          'dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.65)]',
        ],
        tone === 'auto' && [
          'border border-border/80',
          'bg-gradient-to-br from-background via-primary/[0.07] to-cyan-500/[0.06]',
          'text-foreground shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
          'dark:border-white/[0.09]',
          ADMIN_PREMIUM_CHROME_GRADIENT.autoToneDarkBg,
          'dark:text-white dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.72)]',
        ],
        padded && 'p-4 sm:p-6 md:p-8'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-0 rounded-[inherit]',
          (tone === 'auto' || tone === 'light') && 'opacity-[0.42] dark:opacity-100'
        )}
        aria-hidden
      >
        <AdminPremiumHeroBackdrop reducedMotion={reducedMotion} />
      </div>
      {/* İnce üst vurgu */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r from-primary/0 via-primary/35 to-primary/0 opacity-90 dark:via-primary/40"
        aria-hidden
      />
      <div className="relative z-[2]">{children}</div>
    </div>
  );

  const shell = (
    <div
      className={cn(
        'group relative rounded-2xl sm:rounded-3xl',
        'ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
        animate && !reducedMotion && 'animate-in',
        className
      )}
    >
      {innerCard}
    </div>
  );

  return shell;
}

export type AdminPremiumHeroProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: AdminPremiumHeroChromeTone;
};

export function AdminPremiumHero({
  eyebrow = 'Yönetim paneli',
  title,
  description,
  icon,
  chips,
  actions,
  aside,
  className,
  contentClassName,
  tone = 'auto',
}: AdminPremiumHeroProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  /** Koyu panel görünümü: zorunlu `dark` veya `auto` + uygulama koyu teması */
  const showDarkPanel =
    tone === 'dark' || (tone === 'auto' && mounted && resolvedTheme === 'dark');

  return (
    <AdminPremiumHeroChrome className={className} tone={tone}>
      <div
        className={cn(
          'flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8',
          contentClassName
        )}
      >
        <div className="relative min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            {icon ? (
              <span
                className={cn(
                  'relative inline-flex shrink-0 rounded-2xl border p-3 shadow-sm',
                  showDarkPanel
                    ? 'border-white/15 bg-white/[0.07] text-white ring-1 ring-white/[0.06]'
                    : 'border-border/70 bg-muted/40 text-foreground dark:border-white/10 dark:bg-white/[0.06] dark:text-white ring-1 ring-black/[0.03] dark:ring-white/[0.05]',
                  '[&_svg]:size-7 [&_svg]:shrink-0 [&_svg]:!text-foreground dark:[&_svg]:!text-white'
                )}
              >
                {icon}
              </span>
            ) : null}

            <div className="min-w-0 flex-1 space-y-3">
              {eyebrow ? (
                <div
                  className={cn(
                    'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-[11px]',
                    showDarkPanel
                      ? 'border-primary/35 bg-primary/15 text-white'
                      : 'border-primary/20 bg-primary/5 text-primary dark:border-primary/25 dark:bg-primary/10 dark:text-white'
                  )}
                >
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    {!reducedMotion && (
                      <span
                        className={cn(
                          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-70',
                          showDarkPanel ? 'bg-primary/45' : 'bg-primary/40 dark:bg-primary/45'
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        'relative inline-flex h-1.5 w-1.5 rounded-full shadow-sm',
                        showDarkPanel ? 'bg-primary/90' : 'bg-primary dark:bg-primary/90'
                      )}
                    />
                  </span>
                  <span className="truncate">{eyebrow}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <h1
                  className={cn(
                    'max-w-[min(100%,44rem)] text-2xl font-bold tracking-tight text-balance sm:text-3xl lg:text-[2.125rem] xl:text-4xl',
                    /* Koyu panelde bg-clip-text + blur/stacking bazı tarayıcılarda görünmez metin verir — düz renk + hafif gölge */
                    showDarkPanel
                      ? 'text-white [text-shadow:0_1px_24px_rgba(0,0,0,0.35)]'
                      : 'bg-gradient-to-br from-slate-900 via-slate-800 to-primary bg-clip-text text-transparent'
                  )}
                >
                  {title}
                </h1>

                {description ? (
                  <div
                    className={cn(
                      'max-w-2xl text-sm leading-relaxed text-pretty sm:text-[15px] sm:leading-7',
                      showDarkPanel ? 'text-white/75' : 'text-muted-foreground'
                    )}
                  >
                    {description}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {chips ? <div className="flex flex-wrap gap-2 pt-1">{chips}</div> : null}
        </div>

        <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 lg:w-auto lg:max-w-md lg:items-end">
          {actions ? (
            <div
              className={cn(
                'flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end',
                '[&_button]:touch-manipulation [&_button]:transition-transform [&_button]:duration-150 [&_button:active]:scale-[0.98]'
              )}
            >
              {actions}
            </div>
          ) : null}
          {aside ? <div className="w-full lg:w-auto">{aside}</div> : null}
        </div>
      </div>
    </AdminPremiumHeroChrome>
  );
}
