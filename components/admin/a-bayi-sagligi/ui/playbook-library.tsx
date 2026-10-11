'use client';

/**
 * Playbook kütüphanesi (eski /admin/playbooks) — her playbook için gerçek benimseme sayıları
 * (uygulandı / açık taslak / gönderildi / ulaşılan kişi), müşteriye giden metin, ve ŞU AN
 * önerildiği en riskli bayiler (aynı sağlık sinyalleri). Uygula → bağlamlı önizlemeli diyalog.
 */
import { useQuery } from '@tanstack/react-query';
import { Bell, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryState, SectionCard } from '@/components/states';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { fetchPlaybookLibrary, type PlaybookLibrary } from '../client/api';
import type { HealthCopy } from '../copy';
import { ScoreBadge } from './score-parts';
import type { ApplyTarget } from './apply-dialog';

export function PlaybookLibraryView({
  c,
  onApply,
  onOpenDealer,
}: {
  c: HealthCopy;
  onApply: (t: ApplyTarget) => void;
  onOpenDealer: (dealerId: string) => void;
}) {
  const q = useQuery({
    queryKey: ['dealer-health', 'playbooks'],
    queryFn: ({ signal }) => fetchPlaybookLibrary(signal),
    staleTime: 60_000,
  });

  return (
    <QueryState query={q} skeleton="cards" error={{ title: c.errors.library }} isEmpty={(d: PlaybookLibrary) => d.items.length === 0}>
      {(lib) => (
        <div className="space-y-6">
          <p className="max-w-3xl text-sm text-fg-muted">{c.library.intro}</p>
          <MetricGrid cols={3}>
            <MetricTile label={c.library.totalsApplied} metric={{ value: lib.totals.applied }} />
            <MetricTile label={c.library.totalsSent} metric={{ value: lib.totals.sent }} />
            <MetricTile label={c.library.totalsMatching} metric={{ value: lib.totals.matchingDealers }} />
          </MetricGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            {lib.items.map((pb) => (
              <SectionCard
                key={pb.id}
                title={pb.title}
                description={pb.summary}
                icon={<BookOpen className="h-4 w-4" />}
                actions={<StatusBadge size="sm" icon={null} tone="brand" label={c.library.categories[pb.category] ?? pb.category} />}
              >
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [c.library.applied, pb.stats.applied],
                      [c.library.openDrafts, pb.stats.openDrafts],
                      [c.library.sent, pb.stats.sent],
                      [c.library.recipients, pb.stats.recipients],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-surface-muted px-2.5 py-2">
                        <dt className="text-xs text-fg-muted">{label}</dt>
                        <dd className="text-base font-semibold tabular-nums text-fg">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <figure className="rounded-xl border border-border bg-surface-2 p-3">
                    <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                      <Bell aria-hidden className="h-3.5 w-3.5" />
                      {c.library.customerMessage} · {c.library.audience}: {c.apply.segments[pb.segment] ?? pb.segment}
                    </figcaption>
                    <p className="text-sm font-semibold text-fg">{pb.customerTitle.replace(/\{\{\s*isletme\s*\}\}/g, '…')}</p>
                    <p className="mt-1 text-sm text-fg-muted">{pb.customerMessage}</p>
                  </figure>

                  <details className="group rounded-lg">
                    <summary className="min-h-11 cursor-pointer list-none rounded-lg py-2 text-sm font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus">
                      <span className="underline-offset-2 group-open:underline">{c.library.dealerActions}</span>
                    </summary>
                    <div className="space-y-3 pb-1 text-sm">
                      <Bullets title={c.library.triggers} items={pb.triggers} />
                      <Bullets title={c.library.dealerActions} items={pb.dealerActions} />
                      <Bullets title={c.library.customerIdeas} items={pb.customerIdeas} />
                      <Bullets title={c.library.metrics} items={pb.metricsToWatch} />
                    </div>
                  </details>

                  <div>
                    <p className="mb-2 text-sm font-medium text-fg">
                      {c.library.topMatches} <span className="text-fg-muted">({c.library.matching}: {pb.matching.count})</span>
                    </p>
                    {pb.matching.top.length === 0 ? (
                      <p className="text-sm text-fg-muted">{c.library.noMatches}</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {pb.matching.top.map((m) => (
                          <li key={m.dealerId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => onOpenDealer(m.dealerId)}
                              className="min-h-11 min-w-0 flex-1 truncate rounded text-left text-sm font-medium text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                              {m.label}
                            </button>
                            <ScoreBadge score={m.score} band={m.band} c={c} size="sm" />
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11 sm:min-h-9"
                              aria-label={c.library.applyTo(m.label)}
                              onClick={() => onApply({ playbookId: pb.id, playbookTitle: pb.title, dealerId: m.dealerId })}
                            >
                              {c.recos.applyPlaybook}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        </div>
      )}
    </QueryState>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
