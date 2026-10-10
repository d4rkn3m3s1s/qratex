'use client';

import { m as Motion } from 'framer-motion';
import { DURATION, EASE, staggerDelay, useMotionPolicy } from '@/lib/motion';
import type { FunnelStep } from '../types';
import { useCampaignCopy } from '../client/use-copy';
import { fmtNumber, fmtPct } from '../copy';

/**
 * Yatay huni. Genişlik CSS'te (dış sarmalayıcı), dolma animasyonu içteki `Motion` öğesinde
 * (scaleX) — framer inline transform'u Tailwind konumunu ezmesin. Azaltılmış harekette anında.
 */
export function Funnel({ steps }: { steps: readonly FunnelStep[] }) {
  const { c, locale } = useCampaignCopy();
  const policy = useMotionPolicy();
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const width = Math.max(0, Math.min(100, s.rate ?? 0));
        return (
          <li key={s.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="qx-small font-medium text-fg">{c.perf.funnelSteps[s.key]}</span>
              <span className="qx-small qx-num text-fg">
                <span className="font-semibold">{fmtNumber(s.count, locale)}</span>
                {i > 0 && <span className="ml-2 text-fg-muted">{c.perf.ofSent(fmtPct(s.rate, locale))}</span>}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full" style={{ width: `${width}%` }}>
                <Motion.div
                  className="h-full w-full origin-left rounded-full bg-brand"
                  style={{ opacity: 1 - i * 0.15 }}
                  initial={{ scaleX: policy.reduce ? 1 : 0 }}
                  animate={{ scaleX: 1 }}
                  transition={policy.transition({ duration: DURATION.slow, ease: EASE.emphasized, delay: staggerDelay(i, 0.06) })}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
