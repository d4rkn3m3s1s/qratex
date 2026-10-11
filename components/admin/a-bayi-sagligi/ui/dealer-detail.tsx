'use client';

/**
 * Detay çekmecesi içeriği — "neden bu skor, ne yapmalı": skor dökümü, bağlamlı öneriler
 * (playbook uygula / CSM görevi aç), 12 haftalık eğilim, kötü yorumlar, olaylar, telafi, görevler.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ClipboardList, LifeBuoy, ListChecks, MessageSquareWarning, ShieldAlert, Siren, Star, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState, TONE_TEXT } from '@/components/states';
import { KeyValueList, SeverityBadge, Sparkline, StatusBadge, toSeverity } from '@/components/ds/data';
import { getPlaybookById } from '@/lib/growth-playbooks';
import { cn } from '@/lib/utils';
import type { HealthWindow, Recommendation } from '../domain';
import { fetchDealerDetail, type DealerHealthDetail } from '../client/api';
import type { HealthCopy } from '../copy';
import { ComponentBreakdown, DeltaChip, ScoreBadge } from './score-parts';
import { CsmSection } from './csm-section';
import type { ApplyTarget } from './apply-dialog';

function fmtDate(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function Block({ title, icon, children, id }: { title: string; icon: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <span aria-hidden className="text-fg-muted">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DealerDetail({
  dealerId,
  window,
  c,
  locale,
  onApply,
}: {
  dealerId: string;
  window: HealthWindow;
  c: HealthCopy;
  locale: 'tr' | 'en';
  onApply: (t: ApplyTarget) => void;
}) {
  const q = useQuery({
    queryKey: ['dealer-health', 'detail', dealerId, window],
    queryFn: ({ signal }) => fetchDealerDetail(dealerId, window, signal),
    staleTime: 30_000,
  });
  return (
    <QueryState query={q} skeleton="detail" isEmpty={() => false} error={{ title: c.errors.detail }}>
      {(d) => <DetailBody d={d} c={c} locale={locale} onApply={onApply} />}
    </QueryState>
  );
}

function DetailBody({ d, c, locale, onApply }: { d: DealerHealthDetail; c: HealthCopy; locale: 'tr' | 'en'; onApply: (t: ApplyTarget) => void }) {
  const r = d.row;
  const [csmOpen, setCsmOpen] = useState(false);
  const [csmNote, setCsmNote] = useState('');
  const openCsm = (note: string) => {
    setCsmNote(note);
    setCsmOpen(true);
    requestAnimationFrame(() => document.getElementById(`csm-${r.dealerId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const first = d.trend[0]?.activity ?? 0;
  const last = d.trend[d.trend.length - 1]?.activity ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ScoreBadge score={r.score} band={r.band} c={c} size="lg" />
        <DeltaChip delta={r.delta} c={c} />
        {r.confidence === 'low' && (
          <StatusBadge label={c.table.lowConfidence} tone="neutral" size="sm" title={c.table.lowConfidenceHint(r.reviews)} />
        )}
        {r.silent && <StatusBadge label={c.table.silent} tone="warning" size="sm" />}
      </div>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: c.detail.email, value: r.email },
          { label: c.detail.copyId, value: r.dealerId, copyValue: r.dealerId, mono: true },
          { label: c.detail.joined, value: fmtDate(d.dealer.createdAt, locale) },
          { label: c.detail.fraud, value: c.fraud[r.fraudStatus] ?? r.fraudStatus },
          { label: c.detail.category, value: d.dealer.businessCategory },
          { label: c.detail.subscription, value: d.dealer.subscriptionStatus },
        ]}
      />

      <Block title={c.breakdown.title} icon={<ListChecks className="h-4 w-4" />} id={`bd-${r.dealerId}`}>
        <p className="text-xs text-fg-muted">{c.breakdown.desc}</p>
        <ComponentBreakdown components={r.components} fraudPenalty={r.fraudPenalty} c={c} />
      </Block>

      <Block title={c.detail.recommendations} icon={<TrendingUp className="h-4 w-4" />} id={`rc-${r.dealerId}`}>
        {r.recommendations.length === 0 ? (
          <p className="text-sm text-fg-muted">{c.detail.noRecommendations}</p>
        ) : (
          <ul className="space-y-2">
            {r.recommendations.map((rec) => (
              <RecoItem key={`${rec.kind}-${rec.id}`} rec={rec} c={c} onApply={() => {
                if (rec.kind !== 'playbook') return;
                onApply({ playbookId: rec.id, playbookTitle: getPlaybookById(rec.id)?.title ?? rec.id, dealerId: r.dealerId });
              }} onTask={(note) => openCsm(note)} />
            ))}
          </ul>
        )}
      </Block>

      <Block title={c.detail.trend} icon={<TrendingUp className="h-4 w-4" />} id={`tr-${r.dealerId}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-fg-muted">{c.detail.trendActivity}</p>
            <Sparkline data={d.trend.map((w) => w.activity)} zeroBased area showLast height={40} label={c.detail.trendSummary(first, last)} />
            <p className="mt-1 text-xs tabular-nums text-fg-subtle">{c.detail.trendSummary(first, last)}</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-fg-muted">{c.detail.trendRating}</p>
            <Sparkline data={d.trend.map((w) => w.avgRating)} tone="info" showLast height={40} />
            <p className="mt-1 text-xs tabular-nums text-fg-subtle">
              {d.trend
                .map((w) => w.avgRating)
                .filter((x): x is number => x != null)
                .slice(-1)
                .map((x) => x.toFixed(2))[0] ?? c.table.none}
            </p>
          </div>
        </div>
      </Block>

      <Block title={c.detail.lowReviews} icon={<MessageSquareWarning className="h-4 w-4" />} id={`lr-${r.dealerId}`}>
        {d.lowReviews.length === 0 ? (
          <p className="text-sm text-fg-muted">{c.detail.noLowReviews}</p>
        ) : (
          <ul className="space-y-2">
            {d.lowReviews.map((lr) => (
              <li key={lr.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <span className={cn('inline-flex items-center gap-1 font-medium', TONE_TEXT.danger)}>
                    <Star aria-hidden className="h-3.5 w-3.5" />
                    {lr.rating}/5
                  </span>
                  <span>{lr.channel === 'qr' ? c.detail.channelQr : c.detail.channelConsumption}</span>
                  <span>{fmtDate(lr.createdAt, locale)}</span>
                  <StatusBadge size="sm" label={lr.replied ? c.detail.replied : c.detail.unreplied} tone={lr.replied ? 'success' : 'warning'} />
                </div>
                {lr.text && <p className="mt-1.5 text-fg">{lr.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <div className="grid gap-6 sm:grid-cols-2">
        <Block title={c.detail.incidents} icon={<Siren className="h-4 w-4" />} id={`in-${r.dealerId}`}>
          {d.incidents.length === 0 ? (
            <p className="text-sm text-fg-muted">{c.detail.noIncidents}</p>
          ) : (
            <ul className="space-y-2">
              {d.incidents.map((i) => (
                <li key={i.id} className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={toSeverity(i.severity)} size="sm" />
                    <span className="text-xs text-fg-muted">{c.incidentStatus[i.status] ?? i.status}</span>
                  </div>
                  <p className="text-fg">{i.title}</p>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title={c.detail.remedies} icon={<LifeBuoy className="h-4 w-4" />} id={`rm-${r.dealerId}`}>
          {d.remedies.length === 0 ? (
            <p className="text-sm text-fg-muted">{c.detail.noRemedies}</p>
          ) : (
            <ul className="space-y-2">
              {d.remedies.map((m) => {
                const hours = Math.round((Date.now() - Date.parse(m.createdAt)) / 3_600_000);
                return (
                  <li key={m.id} className="text-sm">
                    <p className={cn('text-xs font-medium', hours >= 48 ? TONE_TEXT.danger : 'text-fg-muted')}>{c.detail.waiting(c.table.hours(hours))}</p>
                    <p className="line-clamp-2 text-fg">{m.message}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
      </div>

      <div id={`csm-${r.dealerId}`} className="scroll-mt-4">
        <Block title={c.detail.csm} icon={<ClipboardList className="h-4 w-4" />} id={`cs-${r.dealerId}`}>
          <CsmSection
            dealerId={r.dealerId}
            window={d.window}
            tasks={d.csmTasks}
            c={c}
            locale={locale}
            formOpen={csmOpen}
            onFormOpenChange={setCsmOpen}
            initialNote={csmNote}
          />
        </Block>
      </div>

      <Block title={c.detail.playbookHistory} icon={<BookOpen className="h-4 w-4" />} id={`ph-${r.dealerId}`}>
        {d.playbookCampaigns.length === 0 ? (
          <EmptyState compact headingLevel="p" title={c.detail.noPlaybookHistory} />
        ) : (
          <ul className="space-y-2">
            {d.playbookCampaigns.map((pc) => (
              <li key={pc.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-medium text-fg">{pc.playbookTitle ?? pc.playbookId}</p>
                <p className="text-fg-muted">{pc.title}</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {fmtDate(pc.createdAt, locale)} · {pc.status}
                  {pc.sentAt ? ` · ${c.detail.sentTo(pc.sentCount)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function RecoItem({ rec, c, onApply, onTask }: { rec: Recommendation; c: HealthCopy; onApply: () => void; onTask: (note: string) => void }) {
  const isPb = rec.kind === 'playbook';
  const title = isPb ? (getPlaybookById(rec.id)?.title ?? rec.id) : c.recos.action[rec.id].title;
  const why = isPb ? c.recos.playbook[rec.id](rec.evidence) : c.recos.action[rec.id].why(rec.evidence);
  return (
    <li className="rounded-xl border border-border bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {isPb ? <BookOpen aria-hidden className="h-4 w-4 text-brand" /> : <ShieldAlert aria-hidden className="h-4 w-4 text-fg-muted" />}
        <p className="text-sm font-semibold text-fg">{title}</p>
        <StatusBadge size="sm" icon={null} label={c.recos.priority[rec.priority]} tone={rec.priority === 'high' ? 'danger' : 'warning'} />
      </div>
      <p className="mt-1 text-sm text-fg-muted">{why}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {isPb && (
          <Button size="sm" className="min-h-11 sm:min-h-9" onClick={onApply}>
            {c.recos.applyPlaybook}
          </Button>
        )}
        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onTask(`${title}: ${why}`)}>
          {c.recos.openTask}
        </Button>
      </div>
    </li>
  );
}
