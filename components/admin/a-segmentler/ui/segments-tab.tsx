'use client';

/**
 * Segmentler sekmesi — gör → anla → uygula: yaşam döngüsü kartları (klavyeyle gezilebilen
 * radyo grubu, URL `?segment=`), erişilebilir dağılım çubuğu, "Bu segment nedir?" kural kartı
 * ve sunucu sayfalı/aranabilir/sıralanabilir üye tablosu (satır → Kullanıcı 360), CSV.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { m } from 'framer-motion';
import { AlertTriangle, Crown, Download, Hourglass, Inbox, Info, Loader2, Moon, RefreshCw, Sparkles, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { DataTable, MetricGrid, MetricTile, StatusBadge, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import { useMotionPolicy, useNumberTicker, DURATION, EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { SegmentsCopy } from '../copy';
import { MEMBER_PAGE_SIZES, MEMBER_SORT_KEYS, defaultMemberSort, type SegmentMember, type SegmentOverview, type SegmentSummary } from '../domain';
import { fetchMembers, fetchOverview, membersExportUrl } from '../client/api';

const ICONS: Record<string, typeof Users> = {
  new: Sparkles,
  loyal: UserCheck,
  vip: Crown,
  at_risk: AlertTriangle,
  sleeping: Moon,
  none: Inbox,
  uncomputed: Hourglass,
};

/** Token tabanlı tonlar (renk + ikon + metin; yalnız renge dayanmaz). */
const TONE: Record<string, { dot: string; ring: string }> = {
  new: { dot: 'bg-info', ring: 'ring-info' },
  loyal: { dot: 'bg-success', ring: 'ring-success' },
  vip: { dot: 'bg-brand', ring: 'ring-brand' },
  at_risk: { dot: 'bg-danger', ring: 'ring-danger' },
  sleeping: { dot: 'bg-warning', ring: 'ring-warning' },
  none: { dot: 'bg-fg-subtle', ring: 'ring-focus' },
  uncomputed: { dot: 'bg-fg-subtle/50', ring: 'ring-focus' },
};
const toneOf = (s: Pick<SegmentSummary, 'key'>) => TONE[s.key ?? ''] ?? { dot: 'bg-fg-muted', ring: 'ring-focus' };

function fmtDateTime(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function fmtDate(iso: string, locale: 'tr' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}
function fmtMoney(v: number | null, locale: 'tr' | 'en') {
  if (v == null) return '—';
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v);
}

export function segmentName(s: Pick<SegmentSummary, 'key' | 'name'>, c: SegmentsCopy): string {
  return s.key && s.key in c.names ? c.names[s.key as keyof typeof c.names] : s.name;
}

export function SegmentsTab({ c, locale, overview }: { c: SegmentsCopy; locale: 'tr' | 'en'; overview: UseQueryResult<SegmentOverview> }) {
  const qc = useQueryClient();
  const url = useUrlState();
  const [recomputing, setRecomputing] = useState(false);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const fresh = await fetchOverview({ fresh: true });
      qc.setQueryData(['admin-segments', 'overview'], fresh);
      void qc.invalidateQueries({ queryKey: ['admin-segments', 'members'] });
      announce(c.computedAt(fmtDateTime(fresh.computedAt, locale)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <QueryState query={overview} skeleton="stats" error={{ title: c.errors.overview }} onRetry={() => overview.refetch()}>
      {(data) => {
        const segments = data.segments;
        const requested = url.get('segment');
        const selected = segments.find((s) => s.id === requested) ?? segments.find((s) => s.count > 0) ?? segments[0] ?? null;
        const withClvPct = data.totals.customers > 0 ? Math.round((data.totals.withClv / data.totals.customers) * 100) : 0;
        const hasRegistry = segments.some((s) => s.key !== 'none' && s.key !== 'uncomputed');
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="qx-small text-fg">{c.clvAt(data.clvComputedAt ? fmtDateTime(data.clvComputedAt, locale) : null)}</p>
                <p className="qx-caption text-fg-muted" aria-live="polite">
                  {c.ruleSource} · {c.computedAt(fmtDateTime(data.computedAt, locale))}
                </p>
              </div>
              <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={recompute} disabled={recomputing} aria-busy={recomputing}>
                {recomputing ? <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />}
                {recomputing ? c.refreshing : c.refresh}
              </Button>
            </div>

            <MetricGrid cols={4}>
              <MetricTile label={c.kpi.customers} icon={<Users className="h-4 w-4" />} metric={{ value: data.totals.customers }} hint={c.kpi.customersHint} size="compact" />
              <MetricTile label={c.kpi.withClv} icon={<UserCheck className="h-4 w-4" />} metric={{ value: data.totals.withClv }} hint={c.kpi.withClvHint(withClvPct)} size="compact" />
              <MetricTile
                label={c.kpi.suspicious}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={data.totals.excludedSuspicious > 0 ? 'warning' : 'neutral'}
                metric={{ value: data.totals.excludedSuspicious }}
                hint={c.kpi.suspiciousHint}
                size="compact"
              />
              <MetricTile
                label={c.kpi.pending}
                icon={<Inbox className="h-4 w-4" />}
                tone={data.pendingProposals > 0 ? 'brand' : 'neutral'}
                metric={{ value: data.pendingProposals }}
                hint={c.kpi.pendingHint}
                href="/admin/segments?tab=oneriler"
                size="compact"
              />
            </MetricGrid>

            {!hasRegistry && <EmptyState variant="first-use" icon={Info} title={c.empty.noRegistry} description={c.empty.noRegistryHint} compact />}

            <SegmentPicker c={c} locale={locale} segments={segments} selectedId={selected?.id ?? null} onSelect={(id) => url.set({ segment: id }, { resetKeys: ['page', 'sort', 'q'] })} />

            <Distribution c={c} segments={segments} selectedId={selected?.id ?? null} onSelect={(id) => url.set({ segment: id }, { resetKeys: ['page', 'sort', 'q'] })} />

            {selected ? <SegmentDetail key={selected.id} c={c} locale={locale} segment={selected} /> : <EmptyState title={c.empty.pick} compact />}
          </div>
        );
      }}
    </QueryState>
  );
}

// ───────────────────────────── Kartlar (radyo grubu) ─────────────────────────────

function SegmentPicker({
  c,
  locale,
  segments,
  selectedId,
  onSelect,
}: {
  c: SegmentsCopy;
  locale: 'tr' | 'en';
  segments: SegmentSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? segments.length - 1 : (i + delta + segments.length) % segments.length;
    refs.current[next]?.focus();
    onSelect(segments[next].id);
  };
  return (
    <div role="radiogroup" aria-label={c.cardsAria} className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-7">
      {segments.map((s, i) => {
        const Icon = ICONS[s.key ?? ''] ?? Users;
        const active = s.id === selectedId;
        const tone = toneOf(s);
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!selectedId && i === 0) ? 0 : -1}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'min-h-11 w-40 shrink-0 snap-start rounded-card border bg-surface-1 p-3 text-left transition-colors sm:w-auto',
              'hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              active && cn('border-transparent ring-2', tone.ring),
              !s.isActive && 'opacity-70'
            )}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)} />
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="qx-small truncate font-medium text-fg">{segmentName(s, c)}</span>
            </span>
            <CountLine value={s.count} share={s.share} c={c} />
            <span className="qx-caption mt-0.5 block truncate text-fg-muted">
              {s.avgSpent != null ? `${c.avgSpent}: ${fmtMoney(s.avgSpent, locale)}` : ' '}
            </span>
            {!s.isActive && <StatusBadge size="sm" tone="neutral" label={c.inactive} className="mt-1" />}
          </button>
        );
      })}
    </div>
  );
}

function CountLine({ value, share, c }: { value: number; share: number; c: SegmentsCopy }) {
  const shown = useNumberTicker(value, { animateOnMount: true });
  return (
    <span className="mt-2 flex items-baseline gap-2">
      <span className="qx-num text-2xl font-semibold text-fg">{Math.round(shown).toLocaleString('tr-TR')}</span>
      <span className="qx-caption qx-num text-fg-muted">{c.share(share)}</span>
    </span>
  );
}

// ───────────────────────────── Dağılım çubuğu ─────────────────────────────

function Distribution({ c, segments, selectedId, onSelect }: { c: SegmentsCopy; segments: SegmentSummary[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const policy = useMotionPolicy();
  const visible = segments.filter((s) => s.count > 0);
  if (!visible.length) return null;
  return (
    <SectionCard title={c.distAria} density="compact" headingLevel="h2">
      {/* scaleX + transform-origin:left → azaltılmış hareket tercihinde anında. */}
      <m.div
        className="flex h-4 w-full origin-left overflow-hidden rounded-full bg-surface-muted"
        initial={policy.reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={policy.transition({ duration: DURATION.slow, ease: EASE.emphasized })}
        aria-hidden
      >
        {visible.map((s) => (
          <span key={s.id} className={cn('h-full', toneOf(s).dot, s.id === selectedId ? 'opacity-100' : 'opacity-70')} style={{ width: `${Math.max(s.share, 0.5)}%` }} />
        ))}
      </m.div>
      <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
        {visible.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={s.id === selectedId}
              className={cn(
                'qx-small inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-8',
                s.id === selectedId && 'bg-surface-muted font-medium text-fg'
              )}
            >
              <span aria-hidden className={cn('h-2 w-2 rounded-full', toneOf(s).dot)} />
              {segmentName(s, c)} <span className="qx-num">{c.share(s.share)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ───────────────────────────── Detay: kural + üyeler ─────────────────────────────

function SegmentDetail({ c, locale, segment }: { c: SegmentsCopy; locale: 'tr' | 'en'; segment: SegmentSummary }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const policy = useMotionPolicy();
  useEffect(() => {
    // Seçimden sonra (ilk yükleme hariç) odak + görünüm detaya taşınır (rapor B9).
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.scrollIntoView({ block: 'start', behavior: policy.reduce ? 'auto' : 'smooth' });
    headingRef.current?.focus({ preventScroll: true });
  }, [policy.reduce]);

  const rule = segment.key && segment.key in c.rules ? c.rules[segment.key as keyof typeof c.rules] : c.customRule;
  const name = segmentName(segment, c);
  return (
    <m.div
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
      initial={policy.reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={policy.transition({ duration: DURATION.base })}
    >
      <div className="min-w-0 space-y-3 lg:order-1">
        <h2 ref={headingRef} tabIndex={-1} className="qx-h3 scroll-mt-24 text-fg focus:outline-none">
          {c.membersOf(name, segment.count)}
        </h2>
        <MembersTable c={c} locale={locale} segment={segment} />
      </div>
      <aside className="space-y-4 lg:order-2">
        <SectionCard title={c.whatIs} icon={<Info />} density="compact" headingLevel="h3">
          <p className="qx-small text-fg">{rule}</p>
          {segment.description && segment.key && !(segment.key in c.rules) && <p className="qx-caption mt-2 text-fg-muted">{segment.description}</p>}
          <p className="qx-caption mt-3 text-fg-muted">{c.precedence}</p>
          {segment.avgChurn != null && (
            <p className="qx-caption mt-2 text-fg-muted">
              {c.avgChurn}: <span className="qx-num">%{Math.round(segment.avgChurn * 100)}</span>
            </p>
          )}
        </SectionCard>
      </aside>
    </m.div>
  );
}

function MembersTable({ c, locale, segment }: { c: SegmentsCopy; locale: 'tr' | 'en'; segment: SegmentSummary }) {
  const def = defaultMemberSort(segment.key);
  const fields = useMemo<FilterField[]>(() => [{ type: 'search', key: 'q', label: c.search.label, placeholder: c.search.placeholder, debounceMs: 300 }], [c]);
  const filters = useFilterState(fields);
  const table = useUrlTableState({ defaultSort: [def], sortableIds: MEMBER_SORT_KEYS, pageSizeOptions: MEMBER_PAGE_SIZES, defaultPageSize: 20 });
  const q = typeof filters.values.q === 'string' ? filters.values.q : '';
  const params = { segmentId: segment.id, q, sort: table.params.sort, page: table.params.page, size: table.params.pageSize };
  const query = useQuery({
    queryKey: ['admin-segments', 'members', params],
    queryFn: ({ signal }) => fetchMembers(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const columns = useMemo(() => buildColumns(c, locale, segment.id === 'uncomputed'), [c, locale, segment.id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar fields={fields} resetKeys={['page']} ariaLabel={c.search.label} />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <a href={membersExportUrl({ segmentId: segment.id, q, sort: table.params.sort })} download>
              <Download aria-hidden className="mr-1.5 h-4 w-4" />
              {c.exportCsv}
            </a>
          </Button>
          <span className="qx-caption text-fg-subtle">{c.exportNote}</span>
        </div>
      </div>
      <DataTable
        ariaLabel={c.table.aria}
        columns={columns}
        data={query.data?.items}
        query={query}
        getRowId={(r) => r.userId}
        getRowLabel={(r) => r.name ?? r.email ?? r.userId}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={query.data?.total}
        pageSizeOptions={MEMBER_PAGE_SIZES}
        {...table}
        filtered={filters.activeCount > 0}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: c.empty.filtered, action: <Button variant="outline" className="min-h-11" onClick={filters.clear}>{locale === 'en' ? 'Clear search' : 'Aramayı temizle'}</Button> }
            : { variant: 'first-use', title: c.empty.members, description: c.empty.membersHint }
        }
        errorProps={{ title: c.errors.members }}
        density="compact"
      />
    </div>
  );
}

function buildColumns(c: SegmentsCopy, locale: 'tr' | 'en', uncomputed: boolean): ColumnDef<SegmentMember>[] {
  const meta = (x: DataTableColumnMeta) => x;
  const cols: ColumnDef<SegmentMember>[] = [
    {
      id: 'name',
      header: c.table.customer,
      meta: meta({ mobile: 'title' }),
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link href={`/admin/users/${encodeURIComponent(row.original.userId)}`} className="block truncate font-medium text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {row.original.name || row.original.email || row.original.userId}
          </Link>
          {row.original.email && row.original.name && <p className="qx-caption truncate text-fg-muted">{row.original.email}</p>}
        </div>
      ),
    },
  ];
  if (!uncomputed) {
    cols.push(
      { id: 'spent', header: c.table.spent, meta: meta({ numeric: true, mobile: 'subtitle' }), cell: ({ row }) => <span className="qx-num">{fmtMoney(row.original.totalSpent, locale)}</span> },
      { id: 'visits', header: c.table.visits, meta: meta({ numeric: true, mobile: 'field', label: c.table.visits }), cell: ({ row }) => <span className="qx-num">{row.original.totalVisits ?? '—'}</span> },
      {
        id: 'last',
        header: c.table.last,
        meta: meta({ mobile: 'field', label: c.table.last }),
        cell: ({ row }) => <span className="qx-num">{row.original.lastPurchaseAt ? fmtDate(row.original.lastPurchaseAt, locale) : c.table.none}</span>,
      },
      {
        id: 'churn',
        header: c.table.churn,
        meta: meta({ numeric: true, mobile: 'field', label: c.table.churn }),
        cell: ({ row }) => {
          const p = row.original.predictedChurn;
          if (p == null) return <span className="text-fg-subtle">{c.table.none}</span>;
          const pct = Math.round(p * 100);
          return <StatusBadge size="sm" tone={pct >= 50 ? 'danger' : pct >= 30 ? 'warning' : 'neutral'} icon={null} label={`%${pct}`} />;
        },
      }
    );
  }
  cols.push(
    {
      id: 'level',
      header: c.table.level,
      enableSorting: false,
      meta: meta({ mobile: 'hidden' }),
      cell: ({ row }) => <span className="qx-small qx-num text-fg-muted">{c.table.lv(row.original.level, row.original.points)}</span>,
    },
    {
      id: 'trust',
      header: c.table.trust,
      enableSorting: false,
      meta: meta({ mobile: 'field', label: c.table.trust }),
      cell: ({ row }) => (row.original.fraudStatus === 'flagged' ? <StatusBadge size="sm" tone="warning" label={c.table.flagged} /> : <span className="text-fg-subtle">{c.table.none}</span>),
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      enableHiding: false,
      meta: meta({ mobile: 'actions', interactive: true, label: c.table.open }),
      cell: ({ row }) => (
        <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-9">
          <Link href={`/admin/users/${encodeURIComponent(row.original.userId)}`} aria-label={`${c.table.open}: ${row.original.name ?? row.original.email ?? ''}`}>
            {c.table.open}
          </Link>
        </Button>
      ),
    }
  );
  return cols;
}
