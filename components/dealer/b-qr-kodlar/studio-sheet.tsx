'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Ban, History, RefreshCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, KeyValueList, Sparkline } from '@/components/ds/data';
import { SectionTabs } from '@/components/ds/page';
import { QueryState, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import type { QrLifecycleAction } from '@/lib/dealer/qr-codes/rules';
import { qrDetailKey, type LocationDto, type QrDetailDto } from '@/lib/dealer/qr-codes/types';
import { fetchQrDetail } from './api';
import { STATUS_TONE, fmtDate, fmtDayShort, fmtInt, fmtPct } from './format';
import { useQrCopy } from './copy';
import { PrintPanel } from './print-panel';
import { SettingsPanel } from './settings-panel';

export type StudioTab = 'print' | 'settings' | 'stats' | 'history';

function StatsPanel({ d }: { d: QrDetailDto }) {
  const scans = d.daily.map((x) => x.scans);
  const fbs = d.daily.map((x) => x.feedbacks);
  const best = d.daily.reduce((a, b) => (b.scans > a.scans ? b : a), d.daily[0]);
  const s = d.item.stats;
  const c = useQrCopy().studio;
  return (
    <div className="space-y-5">
      <KeyValueList
        items={[
          { label: c.scans30, value: fmtInt(s.scans) },
          { label: c.feedbacks30, value: fmtInt(s.feedbacks) },
          { label: c.conversion, value: fmtPct(s.conversion) },
          { label: c.avgRating, value: s.avgRating == null ? '—' : `★ ${s.avgRating.toLocaleString('tr-TR')}` },
          { label: c.allTime, value: fmtInt(d.item.feedbackTotal) },
        ]}
      />
      {s.scans === 0 && s.feedbacks === 0 ? (
        <p className="qx-small rounded-md border border-border bg-surface-muted p-3 text-fg-muted">
          {c.quiet}
        </p>
      ) : (
        <>
          <section aria-labelledby="qr-scan-trend" className="space-y-1">
            <h3 id="qr-scan-trend" className="qx-small font-medium text-fg">
              {c.dailyScans}
            </h3>
            <Sparkline data={scans} tone="brand" height={56} area zeroBased label={c.spark30} />
            <p className="qx-caption flex justify-between text-fg-muted">
              <span>{fmtDayShort(d.daily[0].day)}</span>
              {best.scans > 0 && (
                <span>
                  {c.busiest(fmtDayShort(best.day), fmtInt(best.scans))}
                </span>
              )}
              <span>{fmtDayShort(d.daily[d.daily.length - 1].day)}</span>
            </p>
          </section>
          <section aria-labelledby="qr-fb-trend" className="space-y-1">
            <h3 id="qr-fb-trend" className="qx-small font-medium text-fg">
              {c.dailyFb}
            </h3>
            <Sparkline data={fbs} tone="success" height={40} zeroBased label={c.sparkFb30} />
          </section>
          <details className="rounded-md border border-border p-3">
            <summary className="qx-small min-h-11 cursor-pointer content-center font-medium text-fg">{c.table}</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="qx-small w-full text-left">
                <caption className="sr-only">{c.tableCaption}</caption>
                <thead>
                  <tr className="text-fg-muted">
                    <th scope="col" className="py-1 font-medium">{c.day}</th>
                    <th scope="col" className="py-1 text-right font-medium">{c.scans}</th>
                    <th scope="col" className="py-1 text-right font-medium">{c.feedbacks}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.daily].reverse().map((r) => (
                    <tr key={r.day} className="border-t border-border">
                      <th scope="row" className="py-1 font-normal">{fmtDayShort(r.day)}</th>
                      <td className="py-1 text-right tabular-nums">{fmtInt(r.scans)}</td>
                      <td className="py-1 text-right tabular-nums">{fmtInt(r.feedbacks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {d.bySegment.length > 0 && d.bySegment.some((x) => x.segment) && (
        <section aria-labelledby="qr-seg" className="space-y-2">
          <h3 id="qr-seg" className="qx-small font-medium text-fg">
            {c.bySegment}
          </h3>
          <ul className="space-y-1">
            {d.bySegment.map((x) => (
              <li key={x.segment ?? '__plain'} className="qx-small flex justify-between gap-2">
                <span className="font-mono text-fg-muted">{x.segment ?? c.plainQr}</span>
                <span className="tabular-nums text-fg">{fmtInt(x.scans)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HistoryPanel({
  d,
  onLifecycle,
  onOpen,
}: {
  d: QrDetailDto;
  onLifecycle: (action: QrLifecycleAction) => void;
  onOpen: (id: string) => void;
}) {
  const st = d.item.status;
  const live = st !== 'revoked' && st !== 'archived';
  const copy = useQrCopy();
  const c = copy.studio;
  return (
    <div className="space-y-5">
      <KeyValueList
        items={[
          { label: c.created, value: fmtDate(d.item.createdAt) },
          { label: c.expiry, value: d.item.expiresAt ? fmtDate(d.item.expiresAt) : c.none },
          ...(d.item.revokedAt ? [{ label: c.revoked, value: fmtDate(d.item.revokedAt) }] : []),
          ...(d.item.archivedAt ? [{ label: c.archived, value: fmtDate(d.item.archivedAt) }] : []),
        ]}
      />
      {d.successor && (
        <p className="qx-small rounded-md border border-info-border bg-info-subtle p-3 text-fg">
          {c.successor}{' '}
          <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => onOpen(d.successor!.id)}>
            {d.successor.name} ({d.successor.code})
          </button>
        </p>
      )}
      {d.predecessors.length > 0 && (
        <section aria-labelledby="qr-chain" className="space-y-2">
          <h3 id="qr-chain" className="qx-small flex items-center gap-2 font-medium text-fg">
            <History className="h-4 w-4 text-fg-muted" aria-hidden /> {c.chain}
          </h3>
          <ol className="space-y-1">
            {d.predecessors.map((p) => (
              <li key={p.id} className="qx-small flex flex-wrap justify-between gap-2 border-b border-border py-1">
                <button type="button" className="min-h-11 font-mono text-brand underline-offset-2 hover:underline" onClick={() => onOpen(p.id)}>
                  {p.code}
                </button>
                <span className="text-fg-muted">
                  {fmtDate(p.createdAt)} · {copy.common.feedbacks(fmtInt(p.feedbackTotal))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section aria-labelledby="qr-life" className="space-y-2">
        <h3 id="qr-life" className="qx-small font-medium text-fg">
          {c.lifecycle}
        </h3>
        <div className="flex flex-wrap gap-2">
          {live && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onLifecycle('rotate')}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> {copy.card.rotate}
            </Button>
          )}
          {live && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onLifecycle('revoke')}>
              <Ban className="mr-2 h-4 w-4" aria-hidden /> {copy.card.revoke}
            </Button>
          )}
          {st === 'revoked' && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onLifecycle('unrevoke')}>
              <Undo2 className="mr-2 h-4 w-4" aria-hidden /> {copy.card.unrevoke}
            </Button>
          )}
          {st === 'archived' ? (
            <Button type="button" className="min-h-11" onClick={() => onLifecycle('restore')}>
              <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden /> {copy.card.restore}
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onLifecycle('archive')}>
              <Archive className="mr-2 h-4 w-4" aria-hidden /> {copy.card.archive}
            </Button>
          )}
        </div>
        <p className="qx-caption text-fg-muted">{c.neverDeleted}</p>
      </section>
    </div>
  );
}

export function StudioSheet({
  id,
  open,
  onOpenChange,
  tab,
  onTabChange,
  locations,
  onLifecycle,
  onOpen,
  onSaved,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: StudioTab;
  onTabChange: (t: StudioTab) => void;
  locations: LocationDto[];
  onLifecycle: (detail: QrDetailDto, action: QrLifecycleAction) => void;
  onOpen: (id: string) => void;
  onSaved: () => void;
}) {
  const q = useQuery({
    queryKey: qrDetailKey(id ?? ''),
    queryFn: ({ signal }) => fetchQrDetail(id as string, signal),
    enabled: open && !!id,
    staleTime: 15_000,
  });
  const d = q.data;
  const copy = useQrCopy();
  const c = copy.studio;
  const title = d ? d.item.name : c.qrCode;

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      id={id}
      size="xl"
      title={title}
      description={
        d ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('qx-caption rounded-full px-2 py-0.5 font-medium', TONE_CHIP[STATUS_TONE[d.item.status]])}>{copy.status[d.item.status]}</span>
            <span className="qx-caption font-mono text-fg-muted">{d.item.code}</span>
            {d.item.location && <span className="qx-caption text-fg-muted">{d.item.location.name}</span>}
          </span>
        ) : undefined
      }
    >
      <QueryState query={q} skeleton="detail" onRetry={() => q.refetch()}>
        {(detail) => {
          const live = detail.item.status !== 'revoked' && detail.item.status !== 'archived';
          const tabs = [
            ...(live ? [{ value: 'print', label: c.tabPrint }] : []),
            { value: 'settings', label: c.tabSettings },
            { value: 'stats', label: c.tabStats },
            { value: 'history', label: c.tabHistory },
          ];
          const active = !live && tab === 'print' ? 'history' : tab;
          return (
            <SectionTabs
              tabs={tabs}
              value={active}
              onValueChange={(v) => onTabChange(v as StudioTab)}
              ariaLabel={c.tabsAria}
              variant="underline"
              touchTarget
            >
              {(t) =>
                t === 'print' ? (
                  <PrintPanel item={detail.item} links={detail.links} />
                ) : t === 'settings' ? (
                  <SettingsPanel key={`${detail.item.id}:${detail.generatedAt}`} item={detail.item} links={detail.links} locations={locations} onSaved={onSaved} />
                ) : t === 'stats' ? (
                  <StatsPanel d={detail} />
                ) : (
                  <HistoryPanel d={detail} onLifecycle={(a) => onLifecycle(detail, a)} onOpen={onOpen} />
                )
              }
            </SectionTabs>
          );
        }}
      </QueryState>
    </DetailSheet>
  );
}
