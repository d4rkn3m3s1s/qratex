'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  Ban,
  Download,
  Flag,
  ShieldCheck,
  Store,
  UserCheck,
  UserPlus,
  UserRoundCog,
  Users,
  UserX,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, statusBadgeProps, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, PageHeader, PanelPage, useFilterState, type FilterField } from '@/components/ds/page';
import { ConfirmAction, ErrorState } from '@/components/states';
import {
  EXPORT_MAX_ROWS,
  LIST_DEFAULT_PAGE_SIZE,
  LIST_DEFAULT_SORT,
  LIST_SORT_IDS,
  listQueryString,
  type UserListItem,
  type UserListPage,
  type UsersStats,
} from '@/lib/admin-users/contract';
import { bulkAction, errorText, fetchList, fetchStats, usersKeys } from './api';
import { CreateUserDialog } from './create-user-dialog';
import { FRAUD, ROLE_OPTIONS, STATUS, TRUST, displayName, fmtDate, fmtNumber, roleLabel, roleTone } from './format';
import { ReasonDialog, UserAvatar } from './parts';
import { AdminKullanicilarText } from './copy';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Ad, e-posta, işletme ya da kimlik', minLength: 2 },
  { type: 'select', key: 'role', label: 'Rol', allLabel: 'Tüm roller', options: ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })) },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: 'Etkin + askıda',
    options: [
      { value: 'active', label: 'Etkin' },
      { value: 'suspended', label: 'Askıda' },
      { value: 'anonymized', label: 'Anonimleştirilmiş' },
    ],
  },
  {
    type: 'select',
    key: 'trust',
    label: 'Güven',
    allLabel: 'Tüm kademeler',
    options: [
      { value: 'trusted', label: 'Güvenilir' },
      { value: 'neutral', label: 'Nötr' },
      { value: 'watch', label: 'İzlemede' },
      { value: 'low', label: 'Düşük güven' },
    ],
  },
  {
    type: 'select',
    key: 'fraud',
    label: 'Suistimal',
    allLabel: 'Tümü',
    options: [
      { value: 'clean', label: 'Temiz' },
      { value: 'flagged', label: 'İşaretli' },
      { value: 'shadow_ban', label: 'Gölge yasak' },
    ],
  },
  { type: 'select', key: 'plan', label: 'Plan', allLabel: 'Tümü', options: [{ value: 'has', label: 'Planı var' }, { value: 'none', label: 'Plansız' }] },
  { type: 'select', key: 'verified', label: 'E-posta', allLabel: 'Tümü', options: [{ value: 'yes', label: 'Doğrulanmış' }, { value: 'no', label: 'Doğrulanmamış' }] },
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type UsersInitial = {
  stats: UsersStats | null;
  list: { qs: string; page: UserListPage } | null;
};

export function UsersScreen({ initial }: { initial: UsersInitial }) {
  const router = useRouter();
  const qc = useQueryClient();
  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({
    defaultPageSize: LIST_DEFAULT_PAGE_SIZE,
    defaultSort: [{ id: 'createdAt', desc: true }],
    sortableIds: LIST_SORT_IDS,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [suspendIds, setSuspendIds] = useState<string[] | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filterQs = listQueryString({
    q: str(filters.values.q),
    role: str(filters.values.role),
    status: str(filters.values.status),
    trust: str(filters.values.trust),
    fraud: str(filters.values.fraud),
    plan: str(filters.values.plan),
    verified: str(filters.values.verified),
  });
  const qs = listQueryString({
    q: str(filters.values.q),
    role: str(filters.values.role),
    status: str(filters.values.status),
    trust: str(filters.values.trust),
    fraud: str(filters.values.fraud),
    plan: str(filters.values.plan),
    verified: str(filters.values.verified),
    sort: table.params.sort ?? LIST_DEFAULT_SORT,
    page: table.params.page,
    size: table.params.pageSize,
  });

  // Seçim filtre değişince sıfırlanır: görünmeyen satırlar toplu işleme sızmaz (B10).
  useEffect(() => setRowSelection({}), [filterQs]);

  const stats = useQuery({ queryKey: usersKeys.stats(), queryFn: fetchStats, initialData: initial.stats ?? undefined, staleTime: 60_000 });
  const list = useQuery({
    queryKey: usersKeys.list(qs),
    queryFn: ({ signal }) => fetchList(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial.list && initial.list.qs === qs ? initial.list.page : undefined,
    staleTime: 15_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: usersKeys.all });

  const columns = useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Kullanıcı',
        enableHiding: false,
        meta: { mobile: 'title', label: 'Kullanıcı', interactive: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={u.name} email={u.email} image={u.image} size="sm" />
              <div className="min-w-0">
                <Link href={`/admin/users/${u.id}`} className="block min-h-6 truncate font-medium leading-6 text-fg underline-offset-4 hover:underline focus-visible:underline">
                  {displayName(u)}
                </Link>
                <p className="truncate text-xs text-fg-muted">{u.email}</p>
                {u.isDemo ? <span className="text-xs text-fg-subtle"><AdminKullanicilarText k="demoAccount" /></span> : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'role',
        header: 'Rol',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Rol' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <StatusBadge size="sm" tone={roleTone(row.original.role)} icon={null} label={roleLabel(row.original.role)} />
            {row.original.staffOf ? <p className="truncate text-xs text-fg-muted">{row.original.staffOf}</p> : null}
            {row.original.role === 'DEALER' && row.original.businessName ? (
              <p className="truncate text-xs text-fg-muted">{row.original.businessName}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(STATUS, row.original.status)} />,
      },
      {
        id: 'trustScore',
        accessorKey: 'trustScore',
        header: 'Güven',
        meta: { label: 'Güven' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <StatusBadge size="sm" {...statusBadgeProps(TRUST, row.original.trustTier)} />
            {row.original.fraudStatus !== 'clean' ? <StatusBadge size="sm" {...statusBadgeProps(FRAUD, row.original.fraudStatus)} /> : null}
          </div>
        ),
      },
      {
        id: 'points',
        accessorKey: 'points',
        header: 'Puan',
        meta: { numeric: true, label: 'Puan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.points),
      },
      {
        id: 'level',
        accessorKey: 'level',
        header: 'Seviye',
        meta: { numeric: true, label: 'Seviye' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.level),
      },
      {
        id: 'plan',
        header: 'Plan',
        enableSorting: false,
        meta: { label: 'Plan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.role === 'DEALER' ? row.original.planName ?? <span className="text-fg-muted"><AdminKullanicilarText k="freeTier" /></span> : <span className="text-fg-subtle">—</span>),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Kayıt',
        meta: { label: 'Kayıt' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{fmtDate(row.original.createdAt)}</time>,
      },
    ],
    []
  );

  const s = stats.data;
  const kpiHref = (patch: Record<string, string>) => `?${listQueryString(patch)}`;
  const exportHref = `/api/admin/users/export?${filterQs}${filterQs ? '&' : ''}sort=${encodeURIComponent(table.params.sort ?? LIST_DEFAULT_SORT)}`;
  const total = list.data?.total ?? 0;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Kullanıcılar"
          description="Hesapları bulun, durumunu anlayın, gerekçeli ve geri alınabilir düzeltmeler yapın."
          icon={<Users />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild className="min-h-11 sm:min-h-10">
                <Link href="/admin/users/automation">
                  <Workflow className="h-4 w-4" aria-hidden />
                  Otomasyon kuralları
                </Link>
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" aria-hidden />
                Kullanıcı ekle
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
          <MetricTile label="Toplam hesap" metric={{ value: s?.total ?? 0 }} icon={<Users />} loading={!s} hint={s ? `Son 7 günde ${fmtNumber(s.newLast7d)} yeni` : undefined} href="?" />
          <MetricTile label="Müşteri" metric={{ value: s?.byRole.CUSTOMER ?? 0 }} icon={<UserCheck />} loading={!s} tone="success" href={kpiHref({ role: 'CUSTOMER' })} />
          <MetricTile
            label="Bayi · Personel"
            metric={{ value: (s?.byRole.DEALER ?? 0) + (s?.byRole.STAFF ?? 0) }}
            icon={<Store />}
            loading={!s}
            tone="info"
            hint={s ? `${fmtNumber(s.byRole.DEALER)} bayi · ${fmtNumber(s.byRole.STAFF)} personel` : undefined}
            href={kpiHref({ role: 'DEALER' })}
          />
          <MetricTile label="Yönetici" metric={{ value: s?.byRole.ADMIN ?? 0 }} icon={<ShieldCheck />} loading={!s} tone="danger" href={kpiHref({ role: 'ADMIN' })} />
          <MetricTile label="Askıda" metric={{ value: s?.suspended ?? 0 }} icon={<Ban />} loading={!s} tone="warning" href={kpiHref({ status: 'suspended' })} />
          <MetricTile label="Suistimal işaretli" metric={{ value: s?.flagged ?? 0 }} icon={<Flag />} loading={!s} tone="danger" href={kpiHref({ fraud: 'flagged' })} />
          <MetricTile label="Düşük güven / izlemede" metric={{ value: s?.lowTrust ?? 0 }} icon={<UserRoundCog />} loading={!s} tone="warning" href={kpiHref({ trust: 'watch' })} />
          <MetricTile label="Anonimleştirilmiş" metric={{ value: s?.anonymized ?? 0 }} icon={<UserX />} loading={!s} href={kpiHref({ status: 'anonymized' })} />
        </MetricGrid>
      )}

      <FilterBar fields={FIELDS} ariaLabel="Kullanıcı filtreleri">
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-10">
          <a href={exportHref} download aria-label={`Filtre sonucunu CSV olarak indir (${fmtNumber(Math.min(total, EXPORT_MAX_ROWS))} satır)`}>
            <Download className="h-4 w-4" aria-hidden />
            CSV ({fmtNumber(Math.min(total, EXPORT_MAX_ROWS))})
          </a>
        </Button>
      </FilterBar>

      <DataTable
        ariaLabel="Kullanıcılar"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => displayName(r)}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        empty={
          filters.activeCount > 0
            ? {
                variant: 'filtered',
                title: 'Filtrelere uyan kullanıcı yok',
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : { variant: 'first-use', title: 'Henüz kullanıcı yok', action: <Button className="min-h-11" onClick={() => setCreateOpen(true)}><AdminKullanicilarText k="addUser" /></Button> }
        }
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        bulkActions={({ ids, clear }) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setSuspendIds(ids)}>
              <Ban className="h-4 w-4" aria-hidden />
              Askıya al
            </Button>
            <ConfirmAction
              tone="brand"
              trigger={
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Askıdan çıkar
                </Button>
              }
              title={`${ids.length} hesap askıdan çıkarılsın mı?`}
              description="Yalnız şu an askıda olan hesaplar etkilenir; diğerleri atlanır."
              confirmLabel="Askıdan çıkar"
              onConfirm={async () => {
                const r = await bulkAction({ action: 'unsuspend', userIds: ids });
                toast.success(`${fmtNumber(r.unsuspended ?? 0)} hesap askıdan çıkarıldı${r.skipped?.length ? ` · ${r.skipped.length} atlandı` : ''}`);
                clear();
                refresh();
              }}
            />
            <ConfirmAction
              tone="danger"
              trigger={
                <Button size="sm" variant="outline" className="min-h-11 text-danger sm:min-h-9">
                  <UserX className="h-4 w-4" aria-hidden />
                  Anonimleştir
                </Button>
              }
              title={`${ids.length} hesap KVKK kapsamında anonimleştirilsin mi?`}
              description="Hesaplar silinmez; kişisel veriler geri döndürülemez biçimde kaldırılır, denetim izi ve istatistikler korunur. Yönetici hesapları ve aboneliği süren bayiler atlanır."
              loadImpact={async () => {
                const r = await bulkAction({ action: 'delete', userIds: ids, dryRun: true });
                return {
                  items: (r.impact?.items ?? []).map((i) => ({ label: i.label, value: fmtNumber(i.value), emphasis: i.emphasis })),
                  warning: r.impact?.warning,
                };
              }}
              confirmPhrase="ANONİMLEŞTİR"
              confirmLabel="Anonimleştir"
              onConfirm={async () => {
                const r = await bulkAction({ action: 'delete', userIds: ids, confirm: true });
                toast.success(`${fmtNumber(r.anonymized ?? 0)} hesap anonimleştirildi${r.skipped?.length ? ` · ${r.skipped.length} atlandı` : ''}`);
                clear();
                refresh();
              }}
            />
          </div>
        )}
        onRowClick={(r) => router.push(`/admin/users/${r.id}`)}
      />

      <ReasonDialog
        open={suspendIds != null}
        onOpenChange={(o) => !o && setSuspendIds(null)}
        title={`${suspendIds?.length ?? 0} hesap askıya alınsın mı?`}
        description="Askıdaki hesap giriş yapamaz ve açık oturumları hemen düşer. İşlem geri alınabilir. Yönetici hesapları atlanır."
        label="Askıya alma gerekçesi"
        confirmLabel="Askıya al"
        onConfirm={async (reason) => {
          const r = await bulkAction({ action: 'suspend', userIds: suspendIds ?? [], reason });
          toast.success(`${fmtNumber(r.suspended ?? 0)} hesap askıya alındı${r.skipped?.length ? ` · ${r.skipped.length} atlandı` : ''}`);
          setRowSelection({});
          refresh();
        }}
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          refresh();
          router.push(`/admin/users/${id}`);
        }}
      />
    </PanelPage>
  );
}
