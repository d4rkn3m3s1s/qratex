'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { m as Motion } from 'framer-motion';
import {
  Archive,
  Coins,
  Gamepad2,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Swords,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  ConfirmAction,
  EmptyState,
  PageHeader,
  QueryState,
  SectionCard,
  TONE_CHIP,
  type ImpactItem,
} from '@/components/states';

/**
 * Admin mini oyun kontrol paneli. /api/admin/games (ADMIN-gated) ile çalışır.
 *
 * Denetim düzeltmeleri (docs/audit/2026-10-08/admin/admin_games.md):
 *  B2 — form YALNIZ değişen alanları gönderir, `enabled` formdan asla gönderilmez
 *       (düzenleme açıkken kapatılan oyun "Kaydet"le sessizce açılmaz) + iyimser
 *       eşzamanlılık (`expectedUpdatedAt` → 409).
 *  B4 — ekonomiyi büyüten değişiklikler (ödül ×2 üstü, min. süre düşüşü) etki önizlemeli
 *       onay ister; sunucu sınırları formda gösterilir.
 *  B5 — huni: başlatılan / kazanılan / kaybedilen, kazanma ve ödül oranı.
 *  B6 — pacman ("Yıldız Avı") panelde.  B7 — "N alan özelleştirildi" + Varsayılana sıfırla.
 *  B12 — etiket–alan bağı, anahtarın erişilebilir adı, pasif kart opaklık yerine rozetle.
 *  §7.3 — portföyden gizlenen oyunlar "Emekli" rozetiyle; haftanın turnuva oyunu işaretli.
 */

type NumField = 'maxScore' | 'rewardThreshold' | 'rewardPoints' | 'rewardXp' | 'minDurationSec';
type StrField = 'title' | 'description' | 'emoji' | 'accent';
type EditField = NumField | StrField;
const EDIT_FIELDS: EditField[] = [
  'title',
  'description',
  'emoji',
  'accent',
  'rewardPoints',
  'rewardXp',
  'maxScore',
  'rewardThreshold',
  'minDurationSec',
];
const NUM_FIELDS: ReadonlySet<EditField> = new Set<EditField>(['maxScore', 'rewardThreshold', 'rewardPoints', 'rewardXp', 'minDurationSec']);

const FIELD_LABEL: Record<EditField, string> = {
  title: 'Başlık',
  description: 'Açıklama',
  emoji: 'Emoji',
  accent: 'Renk',
  rewardPoints: 'Ödül puanı',
  rewardXp: 'Ödül XP',
  maxScore: 'Maks. skor',
  rewardThreshold: 'Ödül eşiği',
  minDurationSec: 'Min. süre (sn)',
};

interface GameDefaults {
  title: string;
  description: string;
  emoji: string;
  accent: string;
  maxScore: number;
  rewardThreshold: number;
  rewardPoints: number;
  rewardXp: number;
  minDurationSec: number;
}
type GameOverride = { enabled: boolean } & { [K in EditField]: K extends NumField ? number | null : string | null };
type Counts = { started: number; won: number; lost: number; active: number };
interface GameRow {
  gameType: string;
  legacy: boolean;
  hidden: boolean;
  hiddenReason: string | null;
  featured: boolean;
  updatedAt: string | null;
  customizedFields: EditField[];
  defaults: GameDefaults;
  override: GameOverride | null;
  effective: GameDefaults & { enabled: boolean; maxScorePerSec: number | null; maxDurationSec: number };
  stats: {
    playedToday: number;
    played30d: number;
    rewarded30d: number;
    pointsAwarded30d: number;
    today?: Counts;
    last30d?: Counts;
    winRate30d?: number | null;
    rewardRate30d?: number | null;
  };
}
interface Limits {
  rewardPoints: { min: number; max: number };
  rewardXp: { min: number; max: number };
  rewardThreshold: { min: number; max: number };
  maxScore: { min: number; max: number };
  minDurationSec: { min: number; max: number };
  titleMax: number;
  descriptionMax: number;
}
interface GamesResponse {
  games: GameRow[];
  limits?: Limits;
  tournament?: { featuredGameType: string | null; minParticipants: number };
}

type EditState = Record<EditField, string>;
type Filter = 'all' | 'active' | 'inactive' | 'hidden';

function toEdit(g: GameRow): EditState {
  const ov = g.override;
  const out = {} as EditState;
  for (const k of EDIT_FIELDS) {
    const v = ov?.[k];
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

/** Yalnız değişen alanlar: '' → null (varsayılana dön), sayılar sayıya. */
function dirtyPatch(initial: EditState, edit: EditState): Partial<Record<EditField, string | number | null>> {
  const patch: Partial<Record<EditField, string | number | null>> = {};
  for (const k of EDIT_FIELDS) {
    if (initial[k].trim() === edit[k].trim()) continue;
    const v = edit[k].trim();
    patch[k] = v === '' ? null : NUM_FIELDS.has(k) ? Number(v) : v;
  }
  return patch;
}

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('tr-TR');
}

async function fetchGames(): Promise<GamesResponse> {
  const res = await fetch('/api/admin/games', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Oyun ayarları yüklenemedi') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as GamesResponse;
}

export default function AdminGamesPage() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [initialEdit, setInitialEdit] = useState<EditState | null>(null);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingRisk, setPendingRisk] = useState<{ game: GameRow; impact: ImpactItem[] } | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const d = await fetchGames();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return games.filter((g) => {
      if (filter === 'active' && !(g.effective.enabled && !g.hidden)) return false;
      if (filter === 'inactive' && g.effective.enabled) return false;
      if (filter === 'hidden' && !g.hidden) return false;
      if (!q) return true;
      return (
        g.effective.title.toLocaleLowerCase('tr-TR').includes(q) || g.gameType.includes(q)
      );
    });
  }, [games, query, filter]);

  const startEdit = (g: GameRow) => {
    if (editing && editing !== g.gameType && edit && initialEdit && Object.keys(dirtyPatch(initialEdit, edit)).length > 0) {
      toast.message('Önce açık düzenlemeyi kaydedin ya da vazgeçin.');
      return;
    }
    const e = toEdit(g);
    setEditing(g.gameType);
    setEdit(e);
    setInitialEdit(e);
  };
  const cancelEdit = () => {
    setEditing(null);
    setEdit(null);
    setInitialEdit(null);
  };

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/games', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) {
      if (res.status === 409) void load();
      throw new Error(d.error || 'Kaydedilemedi');
    }
  };

  // Aktif/pasif anahtarı — anında kaydeder (kill-switch). Form state'ine dokunmaz.
  const toggleEnabled = async (g: GameRow, enabled: boolean) => {
    setSavingType(g.gameType);
    try {
      await patch({ gameType: g.gameType, enabled });
      toast.success(enabled ? `${g.effective.title} açıldı` : `${g.effective.title} kapatıldı — ödüller derhal durdu`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingType(null);
    }
  };

  const doSave = async (g: GameRow) => {
    if (!edit || !initialEdit) return;
    const changes = dirtyPatch(initialEdit, edit);
    if (Object.keys(changes).length === 0) {
      cancelEdit();
      return;
    }
    setSavingType(g.gameType);
    try {
      await patch({ gameType: g.gameType, expectedUpdatedAt: g.updatedAt, ...changes });
      toast.success('Oyun ayarları kaydedildi');
      cancelEdit();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSavingType(null);
    }
  };

  /** Ekonomiyi büyüten değişiklik mi? Öyleyse etki önizlemeli onay iste (admin B4). */
  const save = (g: GameRow) => {
    if (!edit || !initialEdit) return;
    const changes = dirtyPatch(initialEdit, edit);
    const nextPoints = 'rewardPoints' in changes ? (changes.rewardPoints as number | null) ?? g.defaults.rewardPoints : g.effective.rewardPoints;
    const nextMinDur = 'minDurationSec' in changes ? (changes.minDurationSec as number | null) ?? g.defaults.minDurationSec : g.effective.minDurationSec;
    const nextThreshold = 'rewardThreshold' in changes ? (changes.rewardThreshold as number | null) ?? g.defaults.rewardThreshold : g.effective.rewardThreshold;
    const risky =
      nextPoints > g.defaults.rewardPoints * 2 ||
      nextMinDur < g.effective.minDurationSec ||
      nextThreshold < g.effective.rewardThreshold;
    if (!risky) {
      void doSave(g);
      return;
    }
    const monthlyDelta = (nextPoints - g.effective.rewardPoints) * (g.stats.rewarded30d ?? 0);
    setPendingRisk({
      game: g,
      impact: [
        { label: 'Ödül puanı', value: `${fmt(g.effective.rewardPoints)} → ${fmt(nextPoints)}`, emphasis: nextPoints !== g.effective.rewardPoints },
        { label: 'Ödül eşiği', value: `${fmt(g.effective.rewardThreshold)} → ${fmt(nextThreshold)}`, emphasis: nextThreshold < g.effective.rewardThreshold },
        { label: 'Min. süre', value: `${fmt(g.effective.minDurationSec)} sn → ${fmt(nextMinDur)} sn`, emphasis: nextMinDur < g.effective.minDurationSec },
        {
          label: 'Son 30 günün ödüllü oyunlarına göre aylık puan farkı',
          value: `${monthlyDelta >= 0 ? '+' : ''}${fmt(monthlyDelta)} puan`,
          emphasis: true,
        },
      ],
    });
  };

  const resetDefaults = async (g: GameRow) => {
    const res = await fetch(`/api/admin/games?gameType=${encodeURIComponent(g.gameType)}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) throw new Error(d.error || 'Sıfırlanamadı');
    toast.success(`${g.defaults.title} varsayılan ayarlara döndü`);
    if (editing === g.gameType) cancelEdit();
    await load();
  };

  const activeCount = games.filter((g) => g.effective.enabled && !g.hidden).length;
  const featured = games.find((g) => g.featured);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Yönetim · Oyunlaştırma"
        icon={<Gamepad2 />}
        title="Mini Oyun Yönetimi"
        description="Ödül, eşik, süre ve görselleri yönetin. Ödül kararı her zaman sunucuda bu etkin değerlerle verilir; oyunu kapatmak ödülleri anında durdurur."
        meta={
          data ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={cn('rounded-chip px-2 py-0.5 font-medium', TONE_CHIP.brand)}>
                {activeCount}/{games.length} oyun aktif
              </span>
              {featured && (
                <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 font-medium', TONE_CHIP.warning)}>
                  <Swords className="h-3 w-3" aria-hidden /> Haftanın turnuvası: {featured.effective.title}
                  {data.tournament ? ` (en az ${data.tournament.minParticipants} oyuncu)` : ''}
                </span>
              )}
              <span className={cn('rounded-chip px-2 py-0.5 font-medium', TONE_CHIP.neutral)}>
                Oyun puanı tavanı: günde 600 · haftada 3.000
              </span>
            </div>
          ) : null
        }
      />

      <QueryState
        query={{ data, error, isLoading: loading, isFetching: fetching, refetch: load }}
        skeleton="cards"
        isEmpty={(d) => d.games.length === 0}
        empty={{ title: 'Tanımlı oyun yok', description: 'Registry’de oyun bulunamadı.' }}
      >
        {() => (
          <div className="space-y-4">
            {/* Arama + filtre */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Oyun ara…"
                  aria-label="Oyun ara"
                  className="h-9 pl-9"
                />
              </div>
              <div role="radiogroup" aria-label="Oyun filtresi" className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'Tümü'],
                    ['active', 'Aktif'],
                    ['inactive', 'Kapalı'],
                    ['hidden', 'Emekli'],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    role="radio"
                    aria-checked={filter === key}
                    variant={filter === key ? 'default' : 'outline'}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                variant="no-results"
                title="Eşleşen oyun yok"
                secondaryAction={
                  <Button size="sm" variant="ghost" onClick={() => { setQuery(''); setFilter('all'); }}>
                    Filtreleri temizle
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visible.map((g, i) => (
                  <Motion.div
                    key={g.gameType}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                  >
                    <GameCard
                      g={g}
                      limits={data?.limits}
                      isEditing={editing === g.gameType}
                      edit={editing === g.gameType ? edit : null}
                      onEditChange={setEdit}
                      busy={savingType === g.gameType}
                      onToggle={(c) => void toggleEnabled(g, c)}
                      onStartEdit={() => startEdit(g)}
                      onCancel={cancelEdit}
                      onSave={() => save(g)}
                      onReset={() => resetDefaults(g)}
                    />
                  </Motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </QueryState>

      <ConfirmAction
        open={!!pendingRisk}
        onOpenChange={(o) => !o && setPendingRisk(null)}
        tone="warning"
        title="Ekonomiyi etkileyen değişiklik"
        description="Bu değişiklik oyunların bastığı puanı artırabilir ya da bot korumasını gevşetebilir. Etkisini kontrol edip onaylayın."
        impact={pendingRisk ? { items: pendingRisk.impact, warning: 'Oyun puanı yine de kullanıcı başına günde 600, haftada 3.000 ile sınırlıdır.' } : undefined}
        irreversibleNote={false}
        confirmLabel="Onayla ve kaydet"
        onConfirm={async () => {
          if (pendingRisk) await doSave(pendingRisk.game);
          setPendingRisk(null);
        }}
      />
    </div>
  );
}

function GameCard({
  g,
  limits,
  isEditing,
  edit,
  onEditChange,
  busy,
  onToggle,
  onStartEdit,
  onCancel,
  onSave,
  onReset,
}: {
  g: GameRow;
  limits?: Limits;
  isEditing: boolean;
  edit: EditState | null;
  onEditChange: (e: EditState) => void;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => Promise<void>;
}) {
  const eff = g.effective;
  const on = eff.enabled && !g.hidden;
  const m30 = g.stats.last30d;
  const customized = g.customizedFields?.length ?? 0;
  const set = (k: EditField, v: string) => edit && onEditChange({ ...edit, [k]: v });
  const lim = (k: NumField) => limits?.[k];

  return (
    <SectionCard
      stripe
      tone={g.hidden ? 'neutral' : on ? 'brand' : 'warning'}
      className={cn(!on && 'bg-surface-muted')}
      icon={<span className="text-xl leading-none" aria-hidden>{eff.emoji}</span>}
      title={eff.title}
      description={<span className="font-mono text-[11px]">{g.gameType}</span>}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {g.featured && (
            <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold', TONE_CHIP.warning)}>
              <Swords className="h-3 w-3" aria-hidden /> Turnuva
            </span>
          )}
          {g.legacy && (
            <span className={cn('rounded-chip px-2 py-0.5 text-[11px] font-semibold', TONE_CHIP.info)}>Eski yol</span>
          )}
          {g.hidden && (
            <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold', TONE_CHIP.neutral)}>
              <Archive className="h-3 w-3" aria-hidden /> Emekli
            </span>
          )}
          {!eff.enabled && (
            <span className={cn('rounded-chip px-2 py-0.5 text-[11px] font-semibold', TONE_CHIP.danger)}>Kapalı</span>
          )}
          {customized > 0 && (
            <span
              className={cn('rounded-chip px-2 py-0.5 text-[11px] font-semibold', TONE_CHIP.brand)}
              title={g.customizedFields.map((k) => FIELD_LABEL[k]).join(', ')}
            >
              {customized} alan özelleştirildi
            </span>
          )}
          <Switch
            checked={eff.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={`${eff.title} oyununu ${eff.enabled ? 'kapat' : 'aç'}`}
          />
        </div>
      }
    >
      <div className="space-y-3">
        {g.hidden && g.hiddenReason && (
          <p className="rounded-control border border-border bg-surface-muted px-3 py-2 text-xs text-fg-muted">
            Portföyden çıkarıldı: {g.hiddenReason} Hub’da görünmez ve ödüllü deneme açılamaz.
          </p>
        )}

        {/* Huni */}
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <MiniStat icon={<Users className="h-3.5 w-3.5" />} label="Bugün başlatılan" value={fmt(g.stats.today?.started ?? g.stats.playedToday)} />
          <MiniStat icon={<Target className="h-3.5 w-3.5" />} label="30g deneme" value={fmt(m30?.started ?? g.stats.played30d)} />
          <MiniStat
            icon={<Trophy className="h-3.5 w-3.5" />}
            label="30g kazanma"
            value={g.stats.winRate30d == null ? '—' : `%${g.stats.winRate30d}`}
          />
          <MiniStat icon={<Coins className="h-3.5 w-3.5" />} label="30g puan" value={fmt(g.stats.pointsAwarded30d)} />
        </dl>

        {!isEditing && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Pill>Ödül: {eff.rewardPoints} puan / {eff.rewardXp} XP</Pill>
            <Pill>Eşik: {eff.rewardThreshold}/{eff.maxScore}</Pill>
            <Pill>Min. süre: {eff.minDurationSec} sn</Pill>
            {eff.maxScorePerSec != null && <Pill>Makullük: ≤ {eff.maxScorePerSec} skor/sn</Pill>}
            <Pill>Deneme penceresi: {Math.round(eff.maxDurationSec / 60)} dk</Pill>
          </div>
        )}

        {isEditing && edit && (
          <div className="space-y-3 rounded-control border border-border bg-surface-muted/50 p-3">
            <p className="text-xs text-fg-muted">
              Boş bırakılan alan varsayılanı kullanır. Yalnız değiştirdiğiniz alanlar kaydedilir; oyunu açıp kapatmak için anahtarı kullanın.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={FIELD_LABEL.title} placeholder={g.defaults.title} value={edit.title} maxLength={limits?.titleMax} onChange={(v) => set('title', v)} />
              <Field label={FIELD_LABEL.emoji} placeholder={g.defaults.emoji} value={edit.emoji} onChange={(v) => set('emoji', v)} hint="Tek simge" />
            </div>
            <Field label={FIELD_LABEL.description} placeholder={g.defaults.description} value={edit.description} maxLength={limits?.descriptionMax} onChange={(v) => set('description', v)} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField label={FIELD_LABEL.accent} placeholder={g.defaults.accent} value={edit.accent} onChange={(v) => set('accent', v)} />
              <Field label={FIELD_LABEL.rewardPoints} type="number" placeholder={String(g.defaults.rewardPoints)} value={edit.rewardPoints} min={lim('rewardPoints')?.min} max={lim('rewardPoints')?.max} onChange={(v) => set('rewardPoints', v)} />
              <Field label={FIELD_LABEL.rewardXp} type="number" placeholder={String(g.defaults.rewardXp)} value={edit.rewardXp} min={lim('rewardXp')?.min} max={lim('rewardXp')?.max} onChange={(v) => set('rewardXp', v)} />
              <Field label={FIELD_LABEL.maxScore} type="number" placeholder={String(g.defaults.maxScore)} value={edit.maxScore} min={lim('maxScore')?.min} max={lim('maxScore')?.max} onChange={(v) => set('maxScore', v)} />
              <Field label={FIELD_LABEL.rewardThreshold} type="number" placeholder={String(g.defaults.rewardThreshold)} value={edit.rewardThreshold} min={lim('rewardThreshold')?.min} max={lim('rewardThreshold')?.max} onChange={(v) => set('rewardThreshold', v)} />
              <Field label={FIELD_LABEL.minDurationSec} type="number" placeholder={String(g.defaults.minDurationSec)} value={edit.minDurationSec} min={lim('minDurationSec')?.min} max={lim('minDurationSec')?.max} onChange={(v) => set('minDurationSec', v)} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isEditing ? (
            <>
              <Button size="sm" variant="gradient" disabled={busy} loading={busy} onClick={onSave}>
                {!busy && <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                Kaydet
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
                <X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Vazgeç
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onStartEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Düzenle
            </Button>
          )}
          {customized > 0 && (
            <ConfirmAction
              trigger={
                <Button size="sm" variant="ghost" disabled={busy}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Varsayılana sıfırla
                </Button>
              }
              tone="warning"
              title={`${eff.title} varsayılana dönsün mü?`}
              description="Tüm özelleştirmeler kaldırılır; oyunun açık/kapalı durumu korunur. İşlem denetim kaydına yazılır."
              impact={g.customizedFields.map((k) => ({
                label: FIELD_LABEL[k],
                value: `${String(eff[k as keyof GameDefaults])} → ${String(g.defaults[k as keyof GameDefaults])}`,
              }))}
              irreversibleNote={false}
              confirmLabel="Sıfırla"
              onConfirm={onReset}
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface-muted p-2">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-fg-muted">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd className="text-base font-bold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-chip bg-surface-muted px-2 py-1 font-medium text-fg-muted">{children}</span>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const range = min != null && max != null ? `${min.toLocaleString('tr-TR')}–${max.toLocaleString('tr-TR')}` : null;
  const helper = [hint, range ? `Aralık: ${range}` : null, maxLength ? `${value.length}/${maxLength}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={value}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={helper ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
      {helper && (
        <p id={hintId} className="text-[11px] text-fg-muted">
          {helper}
        </p>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const valid = value.trim() === '' || /^#[0-9a-fA-F]{6}$/.test(value.trim());
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} seçici`}
          value={valid && value.trim() ? value.trim() : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-control border border-border bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          aria-invalid={!valid}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 font-mono"
        />
      </div>
      {!valid && <p className="text-[11px] text-danger">#RRGGBB biçiminde olmalı (ör. #22d3ee).</p>}
    </div>
  );
}
