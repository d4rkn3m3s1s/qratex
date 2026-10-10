'use client';

import Link from 'next/link';
import { ArrowRight, BellRing, CheckCircle2 } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { SeverityBadge } from '@/components/ds/data';
import type { InsightsData } from '@/lib/dealer-insights/types';
import type { RefHandlers } from './refs';
import { useInsightsCopy } from './copy';

const linkClass =
  'inline-flex min-h-11 items-center gap-1 qx-small font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-chip sm:min-h-8';

/**
 * Kural tabanlı uyarılar (eski sayfada LLM serbest metniydi, ilgili kayda bağlantı yoktu).
 * Her uyarı: önem rozeti (ikon + metin) + ölçülmüş cümle + ilgili kayıtlar.
 */
export function AlertsPanel({ data, handlers }: { data: InsightsData; handlers: RefHandlers }) {
  const { copy } = useInsightsCopy();
  return (
    <SectionCard
      id="uyarilar"
      title={copy.alerts.title}
      description={copy.alerts.desc}
      icon={<BellRing className="h-4 w-4" aria-hidden />}
      density="compact"
    >
      {data.alerts.length === 0 ? (
        <p className="flex items-center gap-2 qx-small text-fg-muted">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          {copy.alerts.none}
        </p>
      ) : (
        <ul className="divide-y divide-subtle">
          {data.alerts.map((a) => {
            const href = handlers.alertHref(a);
            const text = copy.alerts.kind[a.kind](a.params);
            return (
              <li key={a.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <SeverityBadge severity={a.severity} label={copy.alerts.severity[a.severity]} size="sm" />
                <p className="qx-small text-fg">{text}</p>
                {href ? (
                  <Link href={href} className={linkClass}>
                    {copy.alerts.view}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : a.target.kind === 'theme' ? (
                  <button
                    type="button"
                    className={linkClass}
                    onClick={() => a.target.kind === 'theme' && handlers.openTheme(a.target.key, String(a.params.theme ?? a.target.key))}
                  >
                    {copy.alerts.viewTheme}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
