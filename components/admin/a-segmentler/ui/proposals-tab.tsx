'use client';

/**
 * Öneriler sekmesi — bayi segment kampanyaları için TEK onay kuyruğu.
 * Durum sekmeleri (sayaçlı), arama/segment/kaynak süzgeci, SLA şeridi, sunucu sayfalı tablo,
 * toplu karar, inceleme çekmecesi (?oneri=): müşterinin göreceği bildirim, gönderimle aynı kitle
 * hesabı, işletmenin son 30 günü, karar geçmişi, gerekçeli karar; J/K/A/R kısayolları.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Bell, Check, Clock, Hourglass, Loader2, PauseCircle, Send, ShieldAlert, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilterBar, SectionCard, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { DataTable, DetailSheet, KeyValueList, MetricGrid, MetricTile, StatusBadge, Timeline, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import type { Tone } from '@/components/states';
import type { SegmentsCopy } from '../copy';
import {
  DECISION_NOTE_MAX,
  DECISION_NOTE_MIN,
  INNOVATION_SEGMENT_KEYS,
  PENDING_SLA_HOURS,
  PROPOSAL_PAGE_SIZES,
  SEND_CAP,
  isProposalStatus,
  type AdminDecision,
  type ProposalDetail,
  type ProposalRow,
  type ProposalStatus,
} from '../domain';
import { ApiRequestError, bulkDecide, decide, fetchProposal, fetchProposals, type ProposalParams } from '../client/api';

const STATUS_TONE: Record<ProposalStatus, Tone> = { PENDING: 'warning', APPROVED: 'info', SENT: 'success', REJECTED: 'neutral' };

function fmtDateTime(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function statusLabel(s: string, c: SegmentsCopy) {
  return isProposalStatus(s) ? c.p.statusShort[s] : s;
}

export function ProposalsTab({ c, locale }: { c: SegmentsCopy; locale: 'tr' | 'en' }) {
  const url = useUrlState();
  const status = (() => {
    const raw = url.get('durum');
    return raw === 'ALL' || isProposalStatus(raw) ? (raw as ProposalStatus | 'ALL') : 'PENDING';
  })();
  return (
    <div className="space-y-4">
      <SectionTabs
        paramKey="durum"
        variant="pill"
        ariaLabel={c.p.filters.status}
        resetKeys={['page', 'oneri']}
        tabs={[
          { value: 'PENDING', label: c.p.statuses.PENDING },
          { value: 'APPROVED', label: c.p.statuses.APPROVED },
          { value: 'SENT', label: c.p.statuses.SENT },
          { value: 'REJECTED', label: c.p.statuses.REJECTED },
          { value: 'ALL', label: c.p.all },
        ]}
      />
      <QueueBody key={status} c={c} locale={locale} status={status} />
    </div>
  );
}

function QueueBody({ c, locale, status }: { c: SegmentsCopy; locale: 'tr' | 'en'; status: ProposalStatus | 'ALL' }) {
  const qc = useQueryClient();
  const url = useUrlState();
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: c.p.filters.search, placeholder: c.p.filters.searchPh, debounceMs: 300 },
      { type: 'select', key: 'seg', label: c.p.filters.segment, options: INNOVATION_SEGMENT_KEYS.map((k) => ({ value: k, label: c.p.segments[k] })) },
      {
        type: 'select',
        key: 'kaynak',
        label: c.p.filters.source,
        options: [
          { value: 'real', label: c.p.filters.sourceReal },
          { value: 'demo', label: c.p.filters.sourceDemo },
        ],
      },
    ],
    [c]
  );
  const filters = useFilterState(fields);
  const table = useUrlTableState({ pageSizeOptions: PROPOSAL_PAGE_SIZES, defaultPageSize: 20 });
  const params: ProposalParams = {
    status,
    q: typeof filters.values.q === 'string' ? filters.values.q : '',
    seg: typeof filters.values.seg === 'string' ? filters.values.seg : '',
    source: typeof filters.values.kaynak === 'string' ? filters.values.kaynak : '',
    page: table.params.page,
    size: table.params.pageSize,
  };
  const query = useQuery({
    queryKey: ['admin-segments', 'proposals', params],
    queryFn: ({ signal }) => fetchProposals(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    // Bayat kuyruk çift karara yol açıyordu (rapor Bulgu 1): odakta ve 60 sn'de bir tazele.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const data = query.data;
  const ids = useMemo(() => data?.items.map((r) => r.id) ?? [], [data]);
  const [bulk, setBulk] = useState<{ ids: string[]; decision: AdminDecision; clear: () => void } | null>(null);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['admin-segments', 'proposals'] });
    void qc.invalidateQueries({ queryKey: ['admin-segments', 'proposal'] });
    void qc.invalidateQueries({ queryKey: ['admin-segments', 'overview'] });
  };

  const columns = useMemo(() => buildColumns(c, locale, (id) => url.set({ oneri: id }, { history: 'push' })), [c, locale, url]);
  const counts = data?.counts;
  const oldest = data?.oldestPendingHours ?? null;

  return (
    <div className="space-y-4">
      {data && !data.featureEnabled && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-card border border-warning-border bg-warning-subtle px-4 py-3">
          <PauseCircle aria-hidden className="h-5 w-5 shrink-0 text-warning" />
          <p className="qx-small min-w-0 flex-1 text-fg">{c.p.featureOff}</p>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href="/admin/segments?tab=moduller">{c.p.featureOffAction}</Link>
          </Button>
        </div>
      )}

      <MetricGrid cols={4}>
        <MetricTile label={c.p.sla.pending} icon={<Hourglass className="h-4 w-4" />} metric={{ value: counts ? counts.PENDING : null }} loading={!counts} size="compact" tone={counts && counts.PENDING > 0 ? 'brand' : 'neutral'} />
        <MetricTile
          label={c.p.sla.oldest}
          icon={<Clock className="h-4 w-4" />}
          metric={{ value: oldest }}
          hint={`${c.p.sla.oldestValue(oldest)} · ${c.p.sla.slaHint}`}
          loading={!data}
          size="compact"
          tone={oldest != null && oldest > PENDING_SLA_HOURS ? 'warning' : 'neutral'}
          deltaLabel={null}
        />
        <MetricTile label={c.p.sla.approved} icon={<Bell className="h-4 w-4" />} metric={{ value: counts ? counts.APPROVED : null }} loading={!counts} size="compact" />
        <MetricTile label={c.p.sla.sent} icon={<Send className="h-4 w-4" />} metric={{ value: counts ? counts.SENT : null }} hint={`${c.p.sla.rejected}: ${counts ? counts.REJECTED : '—'}`} loading={!counts} size="compact" />
      </MetricGrid>

      <FilterBar fields={fields} resetKeys={['page', 'oneri']} ariaLabel={c.p.filters.search} />

      <DataTable
        ariaLabel={c.p.table.aria}
        columns={columns}
        data={data?.items}
        query={query}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.title}
        manualPagination
        manualFiltering
        rowCount={data?.total}
        pageSizeOptions={PROPOSAL_PAGE_SIZES}
        pagination={table.pagination}
        onPaginationChange={table.onPaginationChange}
        enableRowSelection={status === 'PENDING' ? (row) => row.original.status === 'PENDING' : false}
        bulkActions={
          status === 'PENDING'
            ? (ctx) => (
                <>
                  <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setBulk({ ids: ctx.ids, decision: 'APPROVED', clear: ctx.clear })}>
                    <Check aria-hidden className="mr-1.5 h-4 w-4" />
                    {c.p.bulk.approve}
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setBulk({ ids: ctx.ids, decision: 'REJECTED', clear: ctx.clear })}>
                    <X aria-hidden className="mr-1.5 h-4 w-4" />
                    {c.p.bulk.reject}
                  </Button>
                </>
              )
            : undefined
        }
        filtered={filters.activeCount > 0}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: c.p.empty.filtered, action: <Button variant="outline" className="min-h-11" onClick={filters.clear}>{locale === 'en' ? 'Clear filters' : 'Süzgeçleri temizle'}</Button> }
            : status === 'PENDING'
              ? { variant: 'first-use', title: c.p.empty.pending, description: c.p.empty.pendingHint }
              : { variant: 'first-use', title: c.p.empty.other, description: null }
        }
        errorProps={{ title: c.errors.proposals }}
        onRowClick={(r) => url.set({ oneri: r.id }, { history: 'push' })}
        activeRowId={url.get('oneri')}
        density="compact"
      />

      <DetailSheet paramKey="oneri" size="lg" title={c.p.detail.title} siblings={ids} history="push">
        {(id) => (
          <ProposalReview
            key={id}
            id={id}
            c={c}
            locale={locale}
            onDecided={() => {
              refreshAll();
              const i = ids.indexOf(id);
              const next = ids.filter((x) => x !== id)[i] ?? null;
              url.set({ oneri: next }, { history: 'replace' });
            }}
            onNavigate={(dir) => {
              const i = ids.indexOf(id);
              const target = ids[i + dir];
              if (target) url.set({ oneri: target }, { history: 'replace' });
            }}
          />
        )}
      </DetailSheet>

      <BulkDialog c={c} state={bulk} onClose={() => setBulk(null)} onDone={refreshAll} />
    </div>
  );
}

function buildColumns(c: SegmentsCopy, locale: 'tr' | 'en', onOpen: (id: string) => void): ColumnDef<ProposalRow>[] {
  const meta = (x: DataTableColumnMeta) => x;
  return [
    {
      id: 'title',
      header: c.p.table.proposal,
      enableSorting: false,
      meta: meta({ mobile: 'title' }),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.original.title}</p>
          <p className="qx-caption truncate text-fg-muted">{row.original.dealer.label}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.original.dealer.isDemo && <StatusBadge size="sm" tone="info" label={c.p.table.demo} />}
            {row.original.templateUnchanged && <StatusBadge size="sm" tone="neutral" icon={null} label={c.p.table.template} />}
          </div>
        </div>
      ),
    },
    {
      id: 'segment',
      header: c.p.table.segment,
      enableSorting: false,
      meta: meta({ mobile: 'subtitle' }),
      cell: ({ row }) => <span className="qx-small">{c.p.segments[row.original.segmentKey] ?? row.original.segmentKey}</span>,
    },
    {
      id: 'age',
      header: c.p.table.age,
      enableSorting: false,
      meta: meta({ mobile: 'field', label: c.p.table.age }),
      cell: ({ row }) =>
        row.original.status === 'PENDING' ? (
          <span className={row.original.ageHours > PENDING_SLA_HOURS ? 'qx-num font-semibold text-warning' : 'qx-num'}>{c.p.table.ageValue(row.original.ageHours)}</span>
        ) : (
          <span className="qx-caption qx-num text-fg-muted">{fmtDateTime(row.original.createdAt, locale)}</span>
        ),
    },
    {
      id: 'status',
      header: c.p.table.status,
      enableSorting: false,
      meta: meta({ mobile: 'field', label: c.p.table.status }),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <StatusBadge size="sm" className="qx-fx-status" tone={isProposalStatus(row.original.status) ? STATUS_TONE[row.original.status] : 'neutral'} label={statusLabel(row.original.status, c)} />
          {row.original.decidedBy && <p className="qx-caption truncate text-fg-muted">{row.original.decidedBy.label}</p>}
        </div>
      ),
    },
    {
      id: 'sent',
      header: c.p.table.sent,
      enableSorting: false,
      meta: meta({ numeric: true, mobile: 'hidden' }),
      cell: ({ row }) => <span className="qx-num">{row.original.sentCount ?? '—'}</span>,
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: meta({ mobile: 'actions', interactive: true, label: c.p.table.review }),
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => onOpen(row.original.id)} aria-label={`${c.p.table.review}: ${row.original.title}`}>
          {c.p.table.review}
        </Button>
      ),
    },
  ];
}

// ───────────────────────────── İnceleme çekmecesi ─────────────────────────────

function ProposalReview({
  id,
  c,
  locale,
  onDecided,
  onNavigate,
}: {
  id: string;
  c: SegmentsCopy;
  locale: 'tr' | 'en';
  onDecided: () => void;
  onNavigate: (dir: 1 | -1) => void;
}) {
  const query = useQuery({ queryKey: ['admin-segments', 'proposal', id], queryFn: ({ signal }) => fetchProposal(id, signal), staleTime: 30_000 });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<AdminDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async (decision: AdminDecision, d: ProposalDetail) => {
    if (busy) return;
    setError(null);
    const trimmed = note.trim();
    if (decision === 'REJECTED' && trimmed.length < DECISION_NOTE_MIN) {
      setError(c.p.detail.noteRequired);
      noteRef.current?.focus();
      return;
    }
    setBusy(decision);
    try {
      await decide(d.id, decision, trimmed || null);
      const msg = decision === 'APPROVED' ? c.p.detail.approvedToast : c.p.detail.rejectedToast;
      toast.success(msg);
      announce(msg);
      onDecided();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        toast.error(c.p.detail.conflict);
        onDecided();
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'j') {
      e.preventDefault();
      onNavigate(1);
    } else if (k === 'k') {
      e.preventDefault();
      onNavigate(-1);
    } else if (k === 'a' && query.data?.status === 'PENDING' && !query.data.dealer.isDemo) {
      e.preventDefault();
      void submit('APPROVED', query.data);
    } else if (k === 'r' && query.data?.status === 'PENDING') {
      e.preventDefault();
      noteRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKey} className="space-y-5 focus:outline-none">
      <QueryState query={query} skeleton="detail" error={{ title: c.errors.detail }} onRetry={() => query.refetch()}>
        {(d) => {
          const pending = d.status === 'PENDING';
          const fatigue = d.dealerStats.sentLast30d >= 3;
          return (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge className="qx-fx-status" tone={isProposalStatus(d.status) ? STATUS_TONE[d.status] : 'neutral'} label={statusLabel(d.status, c)} />
                <StatusBadge tone="neutral" icon={null} label={c.p.segments[d.segmentKey] ?? d.segmentKey} />
                {d.dealer.isDemo && <StatusBadge tone="info" label={c.p.table.demo} />}
                {pending && <span className={d.ageHours > PENDING_SLA_HOURS ? 'qx-caption font-semibold text-warning' : 'qx-caption text-fg-muted'}>{c.p.table.ageValue(d.ageHours)}</span>}
              </div>

              <section aria-labelledby={`pv-${d.id}`} className="space-y-2">
                <h3 id={`pv-${d.id}`} className="qx-small font-medium text-fg">{c.p.detail.preview}</h3>
                <div className="rounded-card border bg-surface-2 p-4 qx-elevation-1">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand-subtle text-brand">
                      <Bell className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="qx-caption text-fg-muted">{d.dealer.label}</p>
                      <p className="font-semibold text-fg">{d.title}</p>
                      <p className="qx-small mt-1 whitespace-pre-wrap break-words text-fg">{d.message}</p>
                    </div>
                  </div>
                </div>
                <p className="qx-caption text-fg-muted">{c.p.detail.previewNote}</p>
                {d.templateUnchanged && <p className="qx-caption text-fg-muted">{c.p.detail.templateNote}</p>}
              </section>

              <SectionCard title={c.p.detail.audience} icon={<Users />} density="compact" headingLevel="h3">
                <p className="qx-caption mb-2 text-fg-muted">{c.p.segmentRules[d.segmentKey] ?? ''}</p>
                {d.audience ? (
                  <>
                    <KeyValueList
                      items={[
                        { label: c.p.detail.candidates, value: <span className="qx-num">{d.audience.candidates}</span> },
                        { label: c.p.detail.reach, value: <span className="qx-num font-semibold">{d.audience.reach}</span> },
                        { label: c.p.detail.optedOut, value: <span className="qx-num">{d.audience.optedOut}</span> },
                      ]}
                    />
                    {d.audience.truncated && <p className="qx-caption mt-2 text-warning">{c.p.detail.truncated(SEND_CAP)}</p>}
                    {d.audience.candidates === 0 && <p className="qx-caption mt-2 text-warning">{c.p.detail.emptyAudience}</p>}
                  </>
                ) : (
                  <p className="qx-small text-warning">{c.p.detail.audienceError}</p>
                )}
              </SectionCard>

              <SectionCard title={c.p.detail.dealer} icon={<ShieldAlert />} density="compact" headingLevel="h3">
                <p className="qx-small text-fg">{d.dealer.label}</p>
                <p className="qx-caption text-fg-muted">{c.p.detail.dealerStats(d.dealerStats.sentLast30d, d.dealerStats.proposalsLast30d, d.dealerStats.rejectedLast30d)}</p>
                {fatigue && <p className="qx-caption mt-1 text-warning">{c.p.detail.fatigue}</p>}
                {d.recent.length > 0 && (
                  <>
                    <h4 className="qx-caption mt-3 font-medium text-fg-muted">{c.p.detail.recent}</h4>
                    <ul className="mt-1 space-y-1">
                      {d.recent.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2">
                          <span className="qx-small truncate text-fg">{r.title}</span>
                          <StatusBadge size="sm" tone={isProposalStatus(r.status) ? STATUS_TONE[r.status] : 'neutral'} label={statusLabel(r.status, c)} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </SectionCard>

              <SectionCard title={c.p.detail.history} icon={<Clock />} density="compact" headingLevel="h3">
                {d.history.length ? (
                  <Timeline
                    events={d.history.map((h) => ({
                      id: h.id,
                      title: c.p.detail.actions[h.action] ?? h.action,
                      at: h.at,
                      description: [h.actor, h.note].filter(Boolean).join(' · ') || undefined,
                    }))}
                  />
                ) : d.decidedAt ? (
                  <p className="qx-small text-fg-muted">{c.p.detail.decided(statusLabel(d.status, c), d.decidedBy?.label ?? null, fmtDateTime(d.decidedAt, locale))}</p>
                ) : (
                  <p className="qx-small text-fg-muted">{c.p.detail.noHistory}</p>
                )}
                {d.sentCount != null && <p className="qx-caption mt-2 text-fg-muted">{c.p.table.sent}: <span className="qx-num">{d.sentCount}</span></p>}
              </SectionCard>

              {pending && (
                <section aria-labelledby={`dc-${d.id}`} className="sticky bottom-0 -mx-4 space-y-2 border-t bg-surface-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6">
                  <Label id={`dc-${d.id}`} htmlFor={`note-${d.id}`} className="qx-small font-medium">
                    {c.p.detail.note}
                  </Label>
                  <Textarea
                    id={`note-${d.id}`}
                    ref={noteRef}
                    value={note}
                    maxLength={DECISION_NOTE_MAX}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={c.p.detail.notePh}
                    aria-describedby={`nh-${d.id}`}
                    rows={3}
                  />
                  <p id={`nh-${d.id}`} className="qx-caption text-fg-muted">
                    {c.p.detail.noteHint} · {note.length}/{DECISION_NOTE_MAX}
                  </p>
                  {error && <InlineError>{error}</InlineError>}
                  {d.dealer.isDemo && <p className="qx-caption text-info">{c.p.detail.demoBlock}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => submit('APPROVED', d)} disabled={!!busy || d.dealer.isDemo} aria-keyshortcuts="A">
                      {busy === 'APPROVED' ? <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <Check aria-hidden className="mr-1.5 h-4 w-4" />}
                      {busy === 'APPROVED' ? c.p.detail.deciding : c.p.detail.approve}
                    </Button>
                    <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => submit('REJECTED', d)} disabled={!!busy} aria-keyshortcuts="R">
                      {busy === 'REJECTED' ? <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <X aria-hidden className="mr-1.5 h-4 w-4" />}
                      {busy === 'REJECTED' ? c.p.detail.deciding : c.p.detail.reject}
                    </Button>
                  </div>
                  <p className="qx-caption hidden text-fg-subtle sm:block">{c.p.detail.keys}</p>
                </section>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

// ───────────────────────────── Toplu karar ─────────────────────────────

function BulkDialog({
  c,
  state,
  onClose,
  onDone,
}: {
  c: SegmentsCopy;
  state: { ids: string[]; decision: AdminDecision; clear: () => void } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote('');
    setError(null);
  }, [state]);
  if (!state) return null;
  const reject = state.decision === 'REJECTED';

  const run = async () => {
    const trimmed = note.trim();
    if (reject && trimmed.length < DECISION_NOTE_MIN) {
      setError(c.p.detail.noteRequired);
      return;
    }
    setBusy(true);
    try {
      const res = await bulkDecide(state.ids, state.decision, trimmed || null);
      const okCount = res.results.filter((r) => r.ok).length;
      const msg = c.p.bulk.result(okCount, res.results.length - okCount);
      toast.success(msg);
      announce(msg);
      state.clear();
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!reject) {
    return (
      <ConfirmAction
        open
        onOpenChange={(o) => !o && onClose()}
        tone="brand"
        title={c.p.bulk.approve}
        description={c.p.bulk.result(state.ids.length, 0)}
        confirmLabel={c.p.detail.approve}
        irreversibleNote={false}
        onConfirm={run}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c.p.bulk.reject}</DialogTitle>
          <DialogDescription>{c.p.detail.noteHint}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="bulk-note" className="qx-small font-medium">
          {c.p.detail.note}
        </Label>
        <Textarea id="bulk-note" value={note} maxLength={DECISION_NOTE_MAX} onChange={(e) => setNote(e.target.value)} rows={3} />
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>
            {c.m.reset}
          </Button>
          <Button className="min-h-11" onClick={run} disabled={busy}>
            {busy && <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" />}
            {c.p.detail.reject}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


