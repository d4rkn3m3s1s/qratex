'use client';

import Link from 'next/link';
import { Building2, ClipboardList, MapPin, Pencil } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import type { RemedyTemplatesSection as TemplatesData, SectionState } from '@/lib/dealer/offers/types';
import { SectionBody } from './section-body';
import { useOffersCopy } from './context';

/**
 * Telafi şablonları — SALT OKUNUR görünüm (§6.2: "şablonlar Pazarlama/Teklifler'de de görünür").
 * Düzenleme Otomasyon → Telafi'de yapılır; burada yalnız müşterinin seçebileceği türler/değerler.
 */
export function RemedyTemplatesSection({ state, onRetry }: { state: SectionState<TemplatesData>; onRetry: () => unknown }) {
  const copy = useOffersCopy();
  const ready = state.status === 'ready' ? state.data : null;
  return (
    <SectionCard
      id="telafi-sablonlari"
      title={copy.templates.title}
      description={copy.templates.description}
      icon={<ClipboardList />}
      actions={
        ready ? (
          <Link
            href={ready.editHref}
            className="qx-small inline-flex min-h-11 items-center gap-1.5 rounded-md border border-strong px-3 font-medium text-fg transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {copy.templates.edit}
          </Link>
        ) : null
      }
    >
      <SectionBody state={state} disabledText={copy.templates.disabled} onRetry={onRetry}>
        {(data) => (
          <div className="space-y-3">
            {data.usingSystemDefault && (
              <p className="qx-small rounded-md border border-info-border bg-info-subtle px-3 py-2 text-fg">{copy.templates.systemDefault}</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {data.groups.map((g) => (
                <section key={g.locationId ?? 'business'} className="rounded-lg border border-subtle bg-surface-0 p-3" aria-label={g.locationId ? copy.templates.location(g.locationName) : copy.templates.business}>
                  <h3 className="qx-small mb-2 flex items-center gap-1.5 font-semibold text-fg">
                    {g.locationId ? <MapPin className="h-4 w-4 text-fg-muted" aria-hidden /> : <Building2 className="h-4 w-4 text-fg-muted" aria-hidden />}
                    {g.locationId ? copy.templates.location(g.locationName) : copy.templates.business}
                  </h3>
                  {g.options.length === 0 ? (
                    <p className="qx-caption text-fg-muted">{copy.templates.noActive}</p>
                  ) : (
                    <dl className="space-y-1.5">
                      {g.options.map((o) => (
                        <div key={o.type} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <dt className="qx-small text-fg">{o.label}</dt>
                          <dd className="qx-small font-medium tabular-nums text-fg">{o.summary}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {g.inactiveCount > 0 && <p className="qx-caption mt-2 text-fg-muted">{copy.templates.inactive(g.inactiveCount)}</p>}
                </section>
              ))}
            </div>
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}
