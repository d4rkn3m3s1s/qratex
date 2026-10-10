'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import { toast } from 'sonner';
import { Info, ListChecks, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionTabs } from '@/components/ds/page';
import { DetailSheet, MetricGrid, MetricTile } from '@/components/ds/data';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import {
  WORK_KIND_FILTERS,
  WORK_SCOPES,
  normalizeWorkKind,
  normalizeWorkScope,
  type WorkKindFilter,
  type WorkScope,
} from '@/lib/dealer-queues/work-core';
import type { AssigneeDto, TaskDetail, WorkItem, WorkListResponse } from '@/lib/dealer-queues/types';
import { fetchJson, queueKeys, sendJson, useDebounced, useShallowParams } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { TaskDialog } from '../shared/task-dialog';
import { SearchField, useAssignees } from '../shared/ui';
import { useIncidentMutations } from '../incidents/incident-detail';
import { useAssignedCopy } from './copy';
import { WorkRow } from './work-row';
import { TaskDetailBody, useTaskMutations } from './task-detail';
import { SuggestionsPanel } from './suggestions-panel';

export interface AssignedInitial {
  scope: WorkScope;
  kind: WorkKindFilter;
  q: string;
  list: WorkListResponse | null;
  assignees: AssigneeDto[] | null;
  meId: string;
  readOnly: boolean;
}

function listUrl(scope: WorkScope, kind: WorkKindFilter, q: string, offset: number): string {
  const sp = new URLSearchParams({ scope, offset: String(offset) });
  if (kind !== 'all') sp.set('kind', kind);
  if (q) sp.set('q', q);
  return `/api/dealer/queues/work?${sp.toString()}`;
}

const incidentHref = (id: string) => `/dealer/inbox/incidents?id=${encodeURIComponent(id)}`;

/**
 * Bana atananlar istemci adası: özet + kapsam sekmeleri + tür filtresi + arama (URL'de sığ) +
 * "Daha fazla" sayfalı birleşik liste + görev detay çekmecesi + önerilen işler.
 * Vakalar Vakalar sekmesinin çekmecesinde açılır/çözülür (tek doğruluk yeri; çözüm notu kuralı orada).
 */
export function AssignedScreen({ initial }: { initial: AssignedInitial }) {
  const copy = useAssignedCopy();
  const shared = useSharedCopy();
  const motion = useMotionPolicy();
  const router = useRouter();
  const qc = useQueryClient();
  const { params, set } = useShallowParams();
  const assigneesQ = useAssignees(initial.assignees, !initial.readOnly);
  const tasks = useTaskMutations();
  const incidents = useIncidentMutations();

  const scope = normalizeWorkScope(params.get('scope') ?? initial.scope);
  const kind = normalizeWorkKind(params.get('kind') ?? initial.kind);
  // `?id=task-<id>` (vaka detayındaki bağlantı) ve çıplak `?id=<id>` aynı çekmeceyi açar.
  const rawId = params.get('id');
  const detailId = rawId?.startsWith('task-') ? rawId.slice(5) : rawId;
  const [qInput, setQInput] = useState(params.get('q') ?? initial.q);
  const q = useDebounced(qInput.trim().slice(0, 80));
  const firstQ = useRef(true);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
    }
    set({ q: q || null, id: null });
  }, [q, set]);

  const matchesInitial = scope === initial.scope && kind === initial.kind && q === initial.q;
  const list = useInfiniteQuery({
    queryKey: queueKeys.workList(scope, kind, q),
    queryFn: ({ pageParam, signal }) => fetchJson<WorkListResponse>(listUrl(scope, kind, q, pageParam), { signal }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    initialData: matchesInitial && initial.list ? { pages: [initial.list], pageParams: [0] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: WorkItem[] = [];
    for (const p of list.data?.pages ?? []) {
      for (const it of p.items) {
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        out.push(it);
      }
    }
    return out;
  }, [list.data]);
  const first = list.data?.pages[0] ?? initial.list;
  const summary = first?.summary ?? null;
  const incidentsIncluded = first?.incidentsIncluded ?? true;

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const run = async (item: WorkItem, fn: () => Promise<unknown>) => {
    setBusy((b) => ({ ...b, [item.key]: true }));
    try {
      await fn();
    } finally {
      setBusy((b) => ({ ...b, [item.key]: false }));
    }
  };

  const tabs = WORK_SCOPES.map((s) => ({
    value: s,
    label: copy.scopes[s],
    count: summary ? (s === 'mine' ? summary.mine : s === 'team' ? summary.team : s === 'unassigned' ? summary.unassigned : undefined) : undefined,
  }));
  const filtered = kind !== 'all' || q.length > 0;
  const exit = motion.reduce
    ? { opacity: 0, transition: { duration: 0 } }
    : { opacity: 0, height: 0, transition: { duration: DURATION.base, ease: EASE.exit } };
  const taskIds = items.filter((i) => i.kind === 'task').map((i) => i.id);
  const sheetTitle = items.find((i) => i.kind === 'task' && i.id === detailId)?.title ?? copy.detailTitle;

  return (
    <section aria-labelledby="assigned-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="assigned-title" className="qx-h2 flex items-center gap-2 text-fg">
            <ListChecks aria-hidden className="h-5 w-5 text-brand" />
            {copy.sectionTitle}
          </h2>
          <p className="qx-small max-w-2xl text-fg-muted">{copy.sectionDescription}</p>
        </div>
        {!initial.readOnly ? (
          <Button className="shadow-none" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
            {copy.newTask}
          </Button>
        ) : null}
      </div>

      <MetricGrid cols={4}>
        <MetricTile label={copy.metrics.mine} metric={{ value: summary?.mine ?? null }} tone="brand" size="compact" />
        <MetricTile
          label={copy.metrics.overdue}
          metric={{ value: summary?.mineOverdue ?? null }}
          tone={summary && summary.mineOverdue > 0 ? 'danger' : 'neutral'}
          size="compact"
        />
        <MetricTile
          label={copy.metrics.unassigned}
          metric={{ value: summary?.unassigned ?? null }}
          tone={summary && summary.unassigned > 0 ? 'warning' : 'neutral'}
          size="compact"
        />
        <MetricTile label={copy.metrics.closedWeek} metric={{ value: summary?.closedThisWeek ?? null }} tone="success" size="compact" />
      </MetricGrid>

      <SectionTabs
        tabs={tabs}
        value={scope}
        onValueChange={(v) => set({ scope: v === 'mine' ? null : v, id: null })}
        ariaLabel={copy.scopesAria}
        touchTarget
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChoiceChips
          aria-label={copy.kindsAria}
          size="sm"
          options={WORK_KIND_FILTERS.map((k) => ({ value: k, label: copy.kinds[k] }))}
          value={kind}
          onChange={(v) => set({ kind: v && v !== 'all' ? v : null, id: null })}
        />
        <SearchField value={qInput} onChange={setQInput} label={copy.searchLabel} />
      </div>

      {!incidentsIncluded && kind !== 'task' ? (
        <p className="qx-small flex items-center gap-2 rounded-control border border-subtle bg-surface-2 px-3 py-2 text-fg-muted" role="note">
          <Info aria-hidden className="h-4 w-4 shrink-0" />
          {copy.incidentsOff}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <QueryState
            query={list}
            skeleton="list"
            isEmpty={(d) => d.pages.every((p) => p.items.length === 0)}
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
                        set({ kind: null, q: null });
                      }}
                    >
                      {shared.clearFilters}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  variant={scope === 'mine' ? 'first-use' : 'default'}
                  title={copy.empty[scope].title}
                  description={copy.empty[scope].body}
                />
              )
            }
          >
            {() => (
              <div className="space-y-3">
                <ul className="space-y-3" aria-label={copy.scopes[scope]}>
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <m.li key={item.key} layout={!motion.reduce} exit={exit} className="list-none">
                        <WorkRow
                          item={item}
                          meId={initial.meId}
                          readOnly={initial.readOnly}
                          busy={Boolean(busy[item.key])}
                          onOpen={() => (item.kind === 'task' ? set({ id: item.id }, 'push') : router.push(incidentHref(item.id)))}
                          onStart={() => void run(item, () => tasks.safePatch(item.id, { status: 'in_progress' }, copy.started))}
                          onComplete={() => void run(item, () => tasks.safePatch(item.id, { status: 'done' }, copy.completed))}
                          onClaim={() =>
                            void run(item, async () => {
                              await incidents.safePatch(item.id, { assignedToId: initial.meId, status: 'in_progress' }, copy.claimed);
                              void qc.invalidateQueries({ queryKey: queueKeys.work });
                            })
                          }
                          onResolve={() => router.push(incidentHref(item.id))}
                        />
                      </m.li>
                    ))}
                  </AnimatePresence>
                </ul>
                {list.hasNextPage ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                      {list.isFetchingNextPage ? shared.loadingMore : shared.loadMore}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </QueryState>
        </div>

        {!initial.readOnly && scope !== 'closed' ? (
          <aside className="xl:sticky xl:top-4 xl:self-start">
            <SuggestionsPanel
              assignees={assigneesQ.data}
              onCreated={(detail) => {
                qc.setQueryData(queueKeys.taskDetail(detail.id), detail);
                void qc.invalidateQueries({ queryKey: queueKeys.work });
              }}
            />
          </aside>
        ) : null}
      </div>

      <DetailSheet
        open={Boolean(detailId)}
        id={detailId}
        onOpenChange={(o) => (!o ? set({ id: null }) : undefined)}
        onNavigate={(next) => set({ id: next })}
        siblings={taskIds}
        size="lg"
        title={() => sheetTitle}
      >
        {(id) => (
          <TaskDetailBody id={id} readOnly={initial.readOnly} meId={initial.meId} isOwner={!initial.readOnly} assignees={assigneesQ.data} />
        )}
      </DetailSheet>

      <TaskDialog
        open={creating}
        onOpenChange={setCreating}
        title={copy.createTitle}
        description={copy.createBody}
        submitLabel={copy.create}
        textLabel={copy.taskText}
        assignees={assigneesQ.data}
        onSubmit={async (p) => {
          const detail = await sendJson<TaskDetail>('/api/dealer/queues/tasks', 'POST', p);
          qc.setQueryData(queueKeys.taskDetail(detail.id), detail);
          void qc.invalidateQueries({ queryKey: queueKeys.work });
          toast.success(copy.created);
          announce(copy.created);
          set({ id: detail.id }, 'push');
        }}
      />
    </section>
  );
}
