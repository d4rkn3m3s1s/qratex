'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import { toast } from 'sonner';
import { ClipboardCheck, Send, Settings2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile, DetailSheet } from '@/components/ds/data';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { ConfirmAction, EmptyState, QueryState } from '@/components/states';
import { useMotionPolicy, DURATION, EASE } from '@/lib/motion';
import {
  REMEDY_SOURCE_FILTERS,
  REMEDY_VIEWS,
  normalizeRemedySource,
  normalizeRemedyView,
  type RemedyRejectReason,
  type RemedySourceFilter,
  type RemedyView,
} from '@/lib/dealer-queues/remedy-core';
import type { RemedyActionResult, RemedyBulkResult, RemedyDetail, RemedyListResponse, RemedyQueueItem } from '@/lib/dealer-queues/types';
import { errorMessage, fetchJson, queueKeys, sendJson, useDebounced, useShallowParams } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { SearchField } from '../shared/ui';
import { useRemedyCopy } from './copy';
import { RemedyRow } from './remedy-row';
import { RemedyDetailBody, useRemedyDetail, type DraftState } from './remedy-detail';
import { RejectDialog } from './reject-dialog';

export interface RemedyInitial {
  view: RemedyView;
  source: RemedySourceFilter;
  q: string;
  list: RemedyListResponse | null;
  readOnly: boolean;
}

function listUrl(view: RemedyView, source: RemedySourceFilter, q: string, cursor: string | null): string {
  const sp = new URLSearchParams();
  sp.set('view', view);
  if (source !== 'all') sp.set('source', source);
  if (q) sp.set('q', q);
  if (cursor) sp.set('cursor', cursor);
  return `/api/dealer/queues/remedy?${sp.toString()}`;
}

type ListData = InfiniteData<RemedyListResponse, string | null>;

/**
 * Telafi onayı istemci adası. İlk sayfa + sayaçlar sunucuda çekilip `initialData` olarak gelir;
 * görünüm/kaynak/arama/çekmece URL'de sığ tutulur (sunucu yeniden render edilmez).
 */
export function RemedyScreen({ initial }: { initial: RemedyInitial }) {
  const copy = useRemedyCopy();
  const shared = useSharedCopy();
  const motion = useMotionPolicy();
  const qc = useQueryClient();
  const { params, set } = useShallowParams();

  const view = normalizeRemedyView(params.get('view') ?? initial.view);
  const source = normalizeRemedySource(params.get('source') ?? initial.source);
  const detailId = params.get('id');
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

  const matchesInitial = view === initial.view && source === initial.source && q === initial.q;
  const list = useInfiniteQuery({
    queryKey: queueKeys.remedyList(view, source, q),
    queryFn: ({ pageParam, signal }) => fetchJson<RemedyListResponse>(listUrl(view, source, q, pageParam), { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: matchesInitial && initial.list ? { pages: [initial.list], pageParams: [null] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: RemedyQueueItem[] = [];
    for (const p of list.data?.pages ?? []) for (const it of p.items) if (!seen.has(it.id)) (seen.add(it.id), out.push(it));
    return out;
  }, [list.data]);
  const counts = list.data?.pages[0]?.counts ?? initial.list?.counts ?? null;

  /* ───── Seçim (toplu karar) ───── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [view, source, q]);
  const selectable = view === 'awaiting' && !initial.readOnly;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ───── Önbellek yardımcıları ───── */
  const dropFromLists = useCallback(
    (ids: string[]) => {
      qc.setQueriesData<ListData>({ queryKey: [...queueKeys.remedy, 'list'] }, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((i) => !ids.includes(i.id)) })) } : old
      );
    },
    [qc]
  );
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: queueKeys.remedy }), [qc]);

  /* ───── Kararlar ───── */
  const [busy, setBusy] = useState<Record<string, 'publish' | 'reject'>>({});
  const [confirm, setConfirm] = useState<{ ids: string[]; name: string | null } | null>(null);
  const [rejecting, setRejecting] = useState<{ ids: string[]; name: string | null } | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.customer.name ?? null;

  const saveDraft = useCallback(
    async (id: string, payload: { message?: string; options?: unknown[] }) => {
      setSavingDraft(true);
      try {
        const detail = await sendJson<RemedyDetail>(`/api/dealer/queues/remedy/${encodeURIComponent(id)}`, 'PATCH', payload);
        qc.setQueryData(queueKeys.remedyDetail(id), detail);
        toast.success(copy.draftSaved);
        void refresh();
        return detail;
      } finally {
        setSavingDraft(false);
      }
    },
    [copy.draftSaved, qc, refresh]
  );

  const restore = useCallback(
    async (id: string) => {
      try {
        await sendJson<RemedyActionResult>(`/api/dealer/queues/remedy/${encodeURIComponent(id)}`, 'POST', { action: 'restore' });
        toast.success(copy.restored);
        announce(copy.restored);
        void refresh();
        void qc.invalidateQueries({ queryKey: queueKeys.remedyDetail(id) });
      } catch (err) {
        toast.error(errorMessage(err, shared.failed));
      }
    },
    [copy.restored, qc, refresh, shared.failed]
  );

  const publish = async (ids: string[]) => {
    if (ids.length === 1) {
      const id = ids[0];
      setBusy((b) => ({ ...b, [id]: 'publish' }));
      try {
        // Çekmecede kaydedilmemiş düzenleme varsa önce kaydet (kör onay yok — B1/B6).
        if (detailId === id && draft?.dirty) {
          if (!draft.valid) throw new Error(copy.noOptionSelected);
          await saveDraft(id, { message: draft.message.trim(), options: draft.options });
        }
        await sendJson<RemedyActionResult>(`/api/dealer/queues/remedy/${encodeURIComponent(id)}`, 'POST', { action: 'publish' });
        const name = nameOf(id) ?? '';
        toast.success(copy.published(name));
        announce(copy.published(name));
        dropFromLists([id]);
        setSelected((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        void refresh();
        void qc.invalidateQueries({ queryKey: queueKeys.remedyDetail(id) });
      } finally {
        setBusy((b) => {
          const n = { ...b };
          delete n[id];
          return n;
        });
      }
      return;
    }
    const res = await sendJson<RemedyBulkResult>('/api/dealer/queues/remedy/bulk', 'POST', { action: 'publish', ids });
    toast[res.failed.length ? 'warning' : 'success'](copy.bulkDone(res.done.length, res.failed.length));
    announce(copy.bulkDone(res.done.length, res.failed.length));
    dropFromLists(res.done);
    setSelected(new Set(res.failed.map((f) => f.id)));
    void refresh();
  };

  const reject = async (ids: string[], input: { reason: RemedyRejectReason; note: string | null }) => {
    if (ids.length === 1) {
      const id = ids[0];
      setBusy((b) => ({ ...b, [id]: 'reject' }));
      try {
        await sendJson<RemedyActionResult>(`/api/dealer/queues/remedy/${encodeURIComponent(id)}`, 'POST', { action: 'reject', ...input });
        dropFromLists([id]);
        setSelected((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        announce(copy.rejectedToast);
        toast(copy.rejectedToast, { action: { label: shared.undo, onClick: () => void restore(id) }, duration: 10_000 });
        void refresh();
        void qc.invalidateQueries({ queryKey: queueKeys.remedyDetail(id) });
      } finally {
        setBusy((b) => {
          const n = { ...b };
          delete n[id];
          return n;
        });
      }
      return;
    }
    const res = await sendJson<RemedyBulkResult>('/api/dealer/queues/remedy/bulk', 'POST', { action: 'reject', ids, ...input });
    toast[res.failed.length ? 'warning' : 'success'](copy.bulkDone(res.done.length, res.failed.length));
    announce(copy.bulkDone(res.done.length, res.failed.length));
    dropFromLists(res.done);
    setSelected(new Set(res.failed.map((f) => f.id)));
    void refresh();
  };

  /* ───── Görünüm ───── */
  const tabs = REMEDY_VIEWS.map((v) => ({
    value: v,
    label: copy.views[v],
    count: counts ? (v === 'awaiting' ? counts.awaiting : v === 'sent' ? counts.sent : v === 'accepted' ? counts.accepted : counts.closed) : undefined,
  }));
  const filtered = source !== 'all' || q.length > 0;
  const exit = motion.reduce
    ? { opacity: 0, transition: { duration: 0 } }
    : { opacity: 0, height: 0, marginTop: 0, transition: { duration: DURATION.base, ease: EASE.exit } };

  const detailItem = detailId ? items.find((i) => i.id === detailId) : undefined;
  const detailQ = useRemedyDetail(detailId);
  const cachedDetail = detailQ.data && detailQ.data.id === detailId ? detailQ.data : undefined;
  const sheetStatus = cachedDetail?.status ?? detailItem?.status;

  return (
    <section aria-labelledby="remedy-queue-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="remedy-queue-title" className="qx-h2 flex items-center gap-2 text-fg">
            <ClipboardCheck aria-hidden className="h-5 w-5 text-brand" />
            {copy.sectionTitle}
          </h2>
          <p className="qx-small max-w-2xl text-fg-muted">{copy.sectionDescription}</p>
        </div>
        <Button asChild variant="outline" className="shadow-none">
          <Link href="/dealer/automation/remedy">
            <Settings2 aria-hidden className="mr-2 h-4 w-4" />
            {copy.automationLink}
          </Link>
        </Button>
      </div>

      <MetricGrid cols={4}>
        <MetricTile
          label={copy.metrics.awaiting}
          metric={{ value: counts?.awaiting ?? null }}
          tone={counts && counts.staleAwaiting > 0 ? 'warning' : 'brand'}
          hint={counts && counts.staleAwaiting > 0 ? copy.metrics.staleHint(counts.staleAwaiting) : undefined}
          size="compact"
        />
        <MetricTile label={copy.metrics.oldest} metric={{ value: counts?.oldestAwaitingSeconds ?? null, format: 'duration' }} size="compact" />
        <MetricTile label={copy.metrics.acceptedMonth} metric={{ value: counts?.acceptedThisMonth ?? null }} tone="success" size="compact" />
        <MetricTile
          label={copy.metrics.acceptRate}
          metric={{ value: counts?.acceptRateThisMonth ?? null, format: 'percent' }}
          hint={copy.metrics.acceptRateHint}
          size="compact"
        />
      </MetricGrid>

      <SectionTabs
        tabs={tabs}
        value={view}
        onValueChange={(v) => set({ view: v === 'awaiting' ? null : v, id: null })}
        ariaLabel={copy.viewsAria}
        touchTarget
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ChoiceChips
          aria-label={copy.sourcesAria}
          size="sm"
          scroll
          options={REMEDY_SOURCE_FILTERS.map((s) => ({ value: s, label: copy.sources[s] }))}
          value={source}
          onChange={(v) => set({ source: v && v !== 'all' ? v : null, id: null })}
        />
        <SearchField value={qInput} onChange={setQInput} label={copy.searchLabel} />
      </div>

      {selectable && items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-subtle bg-surface-2 px-3 py-2" role="region" aria-label={copy.selectedCount(selected.size)}>
          <label className="qx-small inline-flex min-h-11 cursor-pointer items-center gap-2 text-fg-muted">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-strong"
              checked={selected.size > 0 && items.every((i) => selected.has(i.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
            />
            {copy.selectAll}
          </label>
          {selected.size > 0 ? (
            <>
              <span className="qx-small font-medium text-fg" aria-live="polite">
                {copy.selectedCount(selected.size)}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                  {copy.bulkClear}
                </Button>
                <Button type="button" variant="outline" onClick={() => setRejecting({ ids: [...selected], name: null })}>
                  <X aria-hidden className="mr-1 h-4 w-4" />
                  {copy.bulkReject}
                </Button>
                <Button type="button" className="shadow-none" onClick={() => setConfirm({ ids: [...selected], name: null })}>
                  <Send aria-hidden className="mr-1 h-4 w-4" />
                  {copy.bulkPublish}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <QueryState
        query={list}
        skeleton="list"
        isEmpty={(d) => (d.pages[0]?.items.length ?? 0) === 0}
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
                    set({ source: null, q: null });
                  }}
                >
                  {shared.clearFilters}
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={copy.empty[view].title}
              description={copy.empty[view].body}
              action={
                view === 'awaiting' ? (
                  <Button asChild variant="outline">
                    <Link href="/dealer/inbox">{copy.goInbox}</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      >
        {() => (
          <div className="space-y-3">
            <ul className="space-y-3" aria-label={copy.views[view]}>
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <m.li key={item.id} layout={!motion.reduce} exit={exit} className="list-none">
                    <RemedyRow
                      item={item}
                      selectable={selectable}
                      selected={selected.has(item.id)}
                      onToggleSelect={() => toggle(item.id)}
                      onOpen={() => set({ id: item.id }, 'push')}
                      onPublish={() => setConfirm({ ids: [item.id], name: item.customer.name })}
                      onReject={() => setRejecting({ ids: [item.id], name: item.customer.name })}
                      busy={busy[item.id] ?? null}
                      readOnly={initial.readOnly}
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

      <DetailSheet
        open={Boolean(detailId)}
        id={detailId}
        onOpenChange={(o) => {
          if (!o) {
            set({ id: null });
            setDraft(null);
          }
        }}
        onNavigate={(next) => set({ id: next })}
        siblings={items.map((i) => i.id)}
        size="lg"
        title={(id) => copy.detailTitle(nameOf(id) ?? cachedDetail?.customer.name ?? copy.customer)}
        footer={(id) => {
          const status = sheetStatus;
          if (initial.readOnly) return null;
          if (status === 'awaiting_dealer_approval') {
            const name = nameOf(id) ?? cachedDetail?.customer.name ?? '';
            return (
              <>
                <Button variant="outline" onClick={() => setRejecting({ ids: [id], name })} disabled={Boolean(busy[id])}>
                  <X aria-hidden className="mr-1 h-4 w-4" />
                  {copy.reject}
                </Button>
                <Button
                  className="shadow-none"
                  onClick={() => setConfirm({ ids: [id], name })}
                  disabled={Boolean(busy[id]) || (draft ? !draft.valid : false)}
                  loading={busy[id] === 'publish'}
                >
                  <Send aria-hidden className="mr-1 h-4 w-4" />
                  {copy.publish}
                </Button>
              </>
            );
          }
          if (status === 'rejected' && cachedDetail?.restorableUntil) {
            return (
              <Button variant="outline" onClick={() => void restore(id)}>
                <Undo2 aria-hidden className="mr-1 h-4 w-4" />
                {copy.restore}
              </Button>
            );
          }
          return null;
        }}
      >
        {(id) => (
          <RemedyDetailBody
            id={id}
            readOnly={initial.readOnly}
            onDraftChange={setDraft}
            saving={savingDraft}
            onSaveDraft={(payload) => saveDraft(id, payload)}
          />
        )}
      </DetailSheet>

      <ConfirmAction
        open={confirm !== null}
        onOpenChange={(o) => (!o ? setConfirm(null) : undefined)}
        tone="brand"
        title={confirm && confirm.ids.length > 1 ? copy.bulkPublishConfirm(confirm.ids.length) : copy.publishConfirmTitle}
        description={
          confirm && confirm.ids.length > 1 ? copy.bulkPublishBody : copy.publishConfirmBody(confirm?.name || copy.customer)
        }
        irreversibleNote={false}
        confirmLabel={copy.publishConfirm}
        cancelLabel={shared.cancel}
        onConfirm={async () => {
          if (!confirm) return;
          await publish(confirm.ids);
        }}
      />

      <RejectDialog
        open={rejecting !== null}
        onOpenChange={(o) => (!o ? setRejecting(null) : undefined)}
        title={rejecting?.name ? copy.rejectFor(rejecting.name) : undefined}
        onConfirm={async (input) => {
          if (!rejecting) return;
          await reject(rejecting.ids, input);
        }}
      />
    </section>
  );
}
