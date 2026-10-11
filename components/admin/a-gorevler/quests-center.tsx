'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertTriangle, Coins, LayoutTemplate, Loader2, PauseCircle, Plus, RefreshCw, Sparkles, Target, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  statusBadgeProps,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { FilterBar, PageHeader, PanelPage, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import {
  CADENCE_LABEL,
  CREATABLE_MECHANICS,
  MECHANIC_META,
  QUEST_CADENCES,
  QUEST_DEFAULT_SORT,
  QUEST_PAGE_SIZE,
  QUEST_SORT_IDS,
  QUEST_STATUS_FILTERS,
  QUEST_TEMPLATES,
  WARNING_LABEL,
  queryString,
  type QuestListItem,
  type QuestListPage,
  type QuestStats,
  type QuestStatusFilter,
} from '@/lib/admin-quests/contract';
import { addAchievements, errorText, fetchQuests, fetchStats, questsKeys } from './api';
import { QuestActions } from './quest-actions';
import { QuestDetailBody } from './quest-detail';
import { QuestEditor, templateValues, type EditorTarget } from './quest-editor';
import { QUEST_STATUS_MAP, fmtDateTime, fmtNumber, fmtRemaining, pct } from './format';
import { AdminGorevlerText } from './copy';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type QuestsInitial = {
  stats: QuestStats | null;
  list: { qs: string; page: QuestListPage } | null;
};

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Görev adı, açıklama ya da kimlik', minLength: 2 },
  {
    type: 'select',
    key: 'mechanic',
    label: 'Mekanik',
    allLabel: 'Tümü',
    options: [...CREATABLE_MECHANICS, 'achievement' as const].map((m) => ({ value: m, label: MECHANIC_META[m].label })),
  },
  { type: 'select', key: 'cadence', label: 'Dönem', allLabel: 'Tümü', options: QUEST_CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] })) },
];

const STATUS_TABS: Array<{ value: QuestStatusFilter; label: string }> = [
  { value: 'active', label: 'Yayında' },
  { value: 'paused', label: 'Duraklatıldı' },
  { value: 'expired', label: 'Süresi doldu' },
  { value: 'archived', label: 'Arşiv' },
  { value: 'all', label: 'Tümü' },
];

export function QuestsCenter({ initial }: { initial: QuestsInitial }) {
  const qc = useQueryClient();
  const { get } = useUrlState();
  const stats = useQuery({ queryKey: questsKeys.stats(), queryFn: fetchStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const s = stats.data;
  const sheet = useDetailSheet('quest', { history: 'push' });
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultPageSize: QUEST_PAGE_SIZE, defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: QUEST_SORT_IDS });
  const statusRaw = get('status');
  const status = ((QUEST_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? '') ? statusRaw : 'active') as QuestStatusFilter;
  const qs = queryString({
    q: str(filters.values.q),
    status,
    mechanic: str(filters.values.mechanic),
    cadence: str(filters.values.cadence),
    sort: table.params.sort ?? QUEST_DEFAULT_SORT,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: questsKeys.list(qs),
    queryFn: ({ signal }) => fetchQuests(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial.list && initial.list.qs === qs ? initial.list.page : undefined,
    staleTime: 15_000,
  });
  const counts = list.data?.counts ?? s?.counts;

  const openEdit = (id: string) => setEditor({ mode: 'edit', id });

  const columns = useMemo<ColumnDef<QuestListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Görev',
        enableHiding: false,
        meta: { mobile: 'title', label: 'Görev' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const q = row.original;
          return (
            <div className="flex min-w-0 max-w-sm items-center gap-3">
              <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-lg ring-1 ring-inset ring-brand-border">
                {q.icon && !q.icon.startsWith('/') ? q.icon : '🎯'}
              </span>
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{q.name}</span>
                <span className="block truncate text-xs text-fg-muted">{q.description}</span>
                {q.warnings.filter((w) => w !== 'expiring_soon').map((w) => (
                  <span key={w} className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {WARNING_LABEL[w]}
                  </span>
                ))}
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(QUEST_STATUS_MAP, row.original.status)} />,
      },
      {
        id: 'mechanic',
        header: 'Mekanik',
        enableSorting: false,
        meta: { label: 'Mekanik' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const q = row.original;
          const meta = MECHANIC_META[q.mechanic];
          return (
            <div className="text-sm">
              <span className="block">{meta.label}</span>
              <span className="block text-xs text-fg-muted">
                {CADENCE_LABEL[q.cadence]} · {fmtNumber(q.target)} {meta.unit}
                {q.category ? ` · ${q.category} (${fmtNumber(q.categoryDealers)} işletme)` : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'reward',
        header: 'Ödül',
        enableSorting: false,
        meta: { label: 'Ödül', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {fmtNumber(row.original.reward.points)} puan
            <span className="block text-xs text-fg-muted">{fmtNumber(row.original.reward.xp)} XP</span>
          </span>
        ),
      },
      {
        id: 'funnel',
        header: 'Tamamlayan / ödül alan',
        enableSorting: false,
        meta: { label: 'Tamamlayan / ödül alan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const m = row.original.metrics;
          const base = Math.max(m.participants, m.completed);
          return (
            <div className="min-w-[8rem] space-y-1 text-sm">
              <span className="qx-num block">
                {fmtNumber(m.completed)} / {fmtNumber(m.rewardedUsers)}
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full bg-success" style={{ width: `${pct(m.rewardedUsers, base)}%` }} />
              </div>
            </div>
          );
        },
      },
      {
        id: 'ledger',
        header: 'Son 30 gün',
        enableSorting: false,
        meta: { label: 'Son 30 gün', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const m = row.original.metrics;
          return (
            <span className="whitespace-nowrap text-sm">
              {fmtNumber(m.points30d)} puan
              <span className="block text-xs text-fg-muted">{fmtNumber(m.payouts30d)} ödeme</span>
            </span>
          );
        },
      },
      {
        id: 'expiresAt',
        accessorKey: 'expiresAt',
        header: 'Bitiş',
        meta: { label: 'Bitiş' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const q = row.original;
          return q.expiresAt ? (
            <div className="text-sm">
              <time dateTime={q.expiresAt} className="block whitespace-nowrap">
                {fmtDateTime(q.expiresAt)}
              </time>
              <span className={q.warnings.includes('expiring_soon') ? 'text-xs text-warning' : 'text-xs text-fg-muted'}>{fmtRemaining(q.expiresAt)}</span>
            </div>
          ) : (
            <span className="text-sm text-fg-muted"><AdminGorevlerText k="noExpiry" /></span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only"><AdminGorevlerText k="actions" /></span>,
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'actions', interactive: true, align: 'end', label: 'İşlemler' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <QuestActions quest={row.original} onEdit={openEdit} onOpenCreated={sheet.open} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const seedAchievements = async () => {
    setSeeding(true);
    try {
      const r = await addAchievements();
      toast.success(r.created ? `${r.created} başarım duraklatılmış olarak eklendi; gözden geçirip yayına alın.` : 'Tüm başarımlar zaten mevcut.');
      await qc.invalidateQueries({ queryKey: questsKeys.all });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSeeding(false);
    }
  };

  const filtered = filters.activeCount > 0;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Görev Yönetimi"
          description="Motoru olan mekaniklerden görev oluşturun, zamanlayın, ödülünü ekonomiye göre ayarlayın ve gerçekten tamamlanıp tamamlanmadığını izleyin."
          icon={<Target />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: questsKeys.all })} aria-label="Görevleri yenile">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Yenile
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate className="h-4 w-4" aria-hidden />
                Şablondan
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="h-4 w-4" aria-hidden />
                Yeni görev
              </Button>
            </div>
          }
        />
      }
    >
      {s && !s.moduleEnabled ? (
        <div role="status" className="qx-small flex flex-wrap items-start gap-2 rounded-card border border-warning-border bg-warning-subtle px-4 py-3 text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1"><AdminGorevlerText k="moduleOff" /></span>
          <Link href="/admin/settings?tab=modules" className="font-medium underline underline-offset-4">
            Modüller’den aç
          </Link>
        </div>
      ) : null}

      {stats.isError ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile label="Yayında" metric={{ value: s?.counts.active ?? null }} icon={<Target />} tone="success" loading={!s} animate hint={s ? `${fmtNumber(s.counts.paused)} duraklatılmış · ${fmtNumber(s.counts.expired)} süresi dolmuş` : undefined} href="?status=active" />
          <MetricTile
            label="Basılan görev puanı (7 gün)"
            metric={{ value: s?.rewards7d.points ?? null, unit: 'puan', series: s?.dailyPoints14d }}
            icon={<Coins />}
            tone="brand"
            loading={!s}
            animate
            sparklineLabel={s ? `Son 14 günün günlük görev puanı; toplam ${fmtNumber(s.dailyPoints14d.reduce((a, b) => a + b, 0))}` : undefined}
            hint={s ? `${fmtNumber(s.rewards7d.payouts)} ödeme · 30 günde ${fmtNumber(s.rewards30d.points)} puan` : undefined}
          />
          <MetricTile label="Ödül alımı (30 gün)" metric={{ value: s?.rewards30d.payouts ?? null }} icon={<Trophy />} tone="info" loading={!s} animate hint="Puan defterindeki görev ödemeleri" />
          <MetricTile
            label="Dikkat gerektiren"
            metric={{ value: s?.needsAttention ?? null }}
            icon={<AlertTriangle />}
            tone={s && s.needsAttention > 0 ? 'warning' : 'neutral'}
            loading={!s}
            hint="Yayında ama tamamlanamayacak (eşleşmeyen kategori, tanınmayan mekanik)"
          />
        </MetricGrid>
      )}

      {s && s.missingAchievements > 0 ? (
        <div className="qx-small flex flex-wrap items-center gap-3 rounded-card border border-subtle bg-surface-1 px-4 py-3 text-fg">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden />
          <span className="min-w-0 flex-1">{fmtNumber(s.missingAchievements)} sistem başarımı (kozmetik, hediye, vitrin) tanımlı değil.</span>
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={seedAchievements} disabled={seeding} aria-busy={seeding || undefined}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            Eksik başarımları ekle
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        <SectionTabs
          variant="pill"
          paramKey="status"
          defaultValue="active"
          resetKeys={['page']}
          ariaLabel="Görev durumu"
          tabs={STATUS_TABS.map((t) => ({
            value: t.value,
            label: t.label,
            count: t.value === 'all' ? (counts ? counts.active + counts.paused + counts.expired + counts.archived : undefined) : counts?.[t.value],
          }))}
        />
        <FilterBar fields={FIELDS} ariaLabel="Görev filtreleri" resetKeys={['page']} />
        <p className="sr-only" aria-live="polite">
          {list.data ? `${fmtNumber(list.data.total)} görev bulundu` : ''}
        </p>
        <DataTable
          ariaLabel="Görevler"
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
          filtered={filtered}
          activeRowId={sheet.id}
          onRowClick={(r) => sheet.open(r.id)}
          empty={
            filtered
              ? {
                  variant: 'filtered',
                  title: 'Filtrelere uyan görev yok',
                  secondaryAction: (
                    <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                      Filtreleri temizle
                    </Button>
                  ),
                }
              : status === 'active'
                ? {
                    title: 'Yayında görev yok',
                    description: 'Şablondan ya da sıfırdan bir görev oluşturup yayınlayın.',
                    secondaryAction: (
                      <Button className="min-h-11" onClick={() => setTemplatesOpen(true)}>
                        <LayoutTemplate className="h-4 w-4" aria-hidden />
                        Şablondan başla
                      </Button>
                    ),
                  }
                : { title: status === 'paused' ? 'Duraklatılmış görev yok' : status === 'expired' ? 'Süresi dolmuş görev yok' : status === 'archived' ? 'Arşivde görev yok' : 'Henüz görev yok' }
          }
        />
      </div>

      <DetailSheet paramKey="quest" size="lg" history="push" title="Görev ayrıntısı" description="Tanım, performans, son tamamlayanlar ve değişiklik geçmişi">
        {(id) => <QuestDetailBody id={id} onEdit={openEdit} onOpen={sheet.open} />}
      </DetailSheet>

      <QuestEditor
        target={editor}
        onOpenChange={(o) => !o && setEditor(null)}
        rewardDefault={s?.rewardDefault}
        onSaved={(id, mode) => {
          void qc.invalidateQueries({ queryKey: questsKeys.all });
          if (mode === 'create') sheet.open(id);
        }}
      />

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle><AdminGorevlerText k="fromTemplate" /></DialogTitle>
            <DialogDescription><AdminGorevlerText k="templateHint" /></DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 sm:grid-cols-2">
            {QUEST_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="group flex min-h-11 w-full items-start gap-3 rounded-card border border-subtle bg-surface-1 p-3 text-left transition-colors duration-fast hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => {
                    setTemplatesOpen(false);
                    setEditor({ mode: 'create', initial: templateValues(t, s?.rewardDefault) });
                  }}
                >
                  <span aria-hidden className="text-2xl leading-none">
                    {t.values.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="qx-small block font-semibold text-fg">{t.title}</span>
                    <span className="qx-caption block text-fg-muted">{t.summary}</span>
                    <span className="qx-caption block text-fg-muted">{MECHANIC_META[t.values.mechanic].label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Duraklatılmış görev sayısı kısayolu (ekran okuyucu için bağlam) */}
      {s && s.counts.paused > 0 && status === 'active' ? (
        <p className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
          <PauseCircle className="h-3.5 w-3.5" aria-hidden />
          {fmtNumber(s.counts.paused)} görev duraklatılmış bekliyor —{' '}
          <Link href="?status=paused" className="underline underline-offset-4">
            göster
          </Link>
        </p>
      ) : null}
    </PanelPage>
  );
}
