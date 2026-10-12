'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BarChart3, CalendarClock, Copy, Eye, Footprints, Loader2, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader, SectionCard, useUrlState } from '@/components/ds/page';
import { ChartFrame, KeyValueList, MetricGrid, MetricTile, lazyChart, type ChartColumn } from '@/components/ds/data';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { ATTRIBUTION_WINDOWS, parseWindow, type AttributionWindow } from '../domain';
import type { CampaignPerformance, OutcomeDto, TimelinePoint } from '../types';
import { campaignApi, campaignKeys } from '../client/api';
import { useCampaignCopy } from '../client/use-copy';
import { fmtDate, fmtDateTime, fmtDay, fmtMoney, fmtNumber, fmtPct } from '../copy';
import { CampaignStatusBadge, SegmentChip } from './badges';
import { Funnel } from './funnel';

const TimelineChart = lazyChart(() => import('./timeline-chart'));

export type PerformanceScreenProps = {
  campaignId: string;
  dealerId: string | null;
  readOnly: boolean;
};

function listHref(dealerId: string | null, tab?: string): string {
  const sp = new URLSearchParams();
  if (tab) sp.set('tab', tab);
  if (dealerId) sp.set('dealerId', dealerId);
  const qs = sp.toString();
  return `/dealer/campaigns${qs ? `?${qs}` : ''}`;
}

export function PerformanceScreen({ campaignId, dealerId, readOnly }: PerformanceScreenProps) {
  const { c, locale } = useCampaignCopy();
  const url = useUrlState();
  const router = useRouter();
  const win = parseWindow(url.get('window'));
  const [duplicating, setDuplicating] = useState(false);

  const perf = useQuery({
    queryKey: campaignKeys.performance(dealerId, campaignId, win),
    queryFn: ({ signal }) => campaignApi.performance(dealerId, campaignId, win, signal),
    staleTime: 60_000,
  });
  const data = perf.data;
  const campaign = data?.campaign;

  async function duplicate() {
    setDuplicating(true);
    try {
      const r = await campaignApi.duplicate(campaignId, c.confirm.copySuffix);
      toast.success(c.confirm.duplicated);
      router.push(`${listHref(dealerId)}${dealerId ? '&' : '?'}edit=${encodeURIComponent(r.campaign.id)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : c.errors.generic);
      setDuplicating(false);
    }
  }

  const header = (
    <PageHeader
      eyebrow={c.perf.eyebrow}
      title={campaign?.title ?? c.perf.eyebrow}
      breadcrumbs={[{ label: c.perf.crumbs, href: listHref(dealerId) }, { label: campaign?.title ?? '…', textLabel: campaign?.title }]}
      back={{ href: listHref(dealerId, campaign?.status === 'archived' ? 'archived' : campaign?.status === 'sent' ? 'sent' : undefined), label: c.perf.back }}
      meta={
        campaign ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <CampaignStatusBadge status={campaign.status} />
            <SegmentChip segment={campaign.segment} />
            {campaign.sentAt && campaign.status !== 'scheduled' && (
              <span className="qx-caption text-fg-muted">{c.perf.sentOn(fmtDateTime(campaign.sentAt, locale))}</span>
            )}
          </div>
        ) : undefined
      }
      actions={
        readOnly ? null : (
          <Button variant="outline" onClick={() => void duplicate()} disabled={duplicating} className="w-full gap-2 sm:w-auto">
            {duplicating ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Copy aria-hidden className="h-4 w-4" />}
            {c.perf.duplicate}
          </Button>
        )
      }
    />
  );

  return (
    <PanelPage register="ops" header={header}>
      <QueryState<CampaignPerformance> query={perf} skeleton="detail" showRefreshing>
        {(d) =>
          d.state === 'not-sent' ? (
            <EmptyState
              variant="first-use"
              icon={CalendarClock}
              title={c.perf.notSentTitle}
              description={
                d.campaign.status === 'scheduled' && d.campaign.sentAt
                  ? c.perf.scheduledBody(fmtDate(d.campaign.sentAt, locale, { day: 'numeric', month: 'long' }))
                  : c.perf.notSentBody
              }
              action={
                <Button asChild variant="outline">
                  <Link href={listHref(dealerId)}>{c.perf.toList}</Link>
                </Button>
              }
            />
          ) : d.state === 'legacy' ? (
            <EmptyState variant="default" icon={BarChart3} title={c.perf.legacyTitle} description={c.perf.legacyBody} />
          ) : (
            <ReadyView data={d} win={win} onWindow={(w) => url.set({ window: w === 14 ? null : String(w) })} />
          )
        }
      </QueryState>
    </PanelPage>
  );
}

function ReadyView({
  data,
  win,
  onWindow,
}: {
  data: CampaignPerformance;
  win: AttributionWindow;
  onWindow: (w: AttributionWindow) => void;
}) {
  const { c, locale } = useCampaignCopy();
  const after = data.after!;
  const delivery = data.delivery!;
  const funnel = data.funnel;
  const opened = funnel.find((f) => f.key === 'opened');

  const timelineRows = useMemo(
    () =>
      data.timeline.map((p: TimelinePoint) => ({
        ...p,
        label: fmtDay(p.day, locale),
      })),
    [data.timeline, locale]
  );
  const beforeVisits = data.timeline.filter((p) => p.offset < 0).reduce((s, p) => s + p.visitors, 0);
  const afterVisits = data.timeline.filter((p) => p.offset >= 0).reduce((s, p) => s + p.visitors, 0);
  const columns: ChartColumn<(typeof timelineRows)[number]>[] = [
    { key: 'label', label: c.perf.day },
    { key: 'visitors', label: c.perf.visitors, numeric: true },
    { key: 'spend', label: c.perf.spendCol, numeric: true, format: (v) => fmtMoney(Number(v) || 0, locale) },
  ];

  return (
    <div className="space-y-section">
      {/* Pencere seçici */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label={c.perf.window} className="inline-flex w-fit rounded-control border border-subtle bg-surface-muted p-0.5">
          {ATTRIBUTION_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={win === w}
              onClick={() => onWindow(w)}
              className={cn(
                'min-h-[44px] rounded-[calc(var(--radius-md)-2px)] px-4 qx-small font-medium transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                win === w ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg'
              )}
            >
              {c.perf.windowDays(w)}
            </button>
          ))}
        </div>
        <p className="qx-caption text-fg-muted" aria-live="polite">
          {data.windowComplete ? c.perf.windowDone(win) : c.perf.windowRunning(Math.min(data.daysElapsed + 1, win), win)}
        </p>
      </div>

      {/* KPI'lar */}
      <MetricGrid cols={4}>
        <MetricTile
          label={c.perf.reach}
          icon={<Users aria-hidden className="h-4 w-4" />}
          tone="brand"
          metric={{ value: delivery.reach }}
          hint={c.perf.reachHint(fmtNumber(delivery.inAppDelivered, locale), fmtNumber(delivery.pushAttempted, locale))}
        />
        <MetricTile
          label={c.perf.opened}
          icon={<Eye aria-hidden className="h-4 w-4" />}
          tone="info"
          metric={{ value: opened?.rate ?? null, format: 'percent', n: delivery.reach }}
          hint={c.row.reach(fmtNumber(opened?.count ?? 0, locale))}
        />
        <MetricTile
          label={c.perf.visited}
          icon={<Footprints aria-hidden className="h-4 w-4" />}
          tone="success"
          metric={{ value: after.visitRate, format: 'percent', n: after.size, minN: data.minSample }}
          hint={c.row.reach(fmtNumber(after.visitors, locale))}
        />
        <MetricTile
          label={c.perf.spend}
          icon={<Wallet aria-hidden className="h-4 w-4" />}
          tone="neutral"
          metric={{ value: after.spend, format: 'currency', fractionDigits: 0 }}
          hint={after.spendPerMember != null ? c.perf.spendHint(fmtMoney(after.spendPerMember, locale)) : undefined}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-section lg:grid-cols-2">
        <SectionCard title={c.perf.funnelTitle} description={c.perf.funnelDesc}>
          <Funnel steps={funnel} />
        </SectionCard>

        <SectionCard title={c.perf.compareTitle} description={c.perf.compareDesc}>
          <ImpactTable data={data} />
        </SectionCard>
      </div>

      <ChartFrame
        title={c.perf.timelineTitle}
        description={c.perf.timelineDesc}
        data={timelineRows}
        columns={columns}
        summary={c.perf.timelineSummary(fmtNumber(beforeVisits, locale), fmtNumber(afterVisits, locale))}
        height={240}
      >
        <TimelineChart data={timelineRows} sendLabel={c.perf.sendDay} visitorsLabel={c.perf.visitors} />
      </ChartFrame>

      <div className="grid grid-cols-1 gap-section lg:grid-cols-2">
        <SectionCard title={c.perf.messageTitle}>
          <p className="qx-body font-semibold text-fg break-words">{data.campaign.title}</p>
          <p className="qx-small mt-1 whitespace-pre-line break-words text-fg-muted">{data.campaign.message}</p>
          {delivery.trigger && <p className="qx-caption mt-3 text-fg-muted">{c.perf.trigger[delivery.trigger]}</p>}
        </SectionCard>
        <SectionCard title={c.perf.deliveryTitle}>
          {delivery.source === 'notifications' && (
            <InlineError variant="banner" tone="info" className="mb-3">
              {c.perf.sourceNotifications}
            </InlineError>
          )}
          <KeyValueList
            items={[
              { id: 'reach', label: c.perf.reach, value: fmtNumber(delivery.reach, locale) },
              {
                id: 'push',
                label: c.perf.pushDelivered,
                value: delivery.pushDelivered == null ? c.perf.unknown : `${fmtNumber(delivery.pushDelivered, locale)} / ${fmtNumber(delivery.pushAttempted, locale)}`,
              },
              { id: 'opt', label: c.perf.optedOut, value: delivery.optedOut == null ? c.perf.unknown : fmtNumber(delivery.optedOut, locale) },
              { id: 'cap', label: c.perf.capped, value: delivery.frequencyCapped == null ? c.perf.unknown : fmtNumber(delivery.frequencyCapped, locale) },
              { id: 'trunc', label: c.perf.truncated, value: delivery.truncated == null ? c.perf.unknown : fmtNumber(delivery.truncated, locale), hidden: !delivery.truncated },
            ]}
            dense
          />
        </SectionCard>
      </div>

      <p className="qx-caption text-fg-muted">{c.perf.definitions}</p>
    </div>
  );
}

function ImpactTable({ data }: { data: CampaignPerformance }) {
  const { c, locale } = useCampaignCopy();
  const rows: Array<{ id: string; label: string; o: OutcomeDto; strong?: boolean }> = [
    { id: 'after', label: c.perf.recipients, o: data.after!, strong: true },
    ...(data.control ? [{ id: 'control', label: c.perf.control(data.control.pct), o: data.control }] : []),
    ...(data.before ? [{ id: 'before', label: c.perf.before, o: data.before }] : []),
  ];
  const small = rows.filter((r) => r.o.size > 0 && r.o.size < data.minSample);
  return (
    <div className="space-y-3">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse qx-small">
          <thead>
            <tr className="border-b border-subtle text-left text-fg-muted">
              <th scope="col" className="px-1 py-2 font-medium">
                <span className="sr-only">{c.perf.compareTitle}</span>
              </th>
              <th scope="col" className="px-1 py-2 text-right font-medium">{c.perf.visitRate}</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">{c.perf.spendPer}</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">{c.perf.rating}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-subtle last:border-b-0">
                <th scope="row" className={cn('px-1 py-2 text-left font-normal text-fg', r.strong && 'font-semibold')}>
                  {r.label}
                  <span className="qx-caption qx-num block text-fg-muted">n = {fmtNumber(r.o.size, locale)}</span>
                </th>
                <td className="qx-num px-1 py-2 text-right text-fg">{fmtPct(r.o.visitRate, locale)}</td>
                <td className="qx-num px-1 py-2 text-right text-fg">{r.o.spendPerMember == null ? '—' : fmtMoney(r.o.spendPerMember, locale)}</td>
                <td className="qx-num px-1 py-2 text-right text-fg">
                  {r.o.avgRating == null ? '—' : fmtNumber(r.o.avgRating, locale, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.liftPoints != null && (
        <p className="qx-small font-medium text-fg">
          {c.perf.lift(`${data.liftPoints > 0 ? '+' : ''}${fmtNumber(data.liftPoints, locale, { maximumFractionDigits: 1 })}`)}
        </p>
      )}
      {!data.control && <p className="qx-caption text-fg-muted">{c.perf.noControl}</p>}
      {small.length > 0 && <p className="qx-caption text-warning">{c.perf.lowSample(data.minSample)}</p>}
    </div>
  );
}
