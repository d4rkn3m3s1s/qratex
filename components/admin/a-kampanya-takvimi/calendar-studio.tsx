'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Info,
  Palette,
  Plus,
  Search,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader, PanelPage, SectionCard, SectionTabs } from '@/components/ds/page';
import { DetailSheet } from '@/components/ds/data';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { QueryState, SkeletonDetail, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LIST_FILTERS,
  LIST_FILTER_LABEL,
  formatIstanbul,
  formatSpan,
  type CalendarData,
  type CalendarKind,
  type CampaignView,
  type ConceptView,
  type ListFilter,
  type ListPage,
} from '@/lib/campaigns-calendar/contract';
import * as api from './api';
import { CalendarTimeline } from './timeline';
import { ItemStatus, campaignAudience, campaignEffect, conceptLayers, fmtInt } from './parts';
import { DetailContent, detailTitle } from './detail';
import type { EditorTarget } from './editor';

// Form + önizleme ağır: yalnız açılınca yüklenir.
const CalendarEditor = dynamic(() => import('./editor'), { ssr: false, loading: () => null });

const DAY = 86_400_000;
const WINDOW_OPTIONS = [30, 90, 180] as const;
const PAGE_SIZE = 10;

/** URL'i sunucu bileşenini yeniden çalıştırmadan günceller (yalnız istemci durumu). */
function useLocalUrl() {
  const sp = useSearchParams();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const read = React.useCallback(
    (k: string) => (typeof window === 'undefined' ? sp.get(k) : new URLSearchParams(window.location.search).get(k)),
    [sp]
  );
  const write = React.useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    force();
  }, []);
  return { read, write };
}

function SummaryStrip({ data }: { data: CalendarData }) {
  const s = data.summary;
  const now = new Date(s.now).getTime();
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SectionCard density="compact" title="Ekonomi şu an" icon={<Coins className="h-4 w-4" aria-hidden />}>
        {s.liveCampaign ? (
          <div>
            <p className="qx-h3 text-fg break-words">{s.liveCampaign.name}</p>
            <p className="qx-small text-fg-muted">
              {campaignEffect({ effectiveMultiplier: s.liveCampaign.multiplier, effectiveBonus: s.liveCampaign.bonus, challenge: null })} ·{' '}
              {formatSpan(new Date(s.liveCampaign.endsAt).getTime() - now)} kaldı
            </p>
          </div>
        ) : (
          <p className="qx-small text-fg-muted">Herkese açık canlı kampanya yok; kazanımlar taban puanla işliyor.</p>
        )}
        <p className="qx-caption mt-2 text-fg-muted">
          {s.targetedLiveCount > 0 ? `${s.targetedLiveCount} hedefli kampanya da açık. ` : ''}
          {s.nextCampaign
            ? `Sıradaki: ${s.nextCampaign.name} (${formatSpan(new Date(s.nextCampaign.startsAt).getTime() - now)} sonra)`
            : 'Planlı kampanya yok.'}
        </p>
      </SectionCard>
      <SectionCard density="compact" title="Görünüm şu an" icon={<Palette className="h-4 w-4" aria-hidden />}>
        {s.liveConcept ? (
          <div>
            <p className="qx-h3 text-fg break-words">
              {s.liveConcept.emoji ? `${s.liveConcept.emoji} ` : ''}
              {s.liveConcept.name}
            </p>
            <p className="qx-small text-fg-muted">{formatSpan(new Date(s.liveConcept.endsAt).getTime() - now)} kaldı</p>
          </div>
        ) : (
          <p className="qx-small text-fg-muted">Varsayılan tema ve arka plan etkin.</p>
        )}
        <p className="qx-caption mt-2 text-fg-muted">
          {s.nextConcept
            ? `Sıradaki: ${s.nextConcept.name} (${formatSpan(new Date(s.nextConcept.startsAt).getTime() - now)} sonra)`
            : 'Planlı konsept yok.'}
        </p>
      </SectionCard>
      <SectionCard density="compact" title="Bugün kampanyalı basım" icon={<TrendingUp className="h-4 w-4" aria-hidden />}>
        <p className="qx-h3 tabular-nums text-fg">{s.campaignPointsToday === null ? '—' : `${fmtInt(s.campaignPointsToday)} puan`}</p>
        <p className="qx-caption mt-1 text-fg-muted">
          İstanbul gününde, bir kampanyanın uygulandığı kazanımlarda basılan puan (taban dahil, puan defterinden).
        </p>
      </SectionCard>
    </div>
  );
}

function ConflictPanel({
  data,
  onPick,
}: {
  data: CalendarData;
  onPick: (conflictId: string, kind: CalendarKind, id: string) => void;
}) {
  if (data.conflicts.length === 0) {
    return (
      <p className="qx-small flex items-center gap-1.5 text-fg-muted">
        <Info className="h-4 w-4" aria-hidden /> Görünen aralıkta ve sonrasında çakışma yok.
      </p>
    );
  }
  const kindOf = (id: string): CalendarKind => (data.campaigns.some((c) => c.id === id) ? 'campaign' : 'concept');
  return (
    <ul className="space-y-2">
      {data.conflicts.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onPick(c.id, kindOf(c.itemIds[0]), c.winnerId && c.kind !== 'cross' ? c.itemIds.find((x) => x !== c.winnerId) ?? c.itemIds[0] : c.itemIds[0])}
            className={cn(
              'flex min-h-11 w-full items-start gap-2 rounded-md border p-2.5 text-left qx-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              TONE_CALLOUT[c.severity === 'warning' ? 'warning' : 'info']
            )}
          >
            {c.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0">
              {c.message}
              <span className="block qx-caption text-fg-muted">
                {formatIstanbul(c.start)} – {formatIstanbul(c.end)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemRow({ item, onOpen }: { item: CampaignView | ConceptView; onOpen: () => void }) {
  const isC = item.kind === 'campaign';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid min-h-11 w-full gap-1 rounded-md px-3 py-2.5 text-left hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-3"
      >
        <span className="min-w-0">
          <span className="block truncate qx-small font-medium text-fg">
            {!isC && item.bannerEmoji ? `${item.bannerEmoji} ` : ''}
            {item.name}
          </span>
          <span className="block truncate qx-caption text-fg-muted">
            {isC ? campaignAudience(item) : `Öncelik ${item.priority}`}
          </span>
        </span>
        <span className="qx-small text-fg tabular-nums">{isC ? campaignEffect(item) : conceptLayers(item)}</span>
        <span className="qx-caption text-fg-muted tabular-nums">
          {formatIstanbul(item.startDate)} – {formatIstanbul(item.endDate)}
          {isC && item.budgetPoints ? ` · bütçe ${fmtInt(item.budgetSpent ?? 0)}/${fmtInt(item.budgetPoints)}` : ''}
        </span>
        <span>
          <ItemStatus status={item.status} targeted={isC ? item.targeted : false} />
        </span>
      </button>
    </li>
  );
}

function ItemList({ kind, onOpen }: { kind: CalendarKind; onOpen: (kind: CalendarKind, id: string) => void }) {
  const url = useLocalUrl();
  const filter = (LIST_FILTERS as readonly string[]).includes(url.read('filter') ?? '') ? (url.read('filter') as ListFilter) : 'all';
  const page = Math.max(1, Number(url.read('page')) || 1);
  const [q, setQ] = React.useState(url.read('q') ?? '');
  const [debounced, setDebounced] = React.useState(q);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    if ((url.read('q') ?? '') !== debounced) url.write({ q: debounced || null, page: null });
  }, [debounced, url]);

  const params = { filter, q: debounced, page, size: PAGE_SIZE };
  const query = useQuery<ListPage<CampaignView | ConceptView>>({
    queryKey: api.qk.list(kind, params),
    queryFn: ({ signal }) =>
      kind === 'campaign' ? api.listItems('campaign', params, signal) : api.listItems('concept', params, signal),
    placeholderData: keepPreviousData,
  });
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.size)) : 1;
  const word = kind === 'campaign' ? 'kampanya' : 'konsept';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <ChoiceChips
          aria-label="Durum filtresi"
          size="sm"
          scroll
          options={LIST_FILTERS.map((f) => ({ value: f, label: LIST_FILTER_LABEL[f] }))}
          value={filter}
          onChange={(v) => url.write({ filter: v && v !== 'all' ? v : null, page: null })}
        />
        <div className="relative md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Ada göre ${word} ara`}
            aria-label={`Ada göre ${word} ara`}
            className="pl-9"
          />
        </div>
      </div>
      <QueryState
        query={query}
        skeleton="list"
        isEmpty={(d) => d.items.length === 0}
        empty={{
          title: debounced || filter !== 'all' ? 'Eşleşen kayıt yok' : `Henüz ${word} yok`,
          description:
            debounced || filter !== 'all'
              ? 'Filtreyi ya da aramayı değiştirin.'
              : kind === 'campaign'
                ? 'Çarpan, bonus ya da görev veren zaman kutulu bir kampanya ekleyin.'
                : 'Bir şablonla palet, arka plan ve banner içeren bir konsept ekleyin.',
        }}
        error={{ title: `${word === 'kampanya' ? 'Kampanyalar' : 'Konseptler'} yüklenemedi` }}
      >
        {(d) => (
          <div className={cn(query.isFetching && 'opacity-70 transition-opacity duration-fast')} aria-busy={query.isFetching}>
            <div className="hidden px-3 pb-1 qx-caption text-fg-muted md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_auto] md:gap-3" aria-hidden>
              <span>Ad</span>
              <span>{kind === 'campaign' ? 'Etki' : 'Katmanlar'}</span>
              <span>Pencere (İstanbul)</span>
              <span>Durum</span>
            </div>
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {d.items.map((it) => (
                <ItemRow key={it.id} item={it} onOpen={() => onOpen(kind, it.id)} />
              ))}
            </ul>
            <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Sayfalama">
              <p className="qx-caption text-fg-muted tabular-nums">
                {fmtInt(d.total)} kayıt · sayfa {d.page}/{pages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => url.write({ page: page > 2 ? String(page - 1) : null })}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Önceki
                </Button>
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={page >= pages} onClick={() => url.write({ page: String(page + 1) })}>
                  Sonraki <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </nav>
          </div>
        )}
      </QueryState>
    </div>
  );
}

/**
 * Kampanya Takvimi istemci adası. Zaman çizelgesi sunucuda ön yüklenir (initialData);
 * pencere değişimi, liste, detay ve düzenleyici istemcide. İstemci durumu (katman, filtre,
 * sayfa, açık kayıt) URL'de ama sunucuyu yeniden çalıştırmadan (`history.replaceState`).
 */
export function CalendarStudio({
  initial,
  initialFrom,
  initialDays,
  initialError,
}: {
  initial: CalendarData | null;
  initialFrom: string | null;
  initialDays: number;
  initialError: string | null;
}) {
  const url = useLocalUrl();
  const qc = useQueryClient();
  const [from, setFrom] = React.useState<string | null>(initialFrom);
  const [days, setDays] = React.useState<number>(initialDays);
  const [focusConflict, setFocusConflict] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<EditorTarget | null>(null);

  const calendar = useQuery({
    queryKey: api.qk.calendar(from, days),
    queryFn: ({ signal }) => api.getCalendar(from, days, signal),
    initialData: from === initialFrom && days === initialDays && initial ? initial : undefined,
    placeholderData: keepPreviousData,
    retry: initialError ? 0 : 1,
  });

  const layerParam = url.read('layer');
  const layer: CalendarKind = layerParam === 'concept' ? 'concept' : 'campaign';
  const openParam = url.read('item');
  const [openKind, openId] = (() => {
    if (!openParam) return [null, null] as const;
    const i = openParam.indexOf(':');
    const k = openParam.slice(0, i);
    const id = openParam.slice(i + 1);
    return k === 'campaign' || k === 'concept' ? ([k as CalendarKind, id] as const) : ([null, null] as const);
  })();

  const openItem = React.useCallback((kind: CalendarKind, id: string) => url.write({ item: `${kind}:${id}` }), [url]);
  const closeItem = React.useCallback(() => url.write({ item: null }), [url]);

  const shift = (deltaDays: number) => {
    const base = from ? new Date(from).getTime() : new Date(calendar.data?.window.from ?? Date.now()).getTime();
    const next = new Date(base + deltaDays * DAY).toISOString();
    setFrom(next);
    url.write({ from: next });
  };
  const resetWindow = () => {
    setFrom(null);
    url.write({ from: null });
  };
  const changeDays = (d: number) => {
    setDays(d);
    url.write({ days: d === 90 ? null : String(d) });
  };

  const done = (message: string) => {
    toast.success(message);
    announce(message);
  };

  const openDetailItem = (() => {
    if (!openId || !openKind) return undefined;
    const fromCal = openKind === 'campaign' ? calendar.data?.campaigns.find((c) => c.id === openId) : calendar.data?.concepts.find((c) => c.id === openId);
    const fromDetail = qc.getQueryData<{ item: CampaignView | ConceptView }>(api.qk.detail(openKind, openId))?.item;
    return fromDetail ?? fromCal;
  })();

  return (
    <PanelPage
      width="wide"
      register="ops"
      header={
        <PageHeader
          title="Kampanya Takvimi"
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
          description="Sezon kampanyaları (ekonomi) ve görünüm konseptleri tek zaman çizelgesinde: kim kazanıyor, ne çakışıyor, ne kadar puan basıldı. Saatler İstanbul saatidir."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditor({ kind: 'campaign', mode: 'create' })}>
                <Plus className="h-4 w-4" aria-hidden /> Kampanya
              </Button>
              <Button variant="outline" onClick={() => setEditor({ kind: 'concept', mode: 'create' })}>
                <Plus className="h-4 w-4" aria-hidden /> Konsept
              </Button>
            </div>
          }
        />
      }
    >
      <QueryState
        query={calendar}
        skeleton="stats"
        error={{ title: 'Takvim yüklenemedi', description: initialError ?? undefined }}
      >
        {(data) => (
          <div className="space-y-6">
            <SummaryStrip data={data} />

            <SectionCard
              title="Zaman çizelgesi"
              description={`${formatIstanbul(data.window.from)} – ${formatIstanbul(data.window.to)}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1" role="group" aria-label="Pencereyi kaydır">
                    <Button size="icon-sm" variant="outline" onClick={() => shift(-Math.round(days / 3))} aria-label="Geri git">
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetWindow} disabled={from === null}>
                      Bugün
                    </Button>
                    <Button size="icon-sm" variant="outline" onClick={() => shift(Math.round(days / 3))} aria-label="İleri git">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <ChoiceChips
                    aria-label="Pencere uzunluğu"
                    size="sm"
                    options={WINDOW_OPTIONS.map((d) => ({ value: String(d), label: `${d} gün` }))}
                    value={String(days)}
                    onChange={(v) => v && changeDays(Number(v))}
                  />
                </div>
              }
            >
              <div className={cn(calendar.isFetching && !calendar.isLoading && 'opacity-70 transition-opacity duration-base')} aria-busy={calendar.isFetching}>
                <CalendarTimeline data={data} onOpen={openItem} focusConflictId={focusConflict} />
              </div>
              <p className="qx-caption mt-2 text-fg-muted">
                Taralı bar: penceresi açık ama başka bir kayıt kazanıyor ya da bütçesi doldu. Renkli zemin: çakışma aralığı. Bara tıklayınca ayrıntı açılır.
              </p>
            </SectionCard>

            <SectionCard
              title={`Çakışmalar${data.conflicts.length ? ` (${data.conflicts.length})` : ''}`}
              description="Aynı anda tek kampanya ve tek konsept uygulanır; kaybedenin etkisi o aralıkta kullanıcıya ulaşmaz."
              icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            >
              <ConflictPanel
                data={data}
                onPick={(cid, kind, id) => {
                  setFocusConflict(cid);
                  openItem(kind, id);
                }}
              />
            </SectionCard>
          </div>
        )}
      </QueryState>

      <SectionCard title="Kayıtlar" description="Tüm kampanya ve konseptler, sayfalı. Arşivdekiler ayrı sekmede.">
        <SectionTabs
          ariaLabel="Katman"
          value={layer}
          onValueChange={(v) => url.write({ layer: v === 'concept' ? 'concept' : null, filter: null, page: null, q: null })}
          tabs={[
            { value: 'campaign', label: 'Kampanyalar', icon: <Coins className="h-4 w-4" aria-hidden /> },
            { value: 'concept', label: 'Konseptler', icon: <Palette className="h-4 w-4" aria-hidden /> },
          ]}
        >
          {(active) => <ItemList key={active} kind={active === 'concept' ? 'concept' : 'campaign'} onOpen={openItem} />}
        </SectionTabs>
      </SectionCard>

      <DetailSheet
        open={!!openId && !!openKind}
        onOpenChange={(o) => {
          if (!o) {
            closeItem();
            setFocusConflict(null);
          }
        }}
        id={openId}
        size="lg"
        title={() => detailTitle(openKind ?? 'campaign', openDetailItem)}
        description={() => (openKind === 'concept' ? 'Görünüm konsepti' : 'Ekonomi kampanyası')}
      >
        {() =>
          openId && openKind ? (
            <DetailContent
              kind={openKind}
              id={openId}
              onEdit={(item) => setEditor({ kind: item.kind, mode: 'edit', source: item })}
              onCopy={(item) => setEditor({ kind: item.kind, mode: 'create', source: item })}
              onDone={done}
            />
          ) : (
            <SkeletonDetail />
          )
        }
      </DetailSheet>

      {editor && (
        <CalendarEditor
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={(kind, id, message) => {
            setEditor(null);
            done(message);
            openItem(kind, id);
          }}
        />
      )}
    </PanelPage>
  );
}
