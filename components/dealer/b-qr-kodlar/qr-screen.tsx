'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MapPin, PauseCircle, PlayCircle, Plus, Printer, QrCode, ScanLine, Search, Star, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  QR_PRINT_MAX,
  QR_SORTS,
  QR_STATUS_FILTERS,
  filtersToSearchParams,
  normalizeQrFilters,
  type QrLifecycleAction,
  type QrListFilters,
  type QrSort,
  type QrStatus,
  type QrStatusFilter,
} from '@/lib/dealer/qr-codes/rules';
import {
  QR_LOCATIONS_KEY,
  QR_QUERY_ROOT,
  QR_SUMMARY_KEY,
  qrListKey,
  type QrItemDto,
  type QrSummaryDto,
} from '@/lib/dealer/qr-codes/types';
import { bulkQr, downloadPrint, fetchLocations, fetchQrList, fetchQrSummary, qrLifecycle, updateQr } from './api';
import { FILTER_LABEL, SORT_LABEL, errorText, fmtInt, fmtPct } from './format';
import { lifecycleCopy, lifecycleImpact } from './lifecycle';
import { QrCard, type CardIntent } from './qr-card';
import { copyText } from './clipboard';
import type { StudioTab } from './studio-sheet';
import { LocationsPanel } from './locations-panel';

// Çekmeceler yalnız açılınca yüklenir (form kiti, baskı paneli).
const CreateSheet = dynamic(() => import('./create-sheet').then((m) => m.CreateSheet), { ssr: false });
const StudioSheet = dynamic(() => import('./studio-sheet').then((m) => m.StudioSheet), { ssr: false });

type Selected = { name: string; status: QrStatus };
type PendingLifecycle = { id: string; name: string; feedbackTotal: number; action: QrLifecycleAction } | null;

const STUDIO_TABS: StudioTab[] = ['print', 'settings', 'stats', 'history'];

function SummaryTiles({ s, onOpen }: { s: QrSummaryDto; onOpen: (id: string) => void }) {
  const { quota } = s;
  const delta = s.scansPrev7 > 0 ? Math.round(((s.scans7 - s.scansPrev7) / s.scansPrev7) * 1000) / 10 : null;
  return (
    <MetricGrid cols={4}>
      <MetricTile
        label="Etkin kod"
        icon={<QrCode className="h-4 w-4" aria-hidden />}
        metric={{ value: quota.used }}
        hint={quota.limit == null ? 'Sınırsız plan' : `${fmtInt(quota.used)}/${fmtInt(quota.limit)} · ${quota.planName}`}
        tone={quota.limit != null && quota.used >= quota.limit ? 'warning' : 'neutral'}
        footer={
          quota.limit != null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-label="Kod kotası"
              aria-valuemin={0}
              aria-valuemax={quota.limit}
              aria-valuenow={quota.used}
            >
              <div className={cn('h-full rounded-full', quota.used >= quota.limit ? 'bg-warning' : 'bg-brand')} style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
            </div>
          ) : undefined
        }
      />
      <MetricTile
        label="Tarama (7 gün)"
        icon={<ScanLine className="h-4 w-4" aria-hidden />}
        metric={{
          value: s.scans7,
          delta: delta == null ? null : { value: delta, kind: 'percent', goodDirection: 'up', label: 'önceki 7 güne göre' },
          series: s.scanSeries,
        }}
        showSparkline
        sparklineLabel="Son 14 günün günlük taramaları"
      />
      <MetricTile
        label="Dönüşüm (30 gün)"
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        metric={{ value: s.conversion30, format: 'percent', n: s.scans30, minN: 20 }}
        hint={`${fmtInt(s.scans30)} taramadan ${fmtInt(s.feedbacks30)} yorum`}
      />
      <MetricTile
        label="En düşük puanlı nokta"
        icon={<Star className="h-4 w-4" aria-hidden />}
        metric={{ value: s.lowest?.avgRating ?? null, fractionDigits: 1 }}
        tone={s.lowest && s.lowest.avgRating < 3.5 ? 'danger' : 'neutral'}
        hint={
          s.lowest ? (
            <button type="button" onClick={() => onOpen(s.lowest!.id)} className="min-h-6 text-left font-medium text-brand underline-offset-2 hover:underline">
              {s.lowest.name} · {fmtInt(s.lowest.feedbacks)} yorum
            </button>
          ) : (
            '30 günde en az 3 yorum alan kod yok'
          )
        }
      />
    </MetricGrid>
  );
}

export function QrScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const filters = useMemo(() => normalizeQrFilters(Object.fromEntries(sp.entries())), [sp]);
  const tab = sp.get('tab') === 'locations' ? 'locations' : 'codes';
  const studioId = sp.get('qr');
  const studioTab = (STUDIO_TABS as string[]).includes(sp.get('qrtab') ?? '') ? (sp.get('qrtab') as StudioTab) : 'print';

  /** URL'yi tek yerden güncelle (geri tuşu ve derin link çalışsın — rapor #15, Bulgu 6). */
  const replaceParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(sp.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname]
  );
  const setFilters = useCallback(
    (patch: Partial<QrListFilters>) =>
      replaceParams((p) => {
        const nf = { ...filters, page: 1, ...patch };
        for (const k of ['q', 'search', 'status', 'location', 'sort', 'page']) p.delete(k);
        filtersToSearchParams(nf).forEach((v, k) => p.set(k, v));
      }),
    [filters, replaceParams]
  );

  const summary = useQuery({ queryKey: QR_SUMMARY_KEY, queryFn: ({ signal }) => fetchQrSummary(signal), staleTime: 30_000 });
  const list = useQuery({
    queryKey: qrListKey(filters),
    queryFn: ({ signal }) => fetchQrList(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const locations = useQuery({ queryKey: QR_LOCATIONS_KEY, queryFn: ({ signal }) => fetchLocations(signal), staleTime: 60_000 });

  // Sunucu sayfayı sıkıştırdıysa (son sayfa boşaldı) URL'yi düzelt.
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && list.data.page !== filters.page) setFilters({ page: list.data.page });
  }, [list.data, list.isPlaceholderData, filters.page, setFilters]);

  // Arama: yazarken 300 ms bekle, sonra sunucuya (URL'ye) taşı.
  const [term, setTerm] = useState(filters.q ?? '');
  const lastPushed = useRef(filters.q ?? '');
  useEffect(() => {
    if ((filters.q ?? '') !== lastPushed.current) {
      lastPushed.current = filters.q ?? '';
      setTerm(filters.q ?? '');
    }
  }, [filters.q]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = term.trim();
      if (v !== (filters.q ?? '')) {
        lastPushed.current = v;
        setFilters({ q: v || null });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [term, filters.q, setFilters]);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: QR_QUERY_ROOT }), [qc]);

  // ── Seçim (sayfalar arası) ──
  const [selected, setSelected] = useState<Map<string, Selected>>(new Map());
  const [bulkBusy, setBulkBusy] = useState<null | 'activate' | 'deactivate' | 'print'>(null);
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());
  const items = list.data?.items ?? [];
  const pageAllSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const pageSomeSelected = items.some((i) => selected.has(i.id));
  const offPage = Array.from(selected.keys()).filter((id) => !items.some((i) => i.id === id)).length;

  const onSelect = useCallback((item: QrItemDto, next: boolean) => {
    setSelected((prev) => {
      const m = new Map(prev);
      if (next) m.set(item.id, { name: item.name, status: item.status });
      else m.delete(item.id);
      return m;
    });
  }, []);
  const togglePage = () =>
    setSelected((prev) => {
      const m = new Map(prev);
      if (pageAllSelected) items.forEach((i) => m.delete(i.id));
      else items.forEach((i) => m.set(i.id, { name: i.name, status: i.status }));
      return m;
    });

  const runBulk = async (action: 'activate' | 'deactivate') => {
    setBulkBusy(action);
    try {
      const r = await bulkQr(action, Array.from(selected.keys()));
      toast.success(
        `${fmtInt(r.count)} kod ${action === 'activate' ? 'yayına alındı' : 'duraklatıldı'}${r.skipped ? ` · ${fmtInt(r.skipped)} kod iptal/arşiv olduğu için atlandı` : ''}`
      );
      await invalidate();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBulkBusy(null);
    }
  };
  const printable = Array.from(selected.entries()).filter(([, v]) => v.status !== 'revoked' && v.status !== 'archived');
  const runBulkPrint = async () => {
    setBulkBusy('print');
    try {
      await downloadPrint(
        { ids: printable.slice(0, QR_PRINT_MAX).map(([id]) => id), template: 'card', format: 'pdf', fg: '#111111', bg: '#FFFFFF' },
        `qr-kodlar-${printable.length}-masa-karti.pdf`
      );
      toast.success('Masa kartları PDF olarak indirildi — %100 ölçekte yazdırın');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBulkBusy(null);
    }
  };

  // ── Kart niyetleri ──
  const [pending, setPending] = useState<PendingLifecycle>(null);
  const openStudio = useCallback(
    (id: string, t: StudioTab = 'print') =>
      replaceParams((p) => {
        p.set('qr', id);
        p.set('qrtab', t);
      }),
    [replaceParams]
  );
  const onIntent = useCallback(
    async (item: QrItemDto, intent: CardIntent) => {
      if (intent.kind === 'open') return openStudio(item.id, intent.tab);
      if (intent.kind === 'copy') return copyText(item.targetUrl, 'Bağlantı kopyalandı');
      if (intent.kind === 'lifecycle') {
        return setPending({ id: item.id, name: item.name, feedbackTotal: item.feedbackTotal, action: intent.action });
      }
      setRowBusy((s) => new Set(s).add(item.id));
      try {
        await updateQr(item.id, { isActive: intent.next });
        toast.success(intent.next ? `“${item.name}” yayında` : `“${item.name}” duraklatıldı`);
        await invalidate();
      } catch (e) {
        toast.error(errorText(e));
      } finally {
        setRowBusy((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      }
    },
    [openStudio, invalidate]
  );

  const confirmLifecycle = async () => {
    if (!pending) return;
    const copy = lifecycleCopy(pending.action, pending.name);
    try {
      const r = await qrLifecycle(pending.id, pending.action);
      toast.success(r.changed ? copy.done : 'Değişiklik gerekmedi');
      setSelected((prev) => {
        const m = new Map(prev);
        m.delete(pending.id);
        return m;
      });
      await invalidate();
      if (pending.action === 'rotate' && r.id !== pending.id) openStudio(r.id, 'print');
    } catch (e) {
      toast.error(errorText(e));
      throw e;
    }
  };

  const [createOpen, setCreateOpen] = useState(false);
  const activeLocations = locations.data?.items ?? [];
  const counts = summary.data?.counts;
  const pc = pending ? lifecycleCopy(pending.action, pending.name) : null;
  const filtered = !!filters.q || filters.status !== 'all' || !!filters.location;

  return (
    <PanelPage
      header={
        <PageHeader
          title="QR kodlar ve şubeler"
          description="Her kod bir temas noktası: kaç kez okutulduğunu, kaçının yoruma döndüğünü görün; masa kartını buradan basın."
          icon={<QrCode className="h-5 w-5" aria-hidden />}
          actions={
            <Button type="button" className="min-h-11" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Yeni QR kod
            </Button>
          }
        />
      }
    >
      <QueryState query={summary} skeleton="stats" onRetry={() => summary.refetch()}>
        {(s) => <SummaryTiles s={s} onOpen={(id) => openStudio(id, 'stats')} />}
      </QueryState>

      <SectionTabs
        tabs={[
          { value: 'codes', label: 'Kodlar', icon: <QrCode className="h-4 w-4" aria-hidden />, count: counts?.all },
          { value: 'locations', label: 'Şubeler', icon: <MapPin className="h-4 w-4" aria-hidden />, count: locations.data?.quota.used },
        ]}
        value={tab}
        onValueChange={(v) => replaceParams((p) => (v === 'locations' ? p.set('tab', 'locations') : p.delete('tab')))}
        ariaLabel="QR kodlar ve şubeler"
        variant="underline"
        touchTarget
      >
        {(active) =>
          active === 'locations' ? (
            <QueryState query={locations} skeleton="list" onRetry={() => locations.refetch()}>
              {(data) => (
                <LocationsPanel
                  data={data}
                  onChanged={invalidate}
                  onShowCodes={(id) =>
                    replaceParams((p) => {
                      p.delete('tab');
                      p.delete('page');
                      p.set('location', id);
                    })
                  }
                />
              )}
            </QueryState>
          ) : (
            <div className="space-y-4 pb-24">
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                    <Input
                      type="search"
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="Ad, kod, not ya da şube ara"
                      aria-label="QR kod ara"
                      className="min-h-11 pl-9"
                      maxLength={80}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <label className="sr-only" htmlFor="qr-filter-location">
                      Şube
                    </label>
                    <select
                      id="qr-filter-location"
                      value={filters.location ?? ''}
                      onChange={(e) => setFilters({ location: e.target.value || null })}
                      className="qx-small min-h-11 rounded-md border border-border bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <option value="">Tüm şubeler</option>
                      <option value="none">Şubesiz</option>
                      {activeLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                          {!l.isActive ? ' (arşiv)' : ''}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="qr-sort">
                      Sıralama
                    </label>
                    <select
                      id="qr-sort"
                      value={filters.sort}
                      onChange={(e) => setFilters({ sort: e.target.value as QrSort })}
                      className="qx-small min-h-11 rounded-md border border-border bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {QR_SORTS.map((s) => (
                        <option key={s} value={s}>
                          {SORT_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <ChoiceChips
                  aria-label="Duruma göre süz"
                  scroll
                  size="sm"
                  options={QR_STATUS_FILTERS.map((f) => ({
                    value: f,
                    label: counts ? `${FILTER_LABEL[f]} (${fmtInt(counts[f])})` : FILTER_LABEL[f],
                    textLabel: FILTER_LABEL[f],
                  }))}
                  value={filters.status}
                  onChange={(v) => v && setFilters({ status: v as QrStatusFilter })}
                />
              </div>

              <QueryState
                query={list}
                skeleton="cards"
                onRetry={() => list.refetch()}
                isEmpty={(d) => d.items.length === 0}
                empty={
                  filtered
                    ? {
                        variant: 'filtered',
                        title: 'Bu süzgece uyan kod yok',
                        description: filters.q ? `“${filters.q}” için sonuç bulunamadı.` : 'Süzgeçleri değiştirip tekrar deneyin.',
                        action: (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => {
                              setTerm('');
                              setFilters({ q: null, status: 'all', location: null });
                            }}
                          >
                            Süzgeçleri temizle
                          </Button>
                        ),
                      }
                    : {
                        variant: 'first-use',
                        icon: QrCode,
                        title: 'İlk QR kodunuzu oluşturun',
                        description: 'Masaya, kasaya ya da pakete koyacağınız kod müşterinin yorumunu size getirir. Numaralı seriyle tüm masaları tek seferde açabilirsiniz.',
                        action: (
                          <Button type="button" className="min-h-11" onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden /> QR kod oluştur
                          </Button>
                        ),
                      }
                }
              >
                {(d) => (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-11 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                          onCheckedChange={togglePage}
                          aria-label={pageAllSelected ? 'Bu sayfadaki seçimleri kaldır' : 'Bu sayfadakilerin hepsini seç'}
                        />
                        <span className="qx-small text-fg-muted">{pageAllSelected ? 'Bu sayfanın seçimini kaldır' : 'Bu sayfadakileri seç'}</span>
                      </label>
                      <p className="qx-small text-fg-muted" aria-live="polite">
                        {fmtInt(d.total)} kod{list.isFetching && !list.isLoading ? ' · güncelleniyor…' : ''}
                      </p>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="QR kodlar">
                      {d.items.map((item, i) => (
                        <QrCard
                          key={item.id}
                          item={item}
                          index={i}
                          selected={selected.has(item.id)}
                          busy={rowBusy.has(item.id)}
                          onSelect={onSelect}
                          onIntent={onIntent}
                        />
                      ))}
                    </ul>
                    {d.totalPages > 1 && (
                      <nav aria-label="Sayfalama" className="flex items-center justify-between gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={d.page <= 1}
                          onClick={() => setFilters({ page: d.page - 1 })}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Önceki
                        </Button>
                        <span className="qx-small text-fg-muted">
                          Sayfa {fmtInt(d.page)} / {fmtInt(d.totalPages)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={d.page >= d.totalPages}
                          onClick={() => setFilters({ page: d.page + 1 })}
                        >
                          Sonraki <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                        </Button>
                      </nav>
                    )}
                  </div>
                )}
              </QueryState>
            </div>
          )
        }
      </SectionTabs>

      {selected.size > 0 && tab === 'codes' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 px-4 md:bottom-4">
          <div
            role="region"
            aria-label="Toplu işlemler"
            className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 p-2 shadow-lg"
          >
            <p className="qx-small min-w-0 flex-1 px-2 text-fg" aria-live="polite">
              <span className="font-semibold">{fmtInt(selected.size)} seçili</span>
              {offPage > 0 && <span className="text-fg-muted"> · {fmtInt(offPage)} tanesi başka sayfada</span>}
            </p>
            <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={bulkBusy !== null} aria-busy={bulkBusy === 'activate'} onClick={() => runBulk('activate')}>
              <PlayCircle className="mr-1.5 h-4 w-4" aria-hidden /> {bulkBusy === 'activate' ? 'İşleniyor…' : 'Yayına al'}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={bulkBusy !== null} aria-busy={bulkBusy === 'deactivate'} onClick={() => runBulk('deactivate')}>
              <PauseCircle className="mr-1.5 h-4 w-4" aria-hidden /> {bulkBusy === 'deactivate' ? 'İşleniyor…' : 'Duraklat'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              disabled={bulkBusy !== null || printable.length === 0 || printable.length > QR_PRINT_MAX}
              aria-busy={bulkBusy === 'print'}
              onClick={runBulkPrint}
              title={printable.length > QR_PRINT_MAX ? `Tek seferde en fazla ${QR_PRINT_MAX} kart` : undefined}
            >
              <Printer className="mr-1.5 h-4 w-4" aria-hidden /> {bulkBusy === 'print' ? 'Hazırlanıyor…' : `Masa kartı PDF (${fmtInt(printable.length)})`}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label="Seçimi temizle" onClick={() => setSelected(new Map())}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          locations={activeLocations}
          quota={summary.data?.quota ?? null}
          onCreated={(created) => {
            void invalidate();
            if (created.length === 1) openStudio(created[0].id, 'print');
            else if (created.length > 1) {
              setSelected(new Map(created.map((c) => [c.id, { name: c.name, status: 'active' as QrStatus }])));
              toast.message(`${fmtInt(created.length)} kod seçildi — “Masa kartı PDF” ile hepsini tek dosyada basın.`);
            }
          }}
        />
      )}

      {studioId && (
        <StudioSheet
          id={studioId}
          open={!!studioId}
          onOpenChange={(o) =>
            !o &&
            replaceParams((p) => {
              p.delete('qr');
              p.delete('qrtab');
            })
          }
          tab={studioTab}
          onTabChange={(t) => replaceParams((p) => p.set('qrtab', t))}
          locations={activeLocations}
          onOpen={(id) => openStudio(id, 'history')}
          onSaved={() => void invalidate()}
          onLifecycle={(d, action) => setPending({ id: d.item.id, name: d.item.name, feedbackTotal: d.item.feedbackTotal, action })}
        />
      )}

      {pending && pc && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setPending(null)}
          tone={pc.tone}
          title={pc.title}
          description={pc.description}
          impact={lifecycleImpact(pending.action, pending.feedbackTotal)}
          irreversibleNote={false}
          confirmLabel={pc.confirm}
          onConfirm={confirmLifecycle}
        />
      )}
    </PanelPage>
  );
}
