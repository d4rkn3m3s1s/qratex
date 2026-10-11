'use client';

import { useState } from 'react';
import { CheckCircle2, Eye, MapPin, RotateCcw, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds';
import { EmptyState } from '@/components/states';
import type { FieldReportDto, TeamHub } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { fmtDateTime, fmtRelative, sendJson } from './shared';
import { useTeamCopy } from './copy';
import { FieldStatusBadge, PersonAvatar, Segmented, useHubMutation } from './parts';

type Filter = 'open' | 'all';

/** Saha akışı: personelin vardiyadan bildirdikleri (arıza, stok, yoğunluk…) → görüldü / çözüldü döngüsü. */
export function FieldPanel({ hub }: { hub: TeamHub }) {
  const { copy } = useTeamCopy();
  const c = copy.field;
  const [filter, setFilter] = useState<Filter>('open');
  const open = hub.fieldReports.filter((r) => r.status !== 'resolved');
  const list = filter === 'open' ? open : hub.fieldReports;

  if (hub.fieldReports.length === 0) return <EmptyState icon={MapPin} title={c.emptyTitle} description={c.emptyDesc} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          label={copy.hub.tabs.field}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: c.filterOpen, count: open.length },
            { value: 'all', label: c.filterAll, count: hub.fieldReports.length },
          ]}
        />
        <p className="qx-caption text-fg-muted">{c.privacy}</p>
      </div>
      {list.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title={c.emptyTitle} />
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <ReportRow report={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: FieldReportDto }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.field;
  const update = useHubMutation(
    (status: 'seen' | 'resolved' | 'open') => sendJson(`/api/dealer/staff/field-reports/${report.id}`, 'PATCH', { status }),
    { success: c.updated }
  );
  const loc = report.location;
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-surface-1 p-4 sm:flex-row sm:items-start',
        report.urgent && report.status === 'open' ? 'border-danger/60' : 'border-subtle'
      )}
      aria-label={`${copy.fieldCategory[report.category]} · ${report.reporter?.name ?? ''}`}
    >
      <PersonAvatar name={report.reporter?.name ?? null} size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{copy.fieldCategory[report.category]}</span>
          {report.urgent && <StatusBadge label={c.urgent} tone="danger" icon={Siren} size="sm" />}
          <FieldStatusBadge status={report.status} />
        </div>
        {report.note && <p className="qx-small whitespace-pre-line text-fg">{report.note}</p>}
        <p className="qx-caption flex flex-wrap gap-x-3 text-fg-muted">
          <span>{report.reporter?.name ?? copy.common.unknown}</span>
          <time dateTime={report.createdAt} title={fmtDateTime(report.createdAt, locale)}>
            {fmtRelative(report.createdAt, locale)}
          </time>
          {loc && (
            <a
              className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline"
              href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {c.location(loc.accuracyM ? ` (≈${loc.accuracyM} m)` : '')} · {c.openMap}
            </a>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {report.status === 'open' && (
          <Button variant="outline" className="min-h-11" disabled={update.isPending} onClick={() => update.mutate('seen')}>
            <Eye className="mr-1.5 h-4 w-4" aria-hidden />
            {c.markSeen}
          </Button>
        )}
        {report.status !== 'resolved' ? (
          <Button className="min-h-11" disabled={update.isPending} onClick={() => update.mutate('resolved')}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            {c.markResolved}
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-11" disabled={update.isPending} onClick={() => update.mutate('open')}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            {c.reopen}
          </Button>
        )}
      </div>
    </article>
  );
}
