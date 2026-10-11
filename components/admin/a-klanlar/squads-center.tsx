'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, Download, History, Lock, Plus, RefreshCw, Shield, Swords, Timer, Users, PiggyBank, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  statusBadgeProps,
  Timeline,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
  type TimelineEvent,
} from '@/components/ds/data';
import { FilterBar, PageHeader, PanelPage, SectionTabs, useFilterState, type FilterField } from '@/components/ds/page';
import { ErrorState, QueryState } from '@/components/states';
import { useUrlState } from '@/components/ds/page/url-state';
import {
  AUDIT_ACTION_LABEL,
  SQUAD_DEFAULT_SORT,
  SQUAD_EXPORT_MAX_ROWS,
  SQUAD_PAGE_SIZE,
  SQUAD_SORT_IDS,
  queryString,
  type BattleListItem,
  type BattleListPage,
  type BattleViewStatus,
  type SquadListItem,
  type SquadListPage,
  type SquadStats,
} from '@/lib/admin-squads/contract';
import { SQUAD_MAX_MEMBERS } from '@/lib/squads/rules';
import { errorText, fetchAudit, fetchBattles, fetchSquads, fetchStats, squadsKeys } from './api';
import { BattleDetailBody } from './battle-sheet';
import { CreateBattleDialog } from './create-battle-dialog';
import { BATTLE_VIEW, BATTLE_VIEW_TABS, displayName, fmtDate, fmtDateTime, fmtNumber, fmtRemaining } from './format';
import { Pager, ScoreBar } from './parts';
import { SquadDetailBody } from './squad-sheet';
import { AdminKlanlarText } from './copy';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type SquadsInitial = {
  stats: SquadStats | null;
  squads: { qs: string; page: SquadListPage } | null;
  battles: { qs: string; page: BattleListPage } | null;
};

export function SquadsCenter({ initial }: { initial: SquadsInitial }) {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: squadsKeys.stats(), queryFn: fetchStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const [createOpen, setCreateOpen] = useState(false);
  const battleSheet = useDetailSheet('battle', { history: 'push' });
  const s = stats.data;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Klan Merkezi"
          description="Klanları bulun, gerekçeli ve gerçekten uygulanan moderasyon yapın; savaşları ve savaş ekonomisini izleyin."
          icon={<Shield />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: squadsKeys.all })}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Yenile
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Onur savaşı planla
              </Button>
            </div>
          }
        />
      }
    >
      {stats.isError ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label="Klan"
            metric={{ value: s?.total ?? null }}
            icon={<Users />}
            loading={!s}
            hint={s ? `${fmtNumber(s.totalMembers)} üye · ort. ${s.avgMembers.toLocaleString('tr-TR')} · 7 günde ${fmtNumber(s.newLast7d)} yeni` : undefined}
            href="?tab=squads"
          />
          <MetricTile
            label="Aktif klan (7 gün)"
            metric={{ value: s?.activeLast7d ?? null }}
            icon={<Activity />}
            tone="success"
            loading={!s}
            hint="En az bir üyesi puan kazanan"
          />
          <MetricTile label="Dondurulmuş" metric={{ value: s?.frozen ?? null }} icon={<Lock />} tone="warning" loading={!s} href="?tab=squads&status=frozen" />
          <MetricTile
            label="Canlı savaş"
            metric={{ value: s?.battles.live ?? null }}
            icon={<Swords />}
            tone="brand"
            loading={!s}
            hint={s ? `${fmtNumber(s.battles.pending)} davet yanıt bekliyor` : undefined}
            href="?tab=battles&view=live"
          />
          <MetricTile
            label="Süresi dolup kapanmayan"
            metric={{ value: s?.battles.overdue ?? null }}
            icon={<Timer />}
            tone={s && s.battles.overdue > 0 ? 'danger' : 'neutral'}
            loading={!s}
            hint="Sonuçlandırılmayı ya da iptali bekliyor"
            href="?tab=battles&view=overdue"
          />
          <MetricTile
            label="Escrow'da kilitli puan"
            metric={{ value: s?.battles.escrowLocked ?? null }}
            icon={<PiggyBank />}
            tone="info"
            loading={!s}
            hint="Açık meydan okumaların ödül havuzu"
          />
          <MetricTile label="Ödenen (7 gün)" metric={{ value: s?.battles.paidOut7d ?? null }} icon={<Swords />} loading={!s} hint="Kazanan klanlara dağıtılan" />
          <MetricTile label="İade edilen (7 gün)" metric={{ value: s?.battles.refunded7d ?? null }} icon={<History />} loading={!s} hint="Ret, iptal ve beraberlik iadeleri" />
        </MetricGrid>
      )}

      <SectionTabs
        ariaLabel="Klan Merkezi bölümleri"
        resetKeys={['page', 'size', 'sort', 'q', 'status', 'squad', 'bpage', 'bsize', 'bq', 'view', 'origin', 'squadId', 'battle', 'apage']}
        tabs={[
          { value: 'squads', label: 'Klanlar', icon: <Users />, count: s?.total },
          { value: 'battles', label: 'Savaşlar', icon: <Swords />, count: s ? s.battles.live + s.battles.pending + s.battles.overdue : undefined },
          { value: 'log', label: 'Moderasyon günlüğü', icon: <History /> },
        ]}
      >
        {(tab) => (tab === 'battles' ? <BattlesTab initial={initial.battles} onOpen={battleSheet.open} /> : tab === 'log' ? <AuditTab /> : <SquadsTab initial={initial.squads} />)}
      </SectionTabs>

      <DetailSheet paramKey="squad" size="lg" title="Klan ayrıntısı" description="Üyeler, sicil ve moderasyon">
        {(id) => <SquadDetailBody id={id} />}
      </DetailSheet>
      <DetailSheet paramKey="battle" size="lg" history="push" title="Savaş ayrıntısı" description="Skor, kadro, puan hareketleri ve zaman çizelgesi">
        {(id) => <BattleDetailBody id={id} />}
      </DetailSheet>

      <CreateBattleDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => battleSheet.open(id)} />
    </PanelPage>
  );
}

// ───────────────────────────── Klanlar ─────────────────────────────

const SQUAD_FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Klan adı, davet kodu ya da lider', minLength: 2 },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: 'Tümü',
    options: [
      { value: 'active', label: 'Etkin' },
      { value: 'frozen', label: 'Dondurulmuş' },
      { value: 'in_battle', label: 'Savaşta' },
    ],
  },
];

function SquadsTab({ initial }: { initial: SquadsInitial['squads'] }) {
  const filters = useFilterState(SQUAD_FIELDS);
  const sheet = useDetailSheet('squad');
  const table = useUrlTableState({ defaultPageSize: SQUAD_PAGE_SIZE, defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: SQUAD_SORT_IDS });
  const filterQs = queryString({ q: str(filters.values.q), status: str(filters.values.status) });
  const qs = queryString({
    q: str(filters.values.q),
    status: str(filters.values.status),
    sort: table.params.sort ?? SQUAD_DEFAULT_SORT,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: squadsKeys.list(qs),
    queryFn: ({ signal }) => fetchSquads(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<SquadListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Klan',
        enableHiding: false,
        meta: { mobile: 'title', label: 'Klan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-medium text-fg">{row.original.name}</span>
            {row.original.description ? <span className="block truncate text-xs text-fg-muted">{row.original.description}</span> : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.isFrozen ? (
            <StatusBadge size="sm" tone="warning" icon={Lock} label="Dondurulmuş" />
          ) : row.original.openBattle ? (
            <StatusBadge size="sm" tone={row.original.openBattle.status === 'active' ? 'brand' : 'info'} icon={Swords} label={row.original.openBattle.status === 'active' ? 'Savaşta' : 'Davet bekliyor'} />
          ) : (
            <StatusBadge size="sm" tone="success" label="Etkin" />
          ),
      },
      {
        id: 'owner',
        header: 'Lider',
        enableSorting: false,
        meta: { label: 'Lider' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate">{displayName(row.original.owner)}</span>
            <span className="block truncate text-xs text-fg-muted">{row.original.owner.email}</span>
          </div>
        ),
      },
      {
        id: 'members',
        header: 'Üye',
        meta: { numeric: true, label: 'Üye' } satisfies DataTableColumnMeta,
        cell: ({ row }) => `${fmtNumber(row.original.memberCount)}/${SQUAD_MAX_MEMBERS}`,
      },
      {
        id: 'totalPoints',
        accessorKey: 'totalPoints',
        header: 'Klan puanı',
        meta: { numeric: true, label: 'Klan puanı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.totalPoints),
      },
      {
        id: 'treasuryPoints',
        accessorKey: 'treasuryPoints',
        header: 'Klan gücü',
        meta: { numeric: true, label: 'Klan gücü' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.treasuryPoints),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Kuruluş',
        meta: { label: 'Kuruluş' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{fmtDate(row.original.createdAt)}</time>,
      },
    ],
    []
  );

  const total = list.data?.total ?? 0;
  const exportHref = `/api/admin/squads/export?${filterQs}${filterQs ? '&' : ''}sort=${encodeURIComponent(table.params.sort ?? SQUAD_DEFAULT_SORT)}`;

  return (
    <div className="space-y-4 pt-4">
      <FilterBar fields={SQUAD_FIELDS} ariaLabel="Klan filtreleri">
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-10">
          <a href={exportHref} download aria-label={`Filtrelenmiş klanları CSV olarak indir (${fmtNumber(Math.min(total, SQUAD_EXPORT_MAX_ROWS))} klan)`}>
            <Download className="h-4 w-4" aria-hidden />
            CSV ({fmtNumber(Math.min(total, SQUAD_EXPORT_MAX_ROWS))})
          </a>
        </Button>
      </FilterBar>
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(total)} klan bulundu` : ''}
      </p>
      <DataTable
        ariaLabel="Klanlar"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        activeRowId={sheet.id}
        onRowClick={(r) => sheet.open(r.id)}
        empty={
          filters.activeCount > 0
            ? {
                variant: 'filtered',
                title: 'Filtrelere uyan klan yok',
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : { title: 'Henüz klan yok', description: 'Müşteriler klan kurduğunda burada listelenir.' }
        }
      />
    </div>
  );
}

// ───────────────────────────── Savaşlar ─────────────────────────────

const BATTLE_FIELDS: FilterField[] = [
  { type: 'search', key: 'bq', label: 'Ara', placeholder: 'Klan adı ya da savaş kimliği', minLength: 2 },
  {
    type: 'select',
    key: 'origin',
    label: 'Köken',
    allLabel: 'Tümü',
    options: [
      { value: 'challenge', label: 'Lider meydan okuması' },
      { value: 'admin', label: 'Yönetici onur savaşı' },
    ],
  },
];

function BattlesTab({ initial, onOpen }: { initial: SquadsInitial['battles']; onOpen: (id: string) => void }) {
  const { get, set } = useUrlState();
  const filters = useFilterState(BATTLE_FIELDS, { resetKeys: ['bpage'] });
  const table = useUrlTableState({ pageKey: 'bpage', sizeKey: 'bsize', defaultPageSize: 20 });
  const viewRaw = get('view');
  const view = (BATTLE_VIEW_TABS.some((t) => t.value === viewRaw) ? viewRaw : 'live') as BattleViewStatus | 'all';
  const squadId = get('squadId') || '';
  const qs = queryString({
    status: view === 'all' ? undefined : view,
    q: str(filters.values.bq),
    origin: str(filters.values.origin),
    squadId,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: squadsKeys.battles(qs),
    queryFn: ({ signal }) => fetchBattles(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 10_000,
    refetchInterval: view === 'live' ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const counts = list.data?.counts;
  const squadName = useMemo(() => {
    const hit = list.data?.items.find((b) => b.squad1.id === squadId || b.squad2.id === squadId);
    return hit ? (hit.squad1.id === squadId ? hit.squad1.name : hit.squad2.name) : null;
  }, [list.data, squadId]);

  const columns = useMemo<ColumnDef<BattleListItem>[]>(
    () => [
      {
        id: 'match',
        header: 'Eşleşme',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Eşleşme' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="min-w-[14rem] max-w-md">
              <ScoreBar
                a={b.squad1Score}
                b={b.squad2Score}
                labelA={b.squad1.name}
                labelB={b.squad2.name}
                winner={b.winnerId === b.squad1.id ? 'a' : b.winnerId === b.squad2.id ? 'b' : b.status === 'completed' ? 'draw' : null}
              />
            </div>
          );
        },
      },
      {
        id: 'view',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(BATTLE_VIEW, row.original.view)} />,
      },
      {
        id: 'reward',
        header: 'Ödül',
        enableSorting: false,
        meta: { label: 'Ödül' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="space-y-0.5 text-sm">
              <span className="block">{b.rewardFunded ? `${fmtNumber(b.rewardPool)} puan` : 'Ödülsüz'}</span>
              <span className="block text-xs text-fg-muted">{b.origin === 'admin' ? 'Yönetici' : 'Meydan okuma'}</span>
            </div>
          );
        },
      },
      {
        id: 'time',
        header: 'Zaman',
        enableSorting: false,
        meta: { label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          const open = b.status === 'pending' || b.status === 'active';
          return (
            <div className="text-sm">
              <time dateTime={b.endTime} className="block">
                {fmtDateTime(b.endTime)}
              </time>
              <span className={open && b.view === 'overdue' ? 'text-xs text-warning' : 'text-xs text-fg-muted'}>
                {open ? fmtRemaining(b.endTime) : b.status === 'cancelled' ? 'İptal edildi' : 'Bitti'}
              </span>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-4 pt-4">
      <SectionTabs
        variant="pill"
        paramKey="view"
        defaultValue="live"
        resetKeys={['bpage']}
        ariaLabel="Savaş durumu"
        tabs={BATTLE_VIEW_TABS.map((t) => ({ value: t.value, label: t.label, count: t.value === 'all' ? undefined : counts?.[t.value] }))}
      />
      <FilterBar fields={BATTLE_FIELDS} resetKeys={['bpage']} ariaLabel="Savaş filtreleri" />
      {squadId ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted"><AdminKlanlarText k="clanFilter" /></span>
          <span className="font-medium text-fg">{squadName ?? 'Seçili klan'}</span>
          <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => set({ squadId: null, bpage: null })} aria-label="Klan süzgecini kaldır">
            <X className="h-4 w-4" aria-hidden />
            Kaldır
          </Button>
        </div>
      ) : null}
      <DataTable
        ariaLabel="Klan savaşları"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => `${r.squad1.name} – ${r.squad2.name}`}
        manualPagination
        manualFiltering
        rowCount={list.data?.total}
        pagination={table.pagination}
        onPaginationChange={table.onPaginationChange}
        filtered={filters.activeCount > 0 || !!squadId}
        activeRowId={get('battle')}
        onRowClick={(r) => onOpen(r.id)}
        empty={
          filters.activeCount > 0 || squadId
            ? {
                variant: 'filtered',
                title: 'Bu süzgeçlere uyan savaş yok',
                secondaryAction: (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      filters.clear();
                      set({ squadId: null });
                    }}
                  >
                    Süzgeçleri temizle
                  </Button>
                ),
              }
            : {
                title: view === 'live' ? 'Şu an canlı savaş yok' : view === 'pending' ? 'Yanıt bekleyen davet yok' : view === 'overdue' ? 'Kapanmayı bekleyen savaş yok' : 'Bu durumda savaş yok',
                description: view === 'overdue' ? 'Süresi dolan her savaş sonuçlandırılmış ya da iptal edilmiş.' : undefined,
              }
        }
      />
    </div>
  );
}

// ───────────────────────────── Moderasyon günlüğü ─────────────────────────────

function AuditTab() {
  const { get, set } = useUrlState();
  const page = Math.max(1, Number(get('apage')) || 1);
  const q = useQuery({ queryKey: squadsKeys.audit(page), queryFn: () => fetchAudit(page), placeholderData: keepPreviousData, staleTime: 15_000 });
  return (
    <div className="pt-4">
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Henüz moderasyon kaydı yok', description: 'Dondurma, ad değişikliği, savaş iptali gibi işlemler burada listelenir.' }}>
        {(d) => {
          const events: TimelineEvent[] = d.items.map((a) => ({
            id: a.id,
            title: (
              <span>
                {AUDIT_ACTION_LABEL[a.action] ?? a.action}
                {a.entityId && (a.entity === 'Squad' || a.entity === 'SquadBattle') && !a.entityId.includes(' ') ? (
                  <>
                    {' · '}
                    <Link
                      href={a.entity === 'Squad' ? `?tab=squads&squad=${encodeURIComponent(a.entityId)}` : `?tab=battles&view=all&battle=${encodeURIComponent(a.entityId)}`}
                      className="font-normal text-fg-muted underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {a.entity === 'Squad' ? 'klanı aç' : 'savaşı aç'}
                    </Link>
                  </>
                ) : null}
              </span>
            ),
            description: a.reason ?? undefined,
            at: a.createdAt,
            actor: a.actorName ?? undefined,
            tone: /FREEZE$|CANCEL$|REMOVE$|KICK$/.test(a.action) && a.action !== 'SQUAD_UNFREEZE' ? 'warning' : 'neutral',
          }));
          return (
            <>
              <Timeline events={events} groupByDay timeStyle="time" ariaLabel="Moderasyon günlüğü" />
              <Pager page={d.page} pageCount={Math.max(1, Math.ceil(d.total / d.size))} total={d.total} onPage={(p) => set({ apage: p > 1 ? p : null })} label="Moderasyon günlüğü" />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
