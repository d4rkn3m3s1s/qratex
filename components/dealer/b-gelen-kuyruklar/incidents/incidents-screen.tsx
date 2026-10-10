'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionTabs } from '@/components/ds/page';
import { DetailSheet, MetricGrid, MetricTile } from '@/components/ds/data';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { INCIDENT_GROUPS, INCIDENT_SEVERITIES, type IncidentSeverity, type IncidentTypeGroup, type RootCause } from '@/lib/dealer-queues/incident-catalog';
import type { AssigneeDto, IncidentItem, IncidentListResponse, RadarStatus } from '@/lib/dealer-queues/types';
import { fetchJson, queueKeys, useDebounced, useShallowParams } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { SearchField, useAssignees } from '../shared/ui';
import { useIncidentCopy } from './copy';
import { IncidentRow } from './incident-row';
import { IncidentDetailBody, useIncidentDetail, useIncidentMutations } from './incident-detail';
import { RadarPanel } from './radar-panel';
import { ResolveDialog } from './resolve-dialog';
import { CreateIncidentDialog } from './create-incident-dialog';

const VIEWS = ['open', 'mine', 'table', 'resolved'] as const;
type View = (typeof VIEWS)[number];

export interface IncidentsInitial {
  view: View;
  severity: IncidentSeverity | 'all';
  group: IncidentTypeGroup | 'all';
  q: string;
  page: number;
  list: IncidentListResponse | null;
  radar: RadarStatus | null;
  assignees: AssigneeDto[] | null;
  meId: string;
  readOnly: boolean;
}

const asView = (v: string | null): View => ((VIEWS as readonly string[]).includes(v ?? '') ? (v as View) : 'open');
const asSeverity = (v: string | null): IncidentSeverity | 'all' =>
  (INCIDENT_SEVERITIES as readonly string[]).includes(v ?? '') ? (v as IncidentSeverity) : 'all';
const asGroup = (v: string | null): IncidentTypeGroup | 'all' => ((INCIDENT_GROUPS as readonly string[]).includes(v ?? '') ? (v as IncidentTypeGroup) : 'all');

function listUrl(view: View, severity: string, group: string, q: string, page: number): string {
  const sp = new URLSearchParams({ view, page: String(page) });
  if (severity !== 'all') sp.set('severity', severity);
  if (group !== 'all') sp.set('group', group);
  if (q) sp.set('q', q);
  return `/api/dealer/queues/incidents?${sp.toString()}`;
}

/** Vakalar istemci adası: radar + özet + sekmeler + filtreler (URL'de sığ) + sayfalı liste + detay çekmecesi. */
export function IncidentsScreen({ initial }: { initial: IncidentsInitial }) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const motion = useMotionPolicy();
  const qc = useQueryClient();
  const { params, set } = useShallowParams();
  const assigneesQ = useAssignees(initial.assignees, !initial.readOnly);
  const { safePatch, patch } = useIncidentMutations();

  const view = asView(params.get('view') ?? initial.view);
  const severity = asSeverity(params.get('severity') ?? initial.severity);
  const group = asGroup(params.get('group') ?? initial.group);
  const page = Math.max(1, Number(params.get('page') ?? initial.page) || 1);
  const detailId = params.get('id');
  const [qInput, setQInput] = useState(params.get('q') ?? initial.q);
  const q = useDebounced(qInput.trim().slice(0, 80));
  const firstQ = useRef(true);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
    }
    set({ q: q || null, page: null });
  }, [q, set]);

  const matchesInitial =
    view === initial.view && severity === initial.severity && group === initial.group && q === initial.q && page === initial.page;
  const list = useQuery({
    queryKey: queueKeys.incidentList(view, severity, group, q, page),
    queryFn: ({ signal }) => fetchJson<IncidentListResponse>(listUrl(view, severity, group, q, page), { signal }),
    initialData: matchesInitial && initial.list ? initial.list : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Filtre sonrası sayfa aralık dışına düştüyse son sayfaya çekil (bulgu 6).
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && page > d.totalPages) set({ page: d.totalPages > 1 ? String(d.totalPages) : null });
  }, [list.data, page, set]);

  const summary = list.data?.summary ?? initial.list?.summary ?? null;
  const items = list.data?.items ?? [];

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<IncidentItem | null>(null);
  const [creating, setCreating] = useState(false);

  const claim = async (item: IncidentItem) => {
    setBusy((b) => ({ ...b, [item.id]: true }));
    await safePatch(item.id, { assignedToId: initial.meId, status: 'in_progress' }, copy.claimed);
    setBusy((b) => ({ ...b, [item.id]: false }));
  };

  const tabs = VIEWS.map((v) => ({
    value: v,
    label: copy.views[v],
    count: summary ? (v === 'open' ? summary.open : v === 'mine' ? summary.mine : v === 'table' ? summary.table : undefined) : undefined,
  }));
  const filtered = severity !== 'all' || group !== 'all' || q.length > 0;
  const exit = motion.reduce
    ? { opacity: 0, transition: { duration: 0 } }
    : { opacity: 0, height: 0, transition: { duration: DURATION.base, ease: EASE.exit } };

  const detailQ = useIncidentDetail(detailId);
  const sheetTitle = useMemo(() => {
    const fromList = items.find((i) => i.id === detailId)?.title;
    return fromList ?? (detailQ.data?.id === detailId ? detailQ.data?.title : null) ?? copy.detailTitle;
  }, [items, detailId, detailQ.data, copy.detailTitle]);

  return (
    <section aria-labelledby="incidents-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="incidents-title" className="qx-h2 flex items-center gap-2 text-fg">
            <AlertTriangle aria-hidden className="h-5 w-5 text-brand" />
            {copy.sectionTitle}
          </h2>
          <p className="qx-small max-w-2xl text-fg-muted">{copy.sectionDescription}</p>
        </div>
        {!initial.readOnly ? (
          <Button className="shadow-none" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
            {copy.newIncident}
          </Button>
        ) : null}
      </div>

      <RadarPanel initial={initial.radar} readOnly={initial.readOnly} />

      <MetricGrid cols={4}>
        <MetricTile label={copy.metrics.open} metric={{ value: summary?.open ?? null }} tone="brand" size="compact" />
        <MetricTile
          label={copy.metrics.urgent}
          metric={{ value: summary?.urgent ?? null }}
          tone={summary && summary.urgent > 0 ? 'danger' : 'neutral'}
          size="compact"
        />
        <MetricTile
          label={copy.metrics.overdue}
          metric={{ value: summary?.overdue ?? null }}
          tone={summary && summary.overdue > 0 ? 'warning' : 'neutral'}
          size="compact"
        />
        <MetricTile
          label={copy.metrics.mttr}
          metric={{ value: summary?.mttrSeconds ?? null, format: 'duration' }}
          hint={summary ? `${copy.metrics.mttrHint(summary.mttrSample)} · ${copy.metrics.resolved7d(summary.resolved7d)}` : undefined}
          size="compact"
        />
      </MetricGrid>

      <SectionTabs
        tabs={tabs}
        value={view}
        onValueChange={(v) => set({ view: v === 'open' ? null : v, page: null, id: null })}
        ariaLabel={copy.viewsAria}
        touchTarget
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChoiceChips
          aria-label={copy.severityAria}
          size="sm"
          scroll
          options={[{ value: 'all', label: copy.allSeverities }, ...INCIDENT_SEVERITIES.map((s) => ({ value: s, label: shared.severity[s] }))]}
          value={severity}
          onChange={(v) => set({ severity: v && v !== 'all' ? v : null, page: null })}
        />
        <ChoiceChips
          aria-label={copy.groupAria}
          size="sm"
          scroll
          options={[{ value: 'all', label: copy.allGroups }, ...INCIDENT_GROUPS.map((g) => ({ value: g, label: shared.group[g] }))]}
          value={group}
          onChange={(v) => set({ group: v && v !== 'all' ? v : null, page: null })}
        />
        <SearchField value={qInput} onChange={setQInput} label={copy.searchLabel} />
      </div>

      <QueryState
        query={list}
        skeleton="list"
        isEmpty={(d) => d.items.length === 0}
        empty={
          filtered ? (
            <EmptyState
              variant="filtered"
              title={copy.emptyFiltered}
              description={null}
              secondaryAction={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQInput('');
                    set({ severity: null, group: null, q: null, page: null });
                  }}
                >
                  {shared.clearFilters}
                </Button>
              }
            />
          ) : (
            <EmptyState variant={view === 'open' ? 'first-use' : 'default'} title={copy.empty[view].title} description={copy.empty[view].body} />
          )
        }
      >
        {(d) => (
          <div className="space-y-3">
            <ul className="space-y-3" aria-label={copy.views[view]}>
              <AnimatePresence initial={false}>
                {d.items.map((item) => (
                  <m.li key={item.id} layout={!motion.reduce} exit={exit} className="list-none">
                    <IncidentRow
                      item={item}
                      meId={initial.meId}
                      readOnly={initial.readOnly}
                      busy={Boolean(busy[item.id])}
                      onOpen={() => set({ id: item.id }, 'push')}
                      onClaim={() => void claim(item)}
                      onResolve={() => setResolving(item)}
                    />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            {d.totalPages > 1 ? (
              <nav className="flex items-center justify-between gap-2" aria-label={shared.pageOf(d.page, d.totalPages)}>
                <Button variant="outline" disabled={d.page <= 1} onClick={() => set({ page: d.page - 1 > 1 ? String(d.page - 1) : null })} aria-label={shared.previousPage}>
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </Button>
                <span className="qx-small text-fg-muted" aria-live="polite">
                  {shared.pageOf(d.page, d.totalPages)}
                </span>
                <Button variant="outline" disabled={d.page >= d.totalPages} onClick={() => set({ page: String(d.page + 1) })} aria-label={shared.nextPage}>
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </Button>
              </nav>
            ) : null}
          </div>
        )}
      </QueryState>

      <DetailSheet
        open={Boolean(detailId)}
        id={detailId}
        onOpenChange={(o) => (!o ? set({ id: null }) : undefined)}
        onNavigate={(next) => set({ id: next })}
        siblings={items.map((i) => i.id)}
        size="lg"
        title={() => sheetTitle}
      >
        {(id) => (
          <IncidentDetailBody id={id} readOnly={initial.readOnly} meId={initial.meId} isOwner={!initial.readOnly} assignees={assigneesQ.data} />
        )}
      </DetailSheet>

      <ResolveDialog
        open={resolving !== null}
        onOpenChange={(o) => (!o ? setResolving(null) : undefined)}
        incident={resolving}
        onConfirm={async (input: { resolutionNote: string | null; rootCause: RootCause | null }) => {
          if (!resolving) return;
          await patch(resolving.id, { status: 'resolved', ...input }, copy.resolved);
        }}
      />

      <CreateIncidentDialog
        open={creating}
        onOpenChange={setCreating}
        assignees={assigneesQ.data}
        onCreated={(detail) => {
          qc.setQueryData(queueKeys.incidentDetail(detail.id), detail);
          void qc.invalidateQueries({ queryKey: queueKeys.incidents });
          void qc.invalidateQueries({ queryKey: queueKeys.work });
          toast.success(copy.created);
          announce(copy.created);
          set({ id: detail.id }, 'push');
        }}
      />
    </section>
  );
}
