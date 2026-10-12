'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { safeLocalGet, safeLocalSet } from './storage';
import type { SetupState } from '@/lib/dealer-today/types';
import { useTodayCopy } from './copy';

const COLLAPSE_KEY = 'qx:dealer-today:setup-collapsed';

/**
 * Kurulum kartı — eski `/dealer/onboarding` sayfası, layout'taki "panel sınırlıdır" şeridi
 * (SAHTE kısıtlama) ve `OnboardingSheet` turunun yerine tek yer. Adımlar kayıtlardan türetilir;
 * zorunlu adımlar bitince kart HİÇ render edilmez. Daraltma yalnız bu cihazda hatırlanır.
 */
export function SetupCard({ setup }: { setup: SetupState }) {
  const { copy } = useTodayCopy();
  const listId = useId();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(safeLocalGet(COLLAPSE_KEY) === '1');
  }, []);

  if (!setup.visible) return null;
  const pct = Math.round((setup.required.done / Math.max(1, setup.required.total)) * 100);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeLocalSet(COLLAPSE_KEY, next ? '1' : '0');
  };
  const nextStep = setup.steps.find((s) => s.key === setup.nextKey) ?? null;

  return (
    <section aria-labelledby={`${listId}-title`} className="min-w-0 rounded-card border border-subtle bg-surface-1">
      <div className="flex flex-wrap items-start gap-3 px-card py-4 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <h2 id={`${listId}-title`} className="text-base font-semibold text-fg">
            {copy.setup.title}
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">{copy.setup.desc}</p>
          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label={copy.setup.progressLabel}
              aria-valuemin={0}
              aria-valuemax={setup.required.total}
              aria-valuenow={setup.required.done}
              aria-valuetext={copy.setup.progress(setup.required.done, setup.required.total)}
              className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-base" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-fg-muted">
              {copy.setup.progress(setup.required.done, setup.required.total)}
            </span>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {nextStep && collapsed && (
            <Button asChild size="sm" className="flex-1 shadow-none sm:flex-none">
              <Link href={nextStep.href} prefetch={false}>
                {copy.setup.step[nextStep.key].cta}
              </Link>
            </Button>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={listId}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-control px-2 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="sr-only">{collapsed ? copy.setup.expand : copy.setup.collapse}</span>
            <ChevronDown aria-hidden className={cn('h-5 w-5 transition-transform duration-fast', collapsed ? '' : 'rotate-180')} />
          </button>
        </div>
      </div>
      <ol id={listId} hidden={collapsed} className="grid gap-2 border-t border-subtle px-card py-4 sm:grid-cols-2 xl:grid-cols-3">
        {setup.steps.map((step, i) => {
          const text = copy.setup.step[step.key];
          const isNext = step.key === setup.nextKey;
          return (
            <li
              key={step.key}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-control border p-3',
                step.done ? 'border-subtle bg-surface-muted/60' : isNext ? 'border-brand-border bg-brand-subtle/40' : 'border-subtle bg-surface-1'
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                    step.done ? 'bg-success text-success-fg' : 'bg-surface-3 text-fg-muted'
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', step.done ? 'text-fg-muted line-through decoration-fg-subtle' : 'text-fg')}>
                    {text.title}
                    {!step.required && <span className="ml-2 rounded-chip bg-surface-3 px-1.5 py-0.5 text-xs font-normal text-fg-muted">{copy.setup.optional}</span>}
                    <span className="sr-only">{step.done ? ` — ${copy.setup.done}` : ''}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">{text.desc}</p>
                </div>
              </div>
              {!step.done && (
                <Button asChild size="sm" variant={isNext ? 'default' : 'outline'} className="mt-auto min-h-11 w-full shadow-none sm:min-h-9">
                  <Link href={step.href} prefetch={false}>
                    {text.cta}
                  </Link>
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
