'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  CalendarRange,
  Download,
  Eye,
  EyeOff,
  FlagOff,
  Gauge,
  MessageSquare,
  MessagesSquare,
  MoreVertical,
  Reply,
  ShieldAlert,
  Sparkles,
  Star,
  ThumbsDown,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import {
  FilterBar,
  PageHeader,
  PanelPage,
  SectionTabs,
  clearFiltersPatch,
  useFilterState,
  useUrlState,
  type FilterField,
} from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  BULK_ACTION_LABEL,
  FEED_DEFAULT_PAGE_SIZE,
  FEED_DEFAULT_VIEW,
  FEED_EXPORT_MAX_ROWS,
  FEED_FLAGS,
  FEED_PERIODS,
  FEED_SENTIMENTS,
  FEED_SORT_IDS,
  FEED_VIEWS,
  FLAG_LABEL,
  PERIOD_LABEL,
  QR_ONLY_ACTIONS,
  REASON_REQUIRED,
  SENTIMENT_LABEL,
  SOURCE_LABEL,
  VIEW_LABEL,
  canonicalFeedQs,
  canonicalStatsQs,
  parseFeedKey,
  parseFeedQuery,
  type BulkAction,
  type BulkResult,
  type FeedItem,
  type FeedPage,
  type FeedStats,
  type FeedView,
} from '@/lib/admin-feedbacks/contract';
import { errorText, feedbackKeys, fetchFeed, fetchStats, runBulk } from './api';
import { DealerFilter } from './dealer-filter';
import { DetailActions, FeedbackDetail } from './detail-panel';
import { FlagBadges, ReasonDialog, SentimentBadge, Stars, fmtDateTime, fmtHours, fmtNumber, fmtRelative } from './parts';
import { AdminGeriBildirimlerText } from './copy';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Yorum, müşteri, e-posta, bayi, QR ya da ürün', minLength: 2, debounceMs: 350 },
  {
    type: 'select',
    key: 'source',
    label: 'Kaynak',
    allLabel: 'Tüm kaynaklar',
    options: [
      { value: 'qr', label: SOURCE_LABEL.qr },
      { value: 'consumption', label: SOURCE_LABEL.consumption },
    ],
  },
  { type: 'select', key: 'sentiment', label: 'Duygu', allLabel: 'Tüm duygular', options: FEED_SENTIMENTS.map((s) => ({ value: s, label: SENTIMENT_LABEL[s] })) },
  {
    type: 'select',
    key: 'rating',
    label: 'Puan',
    multiple: true,
    options: ['5', '4', '3', '2', '1'].map((r) => ({ value: r, label: `${r} yıldız` })),
  },
  { type: 'select', key: 'flags', label: 'İşaret', multiple: true, options: FEED_FLAGS.map((f) => ({ value: f, label: FLAG_LABEL[f] })) },
  { type: 'select', key: 'period', label: 'Dönem', allLabel: 'Tüm zamanlar', options: FEED_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })) },
];

const VIEW_HINT: Record<FeedView, string> = {
  attention: '1–2 yıldız ve yanıtsız, toksik, güven ya da sahte şüphesi işaretli kayıtlar',
  all: 'Çöp kutusu dışındaki bütün geri bildirimler',
  unreplied: 'Bayinin henüz yanıtlamadığı geri bildirimler',
  flagged: 'Toksik, güven işaretli ya da sahte yorum skoru %70 ve üstü',
  hidden: 'Yayından gizlenmiş (silinmemiş) QR yorumları',
  trash: 'Çöp kutusu — geri yüklenebilir; hiçbir kayıt kalıcı silinmez',
};

export type FeedbacksInitial = {
  stats: { qs: string; data: FeedStats } | null;
  list: { qs: string; data: FeedPage } | null;
};

type Pending = { action: BulkAction; keys: string[] } | null;

function resultMessage(r: BulkResult): string {
  const base =
    r.action === 'remind'
      ? `${fmtNumber(r.notifiedDealers ?? 0)} bayiye hatırlatma gönderildi (${fmtNumber(r.affected)} kayıt)`
      : `${fmtNumber(r.affected)} kayıt: ${BULK_ACTION_LABEL[r.action].toLocaleLowerCase('tr-TR')} tamamlandı`;
  return r.skipped.length ? `${base} · ${fmtNumber(r.skipped.length)} atlandı` : base;
}

export function FeedbacksScreen({ initial }: { initial: FeedbacksInitial }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const url = useUrlState();
  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({
    defaultPageSize: FEED_DEFAULT_PAGE_SIZE,
    defaultSort: [{ id: 'createdAt', desc: true }],
    sortableIds: FEED_SORT_IDS,
  });
  const sheet = useDetailSheet('id', { history: 'push' });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pending, setPending] = useState<Pending>(null);

  // Tek doğruluk kaynağı URL: sunucu ön yüklemesiyle AYNI ayrıştırıcı ve kanonik anahtar.
  const query = useMemo(() => parseFeedQuery(sp), [sp]);
  const view: FeedView = query.view ?? FEED_DEFAULT_VIEW;
  const listQs = canonicalFeedQs(query);
  const statsQs = canonicalStatsQs(query);
  const selectionScope = canonicalStatsQs(query) + `|${view}`;

  // Görünüm ya da filtre değişince seçim sıfırlanır: görünmeyen satır toplu işleme sızmaz.
  useEffect(() => setRowSelection({}), [selectionScope]);

  const stats = useQuery({
    queryKey: feedbackKeys.stats(statsQs),
    queryFn: ({ signal }) => fetchStats(statsQs, signal),
    initialData: initial.stats && initial.stats.qs === statsQs ? initial.stats.data : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const list = useQuery({
    queryKey: feedbackKeys.list(listQs),
    queryFn: ({ signal }) => fetchFeed(listQs, signal),
    initialData: initial.list && initial.list.qs === listQs ? initial.list.data : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: feedbackKeys.all }), [qc]);

  const execute = useCallback(
    async (action: BulkAction, keys: string[], reason?: string) => {
      const r = await runBulk({ action, keys, reason });
      const changed = keys.filter((k) => !r.skipped.some((s) => s.key === k));
      const msg = resultMessage(r);
      if (r.affected === 0) {
        toast.warning(msg, { description: r.skipped[0]?.reason });
      } else if (action === 'delete' && changed.length) {
        toast.success(msg, {
          description: 'Kayıtlar çöp kutusunda; istediğiniz an geri yükleyebilirsiniz.',
          action: {
            label: 'Geri al',
            onClick: () => {
              runBulk({ action: 'restore', keys: changed })
                .then((u) => {
                  toast.success(resultMessage(u));
                  refresh();
                })
                .catch((e) => toast.error(errorText(e, 'Geri alınamadı.')));
            },
          },
        });
      } else {
        toast.success(msg);
      }
      setRowSelection({});
      refresh();
      return r;
    },
    [refresh]
  );

  /** Aksiyon isteği: gerekçeli olanlar diyalog açar, diğerleri doğrudan çalışır (hepsi geri alınabilir). */
  const requestAction = useCallback(
    (action: BulkAction, keys: string[]) => {
      if (!keys.length) return;
      if (REASON_REQUIRED.includes(action)) {
        setPending({ action, keys });
        return;
      }
      execute(action, keys).catch((e) => toast.error(errorText(e)));
    },
    [execute]
  );

  const columns = useMemo<ColumnDef<FeedItem>[]>(
    () => [
      {
        id: 'feedback',
        header: 'Geri bildirim',
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'title', label: 'Geri bildirim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = row.original;
          return (
            <div className="min-w-0 max-w-[34rem] space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <SentimentBadge value={f.sentiment} />
                <StatusBadge size="sm" tone="neutral" icon={null} label={f.source === 'qr' ? 'QR' : 'Tüketim'} />
                <FlagBadges isToxic={f.isToxic} trustFlagged={f.trustFlagged} fraudScore={f.fraudScore} isPublic={f.isPublic} deletedAt={f.deletedAt} />
              </div>
              {f.text ? (
                <p className="line-clamp-2 break-words text-sm text-fg">{f.text}</p>
              ) : (
                <p className="text-sm italic text-fg-muted"><AdminGeriBildirimlerText k="ratingNoComment" /></p>
              )}
              {f.topics.length ? <p className="truncate text-xs text-fg-muted">Konular: {f.topics.join(' · ')}</p> : null}
            </div>
          );
        },
      },
      {
        id: 'rating',
        accessorKey: 'rating',
        header: 'Puan',
        meta: { label: 'Puan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <Stars rating={row.original.rating} />,
      },
      {
        id: 'dealer',
        header: 'Bayi',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Bayi' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[14rem]">
            <p className="truncate font-medium text-fg">{row.original.dealerName}</p>
            {row.original.place ? <p className="truncate text-xs text-fg-muted">{row.original.place}</p> : null}
          </div>
        ),
      },
      {
        id: 'user',
        header: 'Müşteri',
        enableSorting: false,
        meta: { label: 'Müşteri' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.userId ? (
            <div className="min-w-0 max-w-[12rem]">
              <p className="truncate text-fg">{row.original.userName || 'Adsız müşteri'}</p>
              {row.original.userEmail ? <p className="truncate text-xs text-fg-muted">{row.original.userEmail}</p> : null}
            </div>
          ) : (
            <span className="text-fg-muted">Anonim</span>
          ),
      },
      {
        id: 'reply',
        header: 'Yanıt',
        enableSorting: false,
        meta: { label: 'Bayi yanıtı' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.replied ? (
            <StatusBadge size="sm" tone="success" label="Yanıtlandı" />
          ) : (
            <StatusBadge size="sm" tone={row.original.rating <= 2 ? 'warning' : 'neutral'} label="Yanıtsız" />
          ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Tarih',
        meta: { label: 'Tarih' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={fmtDateTime(row.original.createdAt)} className="whitespace-nowrap text-sm text-fg-muted">
            {fmtRelative(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'actions', interactive: true, label: 'İşlemler', width: '3.5rem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RowMenu item={row.original} onOpen={() => sheet.open(row.original.key)} onAction={requestAction} />,
      },
    ],
    [requestAction, sheet]
  );

  const s = stats.data;
  const total = list.data?.total ?? 0;
  const customRange = query.from || query.to ? `${query.from ?? '…'} – ${query.to ?? 'bugün'}` : null;
  const filtered = filters.activeCount > 0 || !!query.dealer || !!customRange;
  const clearAll = () =>
    url.set({ ...clearFiltersPatch(FIELDS), dealer: null, from: null, to: null }, { resetKeys: ['page', 'id'] });
  const exportQs = canonicalFeedQs({ ...query, page: 1, size: FEED_DEFAULT_PAGE_SIZE });
  const negativeShare = s && s.total > 0 ? (s.negative / s.total) * 100 : null;
  const replyShare = s && s.total > 0 ? (s.replied / s.total) * 100 : null;
  const pageKeys = list.data?.items.map((i) => i.key) ?? [];

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Geri bildirimler"
          description="Platformun müşteri sesi: dikkat gerektirenleri ayıklayın, bağlamı okuyun, gerekçeli ve geri alınabilir moderasyon yapın."
          icon={<MessageSquare />}
          actions={
            <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
              <a
                href={`/api/admin/feedbacks/export?${exportQs}`}
                download
                aria-label={`Bu görünümü CSV olarak indir (${fmtNumber(Math.min(total, FEED_EXPORT_MAX_ROWS))} satır)`}
              >
                <Download className="h-4 w-4" aria-hidden />
                CSV ({fmtNumber(Math.min(total, FEED_EXPORT_MAX_ROWS))})
              </a>
            </Button>
          }
        />
      }
    >
      {stats.isError && !s ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile label="Geri bildirim" metric={{ value: s?.total ?? 0 }} icon={<MessagesSquare />} loading={!s} hint={filtered ? 'Filtrelere göre' : 'Çöp kutusu hariç'} />
          <MetricTile
            label="Ortalama puan"
            metric={{ value: s?.avgRating ?? 0, n: s?.total, minN: 20 }}
            icon={<Star />}
            loading={!s}
            hint={s?.avgRating == null ? 'Veri yok' : '5 üzerinden'}
          />
          <MetricTile
            label="Olumsuz oranı"
            metric={{ value: negativeShare ?? 0, format: 'percent' }}
            icon={<ThumbsDown />}
            tone="danger"
            loading={!s}
            hint={s ? `${fmtNumber(s.negative)} olumsuz · ${fmtNumber(s.pending)} analiz bekliyor` : undefined}
          />
          <MetricTile
            label="Bayi yanıt oranı"
            metric={{ value: replyShare ?? 0, format: 'percent' }}
            icon={<Reply />}
            tone="info"
            loading={!s}
            hint={s ? `Ortalama yanıt süresi ${fmtHours(s.avgReplyHours)}` : undefined}
          />
        </MetricGrid>
      )}

      {s ? <RatingStrip stats={s} selected={query.rating ?? []} onPick={(r) => url.set({ rating: r ? [r] : null }, { resetKeys: ['page', 'id'] })} /> : null}

      <FilterBar fields={FIELDS} ariaLabel="Geri bildirim filtreleri" resetKeys={['page', 'id']}>
        <DealerFilter />
        {customRange ? (
          <Button variant="outline" size="sm" className="min-h-11 gap-2 border-brand-border bg-brand-subtle sm:min-h-9" onClick={() => url.set({ from: null, to: null }, { resetKeys: ['page'] })} aria-label={`Özel tarih aralığını kaldır: ${customRange}`}>
            <CalendarRange className="h-4 w-4" aria-hidden />
            {customRange}
            <X className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
        {filtered ? (
          <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={clearAll}>
            Filtreleri temizle
          </Button>
        ) : null}
      </FilterBar>

      <SectionTabs
        paramKey="view"
        defaultValue={FEED_DEFAULT_VIEW}
        resetKeys={['page', 'id']}
        ariaLabel="Görünümler"
        tabs={FEED_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: s?.views[v] }))}
      />
      <p className="-mt-2 text-sm text-fg-muted" aria-live="polite">
        {VIEW_HINT[view]}
        {view === 'flagged' || view === 'hidden' ? ' · Görünürlük ve işaret alanları yalnız QR yorumlarında bulunur.' : ''}
      </p>

      <DataTable
        ariaLabel={`Geri bildirimler — ${VIEW_LABEL[view]}`}
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.key}
        getRowLabel={(r) => `${r.userName || 'Anonim'}, ${r.dealerName}, ${r.rating} yıldız`}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filtered}
        empty={
          filtered
            ? {
                variant: 'filtered',
                title: 'Filtrelere uyan geri bildirim yok',
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={clearAll}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : view === 'attention'
              ? { variant: 'first-use', title: 'Dikkat gerektiren kayıt yok', description: 'Düşük puanlı yanıtsız ya da işaretli geri bildirim kalmadı.' }
              : view === 'trash'
                ? { variant: 'first-use', title: 'Çöp kutusu boş' }
                : { variant: 'first-use', title: 'Bu görünümde geri bildirim yok' }
        }
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        bulkActions={({ ids }) => <BulkBar view={view} keys={ids} onAction={requestAction} />}
        onRowClick={(r) => sheet.open(r.key)}
        activeRowId={sheet.id ?? undefined}
      />

      <DetailSheet
        title={(key) => {
          const p = parseFeedKey(key);
          return p ? SOURCE_LABEL[p.source] : 'Geri bildirim';
        }}
        description="Bağlam, yapay zekâ sinyalleri, bayi yanıtı ve moderasyon geçmişi"
        siblings={pageKeys}
        size="lg"
        footer={(key) => <DetailActions feedKey={key} onAction={requestAction} />}
      >
        {(key) => (parseFeedKey(key) ? <FeedbackDetail feedKey={key} /> : <ErrorState title="Geçersiz kayıt bağlantısı" description="Bağlantıdaki kayıt kimliği tanınmadı." />)}
      </DetailSheet>

      <ReasonDialog
        open={pending != null}
        onOpenChange={(o) => !o && setPending(null)}
        tone={pending?.action === 'delete' ? 'danger' : 'warning'}
        title={pending ? `${fmtNumber(pending.keys.length)} kayıt: ${BULK_ACTION_LABEL[pending.action].toLocaleLowerCase('tr-TR')}` : ''}
        description={
          pending?.action === 'delete'
            ? 'Kayıtlar çöp kutusuna taşınır; listeden, bayi ve müşteri ekranlarından kalkar. Kalıcı silinmez, geri yüklenebilir. Puan ve telafi geçmişi korunur.'
            : pending?.action === 'hide'
              ? 'QR yorumu herkese açık yüzeylerden kalkar, bayi ve yönetici görmeye devam eder. Tüketim yorumları atlanır.'
              : 'Yorum toksik olarak işaretlenir ve yayından gizlenir. Tüketim yorumları atlanır.'
        }
        confirmLabel={pending ? BULK_ACTION_LABEL[pending.action] : ''}
        onConfirm={async (reason) => {
          if (!pending) return;
          await execute(pending.action, pending.keys, reason);
        }}
      />
    </PanelPage>
  );
}

/* ───────────────────────── Parçalar ───────────────────────── */

function BulkBar({ view, keys, onAction }: { view: FeedView; keys: string[]; onAction: (a: BulkAction, keys: string[]) => void }) {
  const btn = 'min-h-11 sm:min-h-9';
  const consumptionOnly = keys.every((k) => k.startsWith('consumption:'));
  if (view === 'trash') {
    return (
      <Button size="sm" className={btn} onClick={() => onAction('restore', keys)}>
        <Undo2 className="h-4 w-4" aria-hidden />
        Geri yükle
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className={btn} onClick={() => onAction('remind', keys)}>
        <Bell className="h-4 w-4" aria-hidden />
        Bayiye hatırlat
      </Button>
      {view === 'hidden' ? (
        <Button size="sm" variant="outline" className={btn} onClick={() => onAction('show', keys)}>
          <Eye className="h-4 w-4" aria-hidden />
          Yeniden yayınla
        </Button>
      ) : (
        <Button size="sm" variant="outline" className={btn} disabled={consumptionOnly} title={consumptionOnly ? 'Tüketim yorumlarında görünürlük alanı yok' : undefined} onClick={() => onAction('hide', keys)}>
          <EyeOff className="h-4 w-4" aria-hidden />
          Gizle
        </Button>
      )}
      <Button size="sm" variant="outline" className={btn} disabled={consumptionOnly} onClick={() => onAction('flag', keys)}>
        <ShieldAlert className="h-4 w-4" aria-hidden />
        Toksik işaretle
      </Button>
      {view === 'flagged' || view === 'attention' ? (
        <Button size="sm" variant="outline" className={btn} disabled={consumptionOnly} onClick={() => onAction('clearFlags', keys)}>
          <FlagOff className="h-4 w-4" aria-hidden />
          İşaretleri temizle
        </Button>
      ) : null}
      <Button size="sm" variant="outline" className={cn(btn, 'text-danger-text')} onClick={() => onAction('delete', keys)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Çöp kutusuna taşı
      </Button>
    </div>
  );
}

function RowMenu({ item, onOpen, onAction }: { item: FeedItem; onOpen: () => void; onAction: (a: BulkAction, keys: string[]) => void }) {
  const qr = item.source === 'qr';
  const keys = [item.key];
  const avail = (a: BulkAction) => qr || !QR_ONLY_ACTIONS.includes(a);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={`Satır işlemleri: ${item.userName || 'Anonim'}, ${item.dealerName}`} data-row-click-ignore>
          <MoreVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onOpen}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          Ayrıntıyı aç
        </DropdownMenuItem>
        {item.deletedAt ? (
          <DropdownMenuItem onSelect={() => onAction('restore', keys)}>
            <Undo2 className="mr-2 h-4 w-4" aria-hidden />
            Geri yükle
          </DropdownMenuItem>
        ) : (
          <>
            {!item.replied ? (
              <DropdownMenuItem onSelect={() => onAction('remind', keys)}>
                <Bell className="mr-2 h-4 w-4" aria-hidden />
                Bayiye hatırlat
              </DropdownMenuItem>
            ) : null}
            {avail('hide') && item.isPublic ? (
              <DropdownMenuItem onSelect={() => onAction('hide', keys)}>
                <EyeOff className="mr-2 h-4 w-4" aria-hidden />
                Gizle
              </DropdownMenuItem>
            ) : null}
            {avail('show') && !item.isPublic ? (
              <DropdownMenuItem onSelect={() => onAction('show', keys)}>
                <Eye className="mr-2 h-4 w-4" aria-hidden />
                Yeniden yayınla
              </DropdownMenuItem>
            ) : null}
            {avail('flag') && !item.isToxic ? (
              <DropdownMenuItem onSelect={() => onAction('flag', keys)}>
                <ShieldAlert className="mr-2 h-4 w-4" aria-hidden />
                Toksik işaretle
              </DropdownMenuItem>
            ) : null}
            {avail('clearFlags') && (item.isToxic || item.trustFlagged) ? (
              <DropdownMenuItem onSelect={() => onAction('clearFlags', keys)}>
                <FlagOff className="mr-2 h-4 w-4" aria-hidden />
                İşaretleri temizle
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction('delete', keys)} className="text-danger-text focus:text-danger-text">
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Çöp kutusuna taşı
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Puan dağılımı: her çubuk o puana süzer (yeniden tıklama süzgeci kaldırır). NPS yalnız QR. */
function RatingStrip({
  stats,
  selected,
  onPick,
}: {
  stats: FeedStats;
  selected: string[];
  onPick: (rating: string | null) => void;
}) {
  const max = Math.max(1, ...Object.values(stats.distribution));
  const only = selected.length === 1 ? selected[0] : null;
  return (
    <section aria-label="Puan dağılımı" className="rounded-card border border-border bg-surface-1 p-3 qx-elevation-1">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <ul className="grid flex-1 grid-cols-5 gap-2">
          {(['5', '4', '3', '2', '1'] as const).map((r) => {
            const n = stats.distribution[r];
            const active = only === r;
            return (
              <li key={r}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPick(active ? null : r)}
                  className={cn(
                    'flex min-h-11 w-full flex-col gap-1 rounded-control border px-2 py-1.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    active ? 'border-brand-border bg-brand-subtle' : 'border-transparent hover:bg-surface-2'
                  )}
                >
                  <span className="flex items-center justify-between text-xs text-fg-muted">
                    <span className="inline-flex items-center gap-0.5">
                      {r}
                      <Star className="h-3 w-3 fill-warning text-warning" aria-hidden />
                    </span>
                    <span className="qx-num font-medium text-fg">{fmtNumber(n)}</span>
                  </span>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span
                      className={cn('block h-full rounded-full', Number(r) <= 2 ? 'bg-danger' : Number(r) === 3 ? 'bg-warning' : 'bg-success')}
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </span>
                  <span className="sr-only">{`${r} yıldız: ${fmtNumber(n)} kayıt${active ? ', süzgeç etkin' : ''}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex shrink-0 items-center gap-4 border-t border-border pt-2 text-sm md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-fg-muted" aria-hidden />
            <span className="text-fg-muted"><AdminGeriBildirimlerText k="npsQrOnly" /></span>
            <span className="qx-num font-semibold text-fg">{stats.nps.value == null ? '—' : stats.nps.value}</span>
            <span className="text-xs text-fg-muted">n = {fmtNumber(stats.nps.n)}</span>
          </span>
          {stats.views.flagged > 0 ? (
            <span className="inline-flex items-center gap-1 text-warning-text">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {fmtNumber(stats.views.flagged)} işaretli
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
