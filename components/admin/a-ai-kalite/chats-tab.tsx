'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Gauge, MessageSquare, ShieldAlert, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { FilterBar, SectionCard, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import {
  CHAT_OUTCOMES,
  CHAT_OUTCOME_LABEL,
  CHAT_PAGE_SIZE,
  CHAT_PERIODS,
  CHAT_PERIOD_LABEL,
  CHAT_ROLES,
  CHAT_SLOW_MS,
  chatFilterQsFromUrl,
  chatQsFromUrl,
  chatRoleLabel,
  type ChatListItem,
  type ChatStats,
  type Paged,
} from '@/lib/ai-quality/contract';
import { chatExportUrl, errorText, fetchChatStats, fetchChats, qualityKeys } from './api';
import { CHAT_OUTCOME, fmtDateTime, fmtDay, fmtMs, fmtNumber, fmtRelative } from './format';
import { ChatPanel } from './chat-panel';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const FIELDS: FilterField[] = [
  { type: 'search', key: 'cq', label: 'Ara', placeholder: 'Mesaj, yanıt, e-posta, ad ya da parmak izi', minLength: 2 },
  { type: 'select', key: 'period', label: 'Dönem', allLabel: null, defaultValue: '7d', options: CHAT_PERIODS.map((p) => ({ value: p, label: CHAT_PERIOD_LABEL[p] })) },
  { type: 'select', key: 'outcome', label: 'Sonuç', allLabel: 'Tüm sonuçlar', options: CHAT_OUTCOMES.map((o) => ({ value: o, label: CHAT_OUTCOME_LABEL[o] })) },
  { type: 'select', key: 'role', label: 'Rol', allLabel: 'Tüm roller', options: CHAT_ROLES.map((r) => ({ value: r, label: chatRoleLabel(r) })) },
  { type: 'select', key: 'slow', label: 'Hız', allLabel: 'Tüm yanıtlar', options: [{ value: '1', label: `Yavaş (≥ ${CHAT_SLOW_MS / 1000} sn)` }] },
];

const STATS_PERIOD = (p: string) => (p === '24h' || p === '30d' ? p : '7d');

type Props = {
  initialStats: { period: string; data: ChatStats } | null;
  initialList: { qs: string; page: Paged<ChatListItem> } | null;
};

function actorLabel(r: ChatListItem): string {
  const a = r.actor;
  if (a.kind === 'user') return a.name ?? a.email ?? 'Kullanıcı';
  if (a.kind === 'anon') return `Ziyaretçi #${(a.fingerprint ?? '').slice(0, 8)}`;
  return 'Silinmiş kullanıcı';
}

export function ChatsTab({ initialStats, initialList }: Props) {
  const filters = useFilterState(FIELDS, { resetKeys: ['cpage', 'chat'] });
  const { get, set } = useUrlState();
  const table = useUrlTableState({ defaultPageSize: CHAT_PAGE_SIZE, pageKey: 'cpage', sizeKey: 'csize' });
  const sheet = useDetailSheet('chat');
  const period = str(filters.values.period) || '7d';
  const user = get('user') ?? '';
  const fp = get('fp') ?? '';

  const filterQs = chatFilterQsFromUrl(get);
  const qs = chatQsFromUrl(get);

  const statsPeriod = STATS_PERIOD(period);
  const stats = useQuery({
    queryKey: qualityKeys.chatStats(statsPeriod),
    queryFn: ({ signal }) => fetchChatStats(statsPeriod, signal),
    initialData: initialStats && initialStats.period === statsPeriod ? initialStats.data : undefined,
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: qualityKeys.chats(qs),
    queryFn: ({ signal }) => fetchChats(qs, signal),
    initialData: initialList && initialList.qs === qs ? initialList.page : undefined,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const ids = useMemo(() => list.data?.items.map((r) => r.id) ?? [], [list.data]);

  const columns = useMemo<ColumnDef<ChatListItem>[]>(
    () => [
      {
        id: 'when',
        header: 'Zaman',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={fmtDateTime(row.original.createdAt)} className="whitespace-nowrap text-xs text-fg-muted">
            {fmtRelative(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actor',
        header: 'Kimden',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Kimden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[9rem] space-y-0.5">
            <p className="truncate text-sm font-medium text-fg">{actorLabel(row.original)}</p>
            <p className="text-xs text-fg-muted">{chatRoleLabel(row.original.roleSnapshot)}</p>
          </div>
        ),
      },
      {
        id: 'messages',
        header: 'Kullanıcı mesajı → bot yanıtı',
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'field', label: 'Mesaj' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[16rem] max-w-[34rem] space-y-1 text-sm">
            <p className="line-clamp-2 text-fg">{row.original.userPreview}</p>
            <p className="line-clamp-2 text-fg-muted">↳ {row.original.assistantPreview}</p>
          </div>
        ),
      },
      {
        id: 'outcome',
        header: 'Sonuç',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Sonuç' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge {...statusBadgeProps(CHAT_OUTCOME, row.original.outcome)} size="sm" />,
      },
      {
        id: 'latency',
        header: 'Gecikme',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Gecikme', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const ms = row.original.latencyMs;
          const slow = ms != null && ms >= CHAT_SLOW_MS;
          return (
            <span className={slow ? 'font-medium tabular-nums text-warning' : 'tabular-nums'}>
              {row.original.modelCalled ? fmtMs(ms) : '—'}
              {slow ? <span className="sr-only"> (yavaş)</span> : null}
            </span>
          );
        },
      },
    ],
    []
  );

  const s = stats.data;
  const volumeDelta = s && s.previousTotal > 0 ? Math.round(((s.total - s.previousTotal) / s.previousTotal) * 1000) / 10 : null;
  const pivotLabel = user ? 'Tek kullanıcıya süzülmüş' : fp ? `Ziyaretçi #${fp.slice(0, 8)} için süzülmüş` : null;

  return (
    <div className="space-y-6">
      {stats.isError && !s ? (
        <ErrorState title="Sohbet istatistikleri alınamadı" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label={`Sohbet turu · ${CHAT_PERIOD_LABEL[statsPeriod as '7d']}`}
            icon={<MessageSquare />}
            tone="brand"
            loading={stats.isLoading}
            metric={{
              value: s?.total ?? null,
              delta: volumeDelta != null ? { value: volumeDelta, kind: 'percent', label: 'önceki döneme göre' } : null,
              series: s?.series.map((x) => x.total) ?? null,
            }}
            sparklineLabel="Günlük sohbet turu sayısı"
          />
          <MetricTile
            label="Hata ve bakım oranı"
            icon={<AlertTriangle />}
            tone={s && (s.errorRate ?? 0) >= 5 ? 'danger' : 'neutral'}
            loading={stats.isLoading}
            metric={{ value: s?.errorRate ?? null, format: 'percent', n: s?.total ?? 0, series: s?.series.map((x) => x.problems) ?? null }}
            hint={s ? `${fmtNumber(s.outcomes.error)} model hatası · ${fmtNumber(s.outcomes.maintenance)} bakım yanıtı` : undefined}
          />
          <MetricTile
            label="Güvenlik engeli"
            icon={<ShieldAlert />}
            tone={s && s.outcomes.blocked > 0 ? 'warning' : 'neutral'}
            loading={stats.isLoading}
            metric={{ value: s?.outcomes.blocked ?? null }}
            hint="İstem enjeksiyonu şüphesiyle reddedilen mesajlar"
          />
          <MetricTile
            label="Yanıt süresi p95"
            icon={<Gauge />}
            loading={stats.isLoading}
            metric={{ value: s?.latency.p95 ?? null, format: 'duration', durationUnit: 'ms', n: s?.latency.n ?? 0 }}
            hint={s?.latency.p50 != null ? `p50 ${fmtMs(s.latency.p50)} · yalnız modelin çağrıldığı turlar` : 'Yalnız modelin çağrıldığı turlar'}
          />
        </MetricGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Veri koruma" description="Bu ekran kullanıcıların asistana yazdığı serbest metni gösterir.">
          <ul className="space-y-1.5 text-sm text-fg">
            <li>
              Saklama süresi:{' '}
              <strong>{s?.retention.days ? `${s.retention.days} gün` : '—'}</strong>
              {s?.retention.days ? ' — süresi dolan kayıtlar günlük temizlik işiyle otomatik silinir; KVKK silme talebinde kişinin tüm sohbetleri silinir, erişim talebinde dışa aktarılır.' : null}
              {s?.retention.oldestAt ? <span className="text-fg-muted"> En eski kayıt: {fmtDateTime(s.retention.oldestAt)}.</span> : null}
            </li>
            <li>E-posta, telefon, IBAN, kart ve kimlik numaraları listede, detayda ve dışa aktarmada maskelenir.</li>
            <li>Her detay açılışı, maskesiz görüntüleme (gerekçeli) ve dışa aktarma denetim kaydına yazılır.</li>
            {s ? (
              <li className="text-fg-muted">
                Dakikalık kota: müşteri {s.limits.customer ?? '—'}, ziyaretçi {s.limits.anonymous ?? '—'}, bayi/personel {s.limits.dealer_staff ?? '—'}, yönetici {s.limits.admin ?? '—'} istek.
              </li>
            ) : null}
          </ul>
        </SectionCard>
        <SectionCard title="En çok yazanlar" description={CHAT_PERIOD_LABEL[statsPeriod as '7d']}>
          {s?.topActors.length ? (
            <ol className="space-y-1">
              {s.topActors.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => set({ user: a.userId, fp: a.fingerprint, cpage: null, chat: null })}
                    aria-label={`${a.label}: ${a.count} tur — kayıtlarını süz`}
                  >
                    <span className="truncate">{a.label}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{fmtNumber(a.count)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-fg-muted">{stats.isLoading ? 'Yükleniyor…' : 'Bu dönemde kayıt yok.'}</p>
          )}
        </SectionCard>
      </div>

      {s && s.series.some((x) => x.total > 0) ? (
        <SectionCard title="Günlük hacim" description="Toplam tur ve sorunlu yanıt (hata, bakım, güvenlik engeli), İstanbul günü">
          <table className="w-full text-sm">
            <caption className="sr-only">Günlük sohbet hacmi</caption>
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th scope="col" className="pb-1 font-medium">Gün</th>
                <th scope="col" className="pb-1 font-medium">Hacim</th>
                <th scope="col" className="pb-1 text-right font-medium">Tur</th>
                <th scope="col" className="pb-1 text-right font-medium">Sorunlu</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const max = Math.max(1, ...s.series.map((x) => x.total));
                return s.series.slice(-14).map((x) => (
                  <tr key={x.day} className="border-t border-border">
                    <td className="py-1.5 whitespace-nowrap">{fmtDay(x.day)}</td>
                    <td className="w-1/2 py-1.5" aria-hidden>
                      <div className="h-2 rounded-full bg-surface-muted">
                        <div className="h-2 rounded-full bg-brand" style={{ width: `${(x.total / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtNumber(x.total)}</td>
                    <td className={x.problems ? 'py-1.5 text-right tabular-nums text-danger' : 'py-1.5 text-right tabular-nums text-fg-muted'}>{fmtNumber(x.problems)}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </SectionCard>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <FilterBar fields={FIELDS} resetKeys={['cpage', 'chat']} />
        <Button asChild variant="outline" className="min-h-11 shrink-0 sm:min-h-10">
          <a href={chatExportUrl(filterQs)} download>
            <Download className="h-4 w-4" aria-hidden />
            CSV dışa aktar
          </a>
        </Button>
      </div>

      {pivotLabel ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-fg">
          {pivotLabel}
          <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => set({ user: null, fp: null, cpage: null })}>
            <X className="h-4 w-4" aria-hidden />
            Süzmeyi kaldır
          </Button>
        </p>
      ) : null}

      <DataTable
        ariaLabel="QRA sohbet kayıtları"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => `${actorLabel(r)}, ${fmtDateTime(r.createdAt)}`}
        manualPagination
        rowCount={list.data?.total}
        pagination={table.pagination}
        onPaginationChange={table.onPaginationChange}
        filtered={filters.activeCount > 0 || !!user || !!fp}
        onRowClick={(r) => sheet.open(r.id)}
        activeRowId={sheet.id}
        empty={
          filters.activeCount > 0 || user || fp
            ? { title: 'Bu filtreyle kayıt yok', description: 'Dönemi genişletin ya da filtreleri kaldırın.' }
            : { title: 'Bu dönemde sohbet yok', description: 'QRA asistanına yazılan mesajlar burada görünür.' }
        }
      />

      <DetailSheet paramKey="chat" size="lg" title="Sohbet kaydı" description="Maskeli tam metin ve konuşma bağlamı" siblings={ids}>
        {(id) => <ChatPanel id={id} onPivot={(p) => set({ user: p.user ?? null, fp: p.fp ?? null, cpage: null, chat: null })} />}
      </DetailSheet>
    </div>
  );
}
