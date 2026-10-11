'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  Coins,
  Gamepad2,
  PauseCircle,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Swords,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DetailSheet, MetricGrid, MetricTile, StatusBadge, useDetailSheet } from '@/components/ds/data';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { EmptyState, QueryState, TONE_CALLOUT, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import { PORTFOLIO_LABELS, type GameRow, type GamesOverview, type PortfolioStatus } from '@/lib/admin-games/contract';
import { errorText, fetchOverview, fmt, gamesKeys, patchGame } from './api';
import { BulkDialog } from './bulk-dialog';

const GameSheetBody = dynamic(() => import('./game-sheet').then((m) => m.GameSheetBody), { ssr: false });
const TournamentPanel = dynamic(() => import('./tournament-panel').then((m) => m.TournamentPanel), { ssr: false });

export const PORTFOLIO_TONE: Record<PortfolioStatus, Tone> = {
  live: 'success',
  building: 'info',
  merged: 'neutral',
  retired: 'neutral',
  legacy: 'neutral',
};

type Filter = 'all' | 'live' | 'off' | 'building' | 'archived' | 'custom' | 'flagged';
const FILTERS: ReadonlyArray<[Filter, string]> = [
  ['all', 'Tümü'],
  ['live', 'Oynanabilir'],
  ['off', 'Kapalı'],
  ['building', 'Yapımda'],
  ['archived', 'Emekli / birleşen'],
  ['custom', 'Özelleştirilmiş'],
  ['flagged', 'Sinyalli'],
];
type Sort = 'portfolio' | 'points' | 'winRate' | 'flags' | 'started';
const SORTS: ReadonlyArray<[Sort, string]> = [
  ['portfolio', 'Portföy sırası'],
  ['points', '30g puan'],
  ['started', '30g deneme'],
  ['winRate', 'Kazanma oranı'],
  ['flags', 'Bütünlük sinyali'],
];

const isPlayable = (g: GameRow) => g.effective.enabled && !g.hidden;

function matches(g: GameRow, f: Filter): boolean {
  switch (f) {
    case 'live':
      return isPlayable(g);
    case 'off':
      return !g.effective.enabled;
    case 'building':
      return g.portfolio.status === 'building';
    case 'archived':
      return g.portfolio.status === 'merged' || g.portfolio.status === 'retired' || g.portfolio.status === 'legacy';
    case 'custom':
      return g.customizedFields.length > 0;
    case 'flagged':
      return g.stats.flagged30d > 0;
    default:
      return true;
  }
}

export function GamesControlRoom({ initial }: { initial: GamesOverview | null }) {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: gamesKeys.overview(),
    queryFn: fetchOverview,
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });
  const sheet = useDetailSheet('oyun', { history: 'push' });
  const [tab, setTab] = useState<'games' | 'tournament'>('games');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('portfolio');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ action: 'disable' | 'enable'; gameTypes: string[] } | null>(null);

  const data = overview.data;
  const games = useMemo(() => data?.games ?? [], [data]);

  const toggle = useMutation({
    mutationFn: (v: { g: GameRow; enabled: boolean }) => patchGame({ gameType: v.g.gameType, enabled: v.enabled }),
    onSuccess: (_r, v) => {
      toast.success(v.enabled ? `${v.g.effective.title} açıldı` : `${v.g.effective.title} kapatıldı — yeni ödüller derhal durdu`);
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: gamesKeys.all }),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const rows = games.filter(
      (g) =>
        matches(g, filter) &&
        (!q || g.effective.title.toLocaleLowerCase('tr-TR').includes(q) || g.gameType.includes(q))
    );
    if (sort === 'portfolio') return rows;
    const key: Record<Exclude<Sort, 'portfolio'>, (g: GameRow) => number> = {
      points: (g) => g.stats.pointsAwarded30d,
      started: (g) => g.stats.last30d.started,
      winRate: (g) => g.stats.winRate30d ?? -1,
      flags: (g) => g.stats.flagged30d,
    };
    const k = key[sort];
    return [...rows].sort((a, b) => k(b) - k(a));
  }, [games, query, filter, sort]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, games.filter((g) => matches(g, f)).length])), [games]);
  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.gameType));
  const toggleSel = (gt: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(gt);
      else n.delete(gt);
      return n;
    });

  const kpi = data?.kpi;
  const pointsDelta =
    kpi && kpi.pointsPrev30d > 0 ? Math.round(((kpi.points30d - kpi.pointsPrev30d) / kpi.pointsPrev30d) * 100) : null;
  const sheetRow = sheet.id ? games.find((g) => g.gameType === sheet.id) ?? null : null;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Oyunlaştırma · Ekonomi"
          title="Oyun Kontrol Odası"
          icon={<Gamepad2 />}
          description="Portföyü, oyun başına ödül/eşik/süreyi, haftalık turnuvayı ve bütünlük sinyallerini tek yerden yönetin. Ödül kararı her zaman sunucuda bu etkin değerlerle verilir."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11 sm:min-h-10"
                onClick={() => qc.invalidateQueries({ queryKey: gamesKeys.all })}
                disabled={overview.isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'motion-safe:animate-spin')} aria-hidden />
                Yenile
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 sm:min-h-10"
                disabled={!games.some(isPlayable)}
                onClick={() => setBulk({ action: 'disable', gameTypes: games.filter((g) => g.effective.enabled).map((g) => g.gameType) })}
              >
                <PauseCircle className="h-4 w-4" aria-hidden />
                Tümünü durdur
              </Button>
            </div>
          }
        />
      }
    >
      <QueryState query={overview} skeleton="table" isEmpty={(d) => d.games.length === 0} empty={{ title: 'Tanımlı oyun yok', description: 'Sunucu kayıt defterinde oyun bulunamadı.' }}>
        {(d) => (
          <div className="space-y-5">
            <MetricGrid cols={5}>
              <MetricTile
                label="Oynanabilir oyun"
                icon={<Gamepad2 />}
                tone="brand"
                metric={{ value: d.kpi.playable, unit: `/ ${d.kpi.total}` }}
                hint="Açık ve portföyde görünür oyunlar"
              />
              <MetricTile label="Bugün başlatılan" icon={<Play />} metric={{ value: d.kpi.startedToday }} hint="İstanbul günü, tüm oyunlar" />
              <MetricTile
                label="30g basılan puan"
                icon={<Coins />}
                tone="warning"
                metric={{
                  value: d.kpi.points30d,
                  unit: 'puan',
                  delta: pointsDelta == null ? null : { value: pointsDelta, kind: 'percent', goodDirection: 'neutral', label: 'önceki 30 güne göre' },
                }}
              />
              <MetricTile
                label="30g kazanma oranı"
                icon={<Trophy />}
                metric={{ value: d.kpi.winRate30d, format: 'percent', n: d.kpi.finished30d, minN: 30 }}
                hint="Kazanılan / biten deneme"
              />
              <MetricTile
                label="30g bütünlük sinyali"
                icon={<ShieldAlert />}
                tone={d.kpi.flagged30d > 0 ? 'danger' : 'neutral'}
                metric={{ value: d.kpi.flagged30d }}
                hint="Doğrulayıcının işaretlediği denemeler"
              />
            </MetricGrid>

            <p className={cn('rounded-control border px-3 py-2 text-xs', TONE_CALLOUT.info)}>
              Ekonomi kuralları: oyun başına günde {d.caps.attemptsPerDay} sıralı (ödüllü) deneme; oyun puanı kullanıcı başına günde{' '}
              {fmt(d.caps.daily)}, haftada {fmt(d.caps.weekly)} ile sınırlı (lib/economy). Ödül puanı en fazla {fmt(d.limits.rewardPoints.max)}, min. süre
              en az {d.limits.minDurationSec.min} sn olabilir.
            </p>

            <SectionTabs
              value={tab}
              onValueChange={(v) => setTab(v === 'tournament' ? 'tournament' : 'games')}
              ariaLabel="Oyun kontrol odası bölümleri"
              tabs={[
                { value: 'games', label: 'Oyunlar', icon: <Gamepad2 className="h-4 w-4" />, count: d.games.length },
                { value: 'tournament', label: 'Turnuva', icon: <Swords className="h-4 w-4" /> },
              ]}
            >
              {(active) =>
                active === 'tournament' ? (
                  <TournamentPanel onOpenGame={(gt) => sheet.open(gt)} />
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                        <Input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Oyun ara (ad ya da anahtar)…"
                          aria-label="Oyun ara"
                          className="h-11 pl-9 sm:h-10"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-fg-muted">
                        Sırala
                        <select
                          value={sort}
                          onChange={(e) => setSort(e.target.value as Sort)}
                          className="h-11 rounded-control border border-border bg-surface px-2 text-sm text-fg sm:h-10"
                        >
                          {SORTS.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div role="radiogroup" aria-label="Oyun süzgeci" className="flex flex-wrap gap-1.5">
                      {FILTERS.map(([key, label]) => (
                        <Button
                          key={key}
                          size="sm"
                          role="radio"
                          aria-checked={filter === key}
                          variant={filter === key ? 'default' : 'outline'}
                          className="min-h-11 sm:min-h-9"
                          onClick={() => setFilter(key)}
                        >
                          {label}
                          <span className="ml-1 tabular-nums">{counts[key]}</span>
                        </Button>
                      ))}
                    </div>

                    {selected.size > 0 && (
                      <div
                        role="region"
                        aria-label="Toplu işlem"
                        className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{selected.size} oyun seçildi</span>
                        <Button size="sm" variant="destructive" className="min-h-11 sm:min-h-9" onClick={() => setBulk({ action: 'disable', gameTypes: [...selected] })}>
                          Seçilenleri kapat
                        </Button>
                        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setBulk({ action: 'enable', gameTypes: [...selected] })}>
                          Seçilenleri aç
                        </Button>
                        <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setSelected(new Set())}>
                          Seçimi temizle
                        </Button>
                      </div>
                    )}

                    {visible.length === 0 ? (
                      <EmptyState
                        variant="no-results"
                        title="Eşleşen oyun yok"
                        secondaryAction={
                          <Button size="sm" variant="ghost" onClick={() => { setQuery(''); setFilter('all'); }}>
                            Süzgeçleri temizle
                          </Button>
                        }
                      />
                    ) : (
                      <>
                        {/* Masaüstü: yoğun tablo */}
                        <div className="hidden overflow-x-auto rounded-card border border-border md:block">
                          <table className="w-full text-sm">
                            <caption className="sr-only">Oyunlar, durum, ödül ve son 30 gün metrikleri</caption>
                            <thead className="bg-surface-muted text-left text-xs text-fg-muted">
                              <tr>
                                <th scope="col" className="w-10 px-3 py-2">
                                  <Checkbox
                                    aria-label="Görünen tüm oyunları seç"
                                    checked={allVisibleSelected}
                                    onCheckedChange={(c) =>
                                      setSelected((prev) => {
                                        const n = new Set(prev);
                                        for (const g of visible) {
                                          if (c) n.add(g.gameType);
                                          else n.delete(g.gameType);
                                        }
                                        return n;
                                      })
                                    }
                                  />
                                </th>
                                <th scope="col" className="px-3 py-2 font-medium">Oyun</th>
                                <th scope="col" className="px-3 py-2 font-medium">Portföy</th>
                                <th scope="col" className="px-3 py-2 font-medium">Açık</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">Ödül</th>
                                <th scope="col" className="px-3 py-2 font-medium">Eşik / maks.</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">30g deneme</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">Kazanma</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">30g puan</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">Sinyal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visible.map((g) => (
                                <tr
                                  key={g.gameType}
                                  className={cn(
                                    'border-t border-border transition-colors motion-reduce:transition-none hover:bg-surface-muted/60',
                                    !g.effective.enabled && 'bg-surface-muted/40'
                                  )}
                                >
                                  <td className="px-3 py-2">
                                    <Checkbox
                                      aria-label={`${g.effective.title} seç`}
                                      checked={selected.has(g.gameType)}
                                      onCheckedChange={(c) => toggleSel(g.gameType, c === true)}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => sheet.open(g.gameType)}
                                      className="flex min-h-11 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <span
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-lg"
                                        style={{ backgroundColor: `${g.effective.accent}26` }}
                                        aria-hidden
                                      >
                                        {g.effective.emoji}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block font-medium text-fg underline-offset-2 hover:underline">{g.effective.title}</span>
                                        <span className="block font-mono text-[11px] text-fg-muted">
                                          {g.gameType}
                                          {g.featured && ' · turnuva'}
                                          {g.customizedFields.length > 0 && ` · ${g.customizedFields.length} özel alan`}
                                        </span>
                                      </span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <StatusBadge size="sm" label={PORTFOLIO_LABELS[g.portfolio.status]} tone={PORTFOLIO_TONE[g.portfolio.status]} />
                                  </td>
                                  <td className="px-3 py-2">
                                    <Switch
                                      checked={g.effective.enabled}
                                      disabled={toggle.isPending && toggle.variables?.g.gameType === g.gameType}
                                      onCheckedChange={(c) => toggle.mutate({ g, enabled: c })}
                                      aria-label={`${g.effective.title} oyununu ${g.effective.enabled ? 'kapat' : 'aç'}`}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {g.effective.rewardPoints} p<span className="text-fg-muted"> / {g.effective.rewardXp} XP</span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <ThresholdBar threshold={g.effective.rewardThreshold} max={g.effective.maxScore} />
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">{fmt(g.stats.last30d.started)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{g.stats.winRate30d == null ? '—' : `%${g.stats.winRate30d}`}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{fmt(g.stats.pointsAwarded30d)}</td>
                                  <td className={cn('px-3 py-2 text-right tabular-nums', g.stats.flagged30d > 0 && 'font-semibold text-danger')}>
                                    {fmt(g.stats.flagged30d)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobil: kompakt satır kartları */}
                        <ul className="space-y-2 md:hidden">
                          {visible.map((g) => (
                            <li key={g.gameType} className={cn('rounded-card border border-border bg-surface p-3', !g.effective.enabled && 'bg-surface-muted/50')}>
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  className="mt-3"
                                  aria-label={`${g.effective.title} seç`}
                                  checked={selected.has(g.gameType)}
                                  onCheckedChange={(c) => toggleSel(g.gameType, c === true)}
                                />
                                <button type="button" onClick={() => sheet.open(g.gameType)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
                                  <span className="text-2xl" aria-hidden>
                                    {g.effective.emoji}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium">{g.effective.title}</span>
                                    <span className="block text-xs text-fg-muted">
                                      {PORTFOLIO_LABELS[g.portfolio.status]} · {g.effective.rewardPoints} p · eşik {g.effective.rewardThreshold}/{g.effective.maxScore}
                                    </span>
                                  </span>
                                </button>
                                <Switch
                                  className="mt-3"
                                  checked={g.effective.enabled}
                                  disabled={toggle.isPending && toggle.variables?.g.gameType === g.gameType}
                                  onCheckedChange={(c) => toggle.mutate({ g, enabled: c })}
                                  aria-label={`${g.effective.title} oyununu ${g.effective.enabled ? 'kapat' : 'aç'}`}
                                />
                              </div>
                              <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] text-fg-muted">
                                <MobileStat label="30g deneme" value={fmt(g.stats.last30d.started)} />
                                <MobileStat label="Kazanma" value={g.stats.winRate30d == null ? '—' : `%${g.stats.winRate30d}`} />
                                <MobileStat label="30g puan" value={fmt(g.stats.pointsAwarded30d)} />
                                <MobileStat label="Sinyal" value={fmt(g.stats.flagged30d)} danger={g.stats.flagged30d > 0} />
                              </dl>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Activity className="h-3.5 w-3.5" aria-hidden />
                      Veriler {new Date(d.generatedAt).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })} itibarıyla; kapatma yeni denemeleri ve süren denemelerin ödülünü anında durdurur.
                    </p>
                  </div>
                )
              }
            </SectionTabs>
          </div>
        )}
      </QueryState>

      <DetailSheet
        paramKey="oyun"
        size="lg"
        history="push"
        title={() => (sheetRow ? `${sheetRow.effective.emoji} ${sheetRow.effective.title}` : 'Oyun ayrıntısı')}
        description="Ödül ve zorluk, görünüm, metrikler ve değişiklik geçmişi"
      >
        {(id) => <GameSheetBody gameType={id} row={games.find((g) => g.gameType === id) ?? null} overview={data ?? null} />}
      </DetailSheet>

      {bulk && (
        <BulkDialog
          action={bulk.action}
          games={games.filter((g) => bulk.gameTypes.includes(g.gameType))}
          onClose={() => setBulk(null)}
          onDone={() => {
            setBulk(null);
            setSelected(new Set());
          }}
        />
      )}
    </PanelPage>
  );
}

function ThresholdBar({ threshold, max }: { threshold: number; max: number }) {
  const p = max > 0 ? Math.min(100, Math.round((threshold / max) * 100)) : 0;
  return (
    <div className="flex min-w-[96px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs tabular-nums text-fg-muted">
        {threshold}/{max}
      </span>
    </div>
  );
}

function MobileStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-control bg-surface-muted px-1 py-1.5">
      <dt>{label}</dt>
      <dd className={cn('text-sm font-semibold tabular-nums text-fg', danger && 'text-danger')}>{value}</dd>
    </div>
  );
}
