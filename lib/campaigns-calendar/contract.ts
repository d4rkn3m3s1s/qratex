/**
 * Kampanya Takvimi (/admin/campaigns-calendar) — saf sözleşme: zod şemaları, türetilmiş
 * durum, çakışma/gölgelenme analizi, İstanbul saati yardımcıları. İstemci ve sunucu aynı
 * dosyayı kullanır (DB yok, Jest ile test edilir).
 *
 * İki katman tek zaman çizelgesinde:
 *  - Ekonomi katmanı → `SeasonalCampaign` (çarpan + bonus + hedef kitle + isteğe bağlı görev + bütçe)
 *  - Görünüm katmanı → `SeasonalConcept` (palet + arka plan efekti + banner)
 *
 * Kazanan kuralları üretimdeki seçicilerle BİREBİR aynıdır:
 *  - kampanya: `lib/seasonal-campaign-live` → kırpılmış çarpan büyük olan, eşitse bonus büyük olan
 *  - konsept: `lib/seasonal-concept-core` → öncelik büyük olan, eşitse daha geç başlayan
 */
import { z } from 'zod';
import {
  SEASONAL_BONUS_MAX,
  SEASONAL_MULTIPLIER_MAX,
  SEASONAL_MULTIPLIER_MIN,
  clampSeasonalBonus,
  clampSeasonalMultiplier,
} from '@/lib/points-multipliers';
import {
  SEASONAL_BUDGET_MAX,
  SEASONAL_BUDGET_MIN,
  SEASONAL_CAMPAIGN_TYPES,
  TARGETED_CAMPAIGN_TYPES,
} from '@/lib/seasonal-campaign-constants';
import { SEASONAL_BACKGROUND_OPTIONS, SEASONAL_THEME_OPTIONS } from '@/lib/seasonal-concept-options';

export const ISTANBUL_TZ = 'Europe/Istanbul';
/** Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
export const ISTANBUL_OFFSET = '+03:00';

/** Görev ödülü tavanı — `seasonal_challenge` kredisi `capCategory: null` ile basıldığı için yazım anında sınırlanır. */
export const CHALLENGE_REWARD_MAX = 1000;
export const CHALLENGE_GOAL_MAX = 1000;
export const CHALLENGE_TYPES = ['games_played', 'reviews_written'] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export const CAMPAIGN_CAPS = {
  multiplierMin: SEASONAL_MULTIPLIER_MIN,
  multiplierMax: SEASONAL_MULTIPLIER_MAX,
  bonusMax: SEASONAL_BONUS_MAX,
  budgetMin: SEASONAL_BUDGET_MIN,
  budgetMax: SEASONAL_BUDGET_MAX,
  challengeRewardMax: CHALLENGE_REWARD_MAX,
} as const;

export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  SEASONAL: 'Sezonluk',
  SPECIAL: 'Özel',
  BIRTHDAY: 'Doğum günü',
  ANNIVERSARY: 'Üyelik yıl dönümü',
};

export const CAMPAIGN_TYPE_HINT: Record<string, string> = {
  SEASONAL: 'Pencere boyunca tüm müşterilere uygulanır.',
  SPECIAL: 'Pencere boyunca tüm müşterilere uygulanır.',
  BIRTHDAY: 'Yalnız doğum günü o gün olan müşteriye uygulanır.',
  ANNIVERSARY: 'Yalnız üyelik yıl dönümü o gün olan müşteriye uygulanır (en az 1 yıl).',
};

export const CHALLENGE_TYPE_LABEL: Record<ChallengeType, string> = {
  games_played: 'Oyun oyna',
  reviews_written: 'Yorum yaz',
};

const BACKGROUND_VALUES = SEASONAL_BACKGROUND_OPTIONS.map((o) => o.value).filter(Boolean) as [string, ...string[]];
const THEME_VALUES = SEASONAL_THEME_OPTIONS.map((o) => o.value).filter(Boolean) as [string, ...string[]];

export function backgroundLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SEASONAL_BACKGROUND_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
export function themeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SEASONAL_THEME_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// ───────────────────────────── Zaman ─────────────────────────────

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `datetime-local` değerini (İstanbul duvar saati) ISO anına çevirir; geçersizse null. */
export function istanbulLocalToIso(local: string): string | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const d = new Date(`${local.trim()}:00${ISTANBUL_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO anını `datetime-local` biçiminde İstanbul duvar saatine çevirir. */
export function isoToIstanbulLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() + 3 * 3600_000);
  return shifted.toISOString().slice(0, 16);
}

const DT_FMT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: ISTANBUL_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const D_FMT = new Intl.DateTimeFormat('tr-TR', { timeZone: ISTANBUL_TZ, day: 'numeric', month: 'short' });

export function formatIstanbul(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : DT_FMT.format(d);
}
export function formatIstanbulDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : D_FMT.format(d);
}

/** "3 gün 4 saat" / "5 saat 12 dk" / "12 dk" — negatif/0 → "şimdi". */
export function formatSpan(ms: number): string {
  if (!(ms > 0)) return 'şimdi';
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return h > 0 ? `${d} gün ${h} saat` : `${d} gün`;
  if (h > 0) return m > 0 ? `${h} saat ${m} dk` : `${h} saat`;
  return `${Math.max(1, m)} dk`;
}

// ───────────────────────────── Şemalar ─────────────────────────────

const isoInstant = (label: string) =>
  z
    .string({ required_error: `${label} gerekli`, invalid_type_error: `${label} geçersiz` })
    .datetime({ offset: true, message: `${label} geçersiz` });

const nullableTrimmed = (max: number, label: string) =>
  z
    .string({ invalid_type_error: `${label} metin olmalı` })
    .trim()
    .max(max, `${label} en fazla ${max} karakter olabilir`)
    .nullable()
    .transform((v) => (v ? v : null));

export const challengeSchema = z
  .object({
    type: z.enum(CHALLENGE_TYPES, { errorMap: () => ({ message: 'Görev türü geçersiz' }) }),
    goal: z
      .number({ invalid_type_error: 'Hedef sayı olmalı' })
      .int('Hedef tam sayı olmalı')
      .min(1, 'Hedef en az 1 olmalı')
      .max(CHALLENGE_GOAL_MAX, `Hedef en fazla ${CHALLENGE_GOAL_MAX} olabilir`),
    rewardPoints: z
      .number({ invalid_type_error: 'Görev ödülü sayı olmalı' })
      .int('Görev ödülü tam sayı olmalı')
      .min(0, 'Görev ödülü negatif olamaz')
      .max(CHALLENGE_REWARD_MAX, `Görev ödülü en fazla ${CHALLENGE_REWARD_MAX} puan olabilir`),
    rewardBadgeId: z.string().trim().min(1).max(64).nullable(),
  })
  .refine((c) => c.rewardPoints > 0 || c.rewardBadgeId !== null, {
    message: 'Görevin bir ödülü olmalı (puan ya da rozet)',
    path: ['rewardPoints'],
  });

export const campaignInputSchema = z
  .object({
    name: z
      .string({ required_error: 'Ad gerekli' })
      .trim()
      .min(2, 'Ad en az 2 karakter olmalı')
      .max(120, 'Ad en fazla 120 karakter olabilir'),
    description: z
      .string({ required_error: 'Açıklama gerekli' })
      .trim()
      .min(1, 'Müşterinin göreceği açıklama gerekli')
      .max(2000, 'Açıklama en fazla 2000 karakter olabilir'),
    type: z.enum(SEASONAL_CAMPAIGN_TYPES, { errorMap: () => ({ message: 'Kampanya türü geçersiz' }) }),
    multiplier: z
      .number({ invalid_type_error: 'Çarpan sayı olmalı' })
      .finite('Çarpan sayı olmalı')
      .min(SEASONAL_MULTIPLIER_MIN, `Çarpan en az ${SEASONAL_MULTIPLIER_MIN} olmalı`)
      .max(SEASONAL_MULTIPLIER_MAX, `Çarpan en fazla ${SEASONAL_MULTIPLIER_MAX} olabilir`),
    bonusPoints: z
      .number({ invalid_type_error: 'Bonus sayı olmalı' })
      .int('Bonus tam sayı olmalı')
      .min(0, 'Bonus negatif olamaz')
      .max(SEASONAL_BONUS_MAX, `Bonus en fazla ${SEASONAL_BONUS_MAX} puan olabilir`),
    imageUrl: z
      .string()
      .trim()
      .max(2000, 'Görsel adresi çok uzun')
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^https:\/\//i.test(v), 'Görsel adresi https:// ile başlamalı'),
    minLevel: z
      .number({ invalid_type_error: 'Minimum seviye sayı olmalı' })
      .int('Minimum seviye tam sayı olmalı')
      .min(1, 'Minimum seviye en az 1 olmalı')
      .max(1000, 'Minimum seviye en fazla 1000 olabilir')
      .nullable(),
    budgetPoints: z
      .number({ invalid_type_error: 'Bütçe sayı olmalı' })
      .int('Bütçe tam sayı olmalı')
      .min(SEASONAL_BUDGET_MIN, `Bütçe en az ${SEASONAL_BUDGET_MIN} puan olmalı`)
      .max(SEASONAL_BUDGET_MAX, `Bütçe en fazla ${SEASONAL_BUDGET_MAX.toLocaleString('tr-TR')} puan olabilir`)
      .nullable(),
    challenge: challengeSchema.nullable(),
    isActive: z.boolean(),
    startDate: isoInstant('Başlangıç'),
    endDate: isoInstant('Bitiş'),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: 'Bitiş başlangıçtan sonra olmalı',
    path: ['endDate'],
  })
  .refine((d) => d.multiplier > 1 || d.bonusPoints > 0 || d.challenge !== null, {
    message: 'Kampanya bir şey vermeli: 1’den büyük çarpan, bonus ya da görev',
    path: ['multiplier'],
  });
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const conceptInputSchema = z
  .object({
    name: z
      .string({ required_error: 'Ad gerekli' })
      .trim()
      .min(2, 'Ad en az 2 karakter olmalı')
      .max(120, 'Ad en fazla 120 karakter olabilir'),
    description: nullableTrimmed(2000, 'Not'),
    priority: z
      .number({ invalid_type_error: 'Öncelik sayı olmalı' })
      .int('Öncelik tam sayı olmalı')
      .min(0, 'Öncelik negatif olamaz')
      .max(1000, 'Öncelik en fazla 1000 olabilir'),
    backgroundEffect: z
      .enum(BACKGROUND_VALUES, { errorMap: () => ({ message: 'Arka plan efekti listede yok' }) })
      .nullable(),
    themePresetId: z.enum(THEME_VALUES, { errorMap: () => ({ message: 'Palet listede yok' }) }).nullable(),
    bannerText: nullableTrimmed(200, 'Banner metni'),
    bannerEmoji: nullableTrimmed(8, 'Banner emojisi'),
    isActive: z.boolean(),
    startDate: isoInstant('Başlangıç'),
    endDate: isoInstant('Bitiş'),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: 'Bitiş başlangıçtan sonra olmalı',
    path: ['endDate'],
  })
  .refine((d) => d.backgroundEffect !== null || d.themePresetId !== null || d.bannerText !== null, {
    message: 'Konsept görünür bir şey değiştirmeli: palet, arka plan ya da banner',
    path: ['bannerText'],
  });
export type ConceptInput = z.infer<typeof conceptInputSchema>;

export const KINDS = ['campaign', 'concept'] as const;
export type CalendarKind = (typeof KINDS)[number];

export const STATUSES = ['live', 'shadowed', 'exhausted', 'scheduled', 'paused', 'ended', 'archived'] as const;
export type CalendarStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<CalendarStatus, string> = {
  live: 'Canlı',
  shadowed: 'Gölgede',
  exhausted: 'Bütçe doldu',
  scheduled: 'Planlı',
  paused: 'Duraklatıldı',
  ended: 'Bitti',
  archived: 'Arşivde',
};

export const LIST_FILTERS = ['all', 'running', 'scheduled', 'paused', 'ended', 'archived'] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];
export const LIST_FILTER_LABEL: Record<ListFilter, string> = {
  all: 'Tümü',
  running: 'Yayında',
  scheduled: 'Planlı',
  paused: 'Duraklatıldı',
  ended: 'Bitti',
  archived: 'Arşiv',
};

export const calendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(14).max(180).default(90),
});

export const listQuerySchema = z.object({
  kind: z.enum(KINDS).default('campaign'),
  filter: z.enum(LIST_FILTERS).default('all'),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  size: z.coerce.number().int().min(5).max(50).default(10),
});

export const writeCampaignBody = z.object({ data: z.unknown(), baseVersion: z.string().max(80).optional() });
export const writeConceptBody = writeCampaignBody;
export const toggleBody = z.object({ isActive: z.boolean(), baseVersion: z.string().min(1).max(80) });
export const archiveBody = z.object({
  reason: z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(300, 'Gerekçe en fazla 300 karakter olabilir'),
  baseVersion: z.string().min(1).max(80),
});
export const restoreBody = z.object({ baseVersion: z.string().min(1).max(80) });
export const previewBody = z.object({
  kind: z.enum(KINDS),
  excludeId: z.string().max(64).nullable().optional(),
  data: z.unknown(),
});

// ───────────────────────────── Görünümler ─────────────────────────────

export type CampaignView = {
  kind: 'campaign';
  id: string;
  version: string;
  name: string;
  description: string;
  type: string;
  multiplier: number;
  /** Seçicinin uyguladığı (kırpılmış) değerler — canlıdaki eski kayıtlarda farklı olabilir. */
  effectiveMultiplier: number;
  effectiveBonus: number;
  bonusPoints: number;
  imageUrl: string | null;
  minLevel: number | null;
  budgetPoints: number | null;
  /** Kayıtlı `conditions` değerlendirilemiyorsa true → seçici bu kampanyayı UYGULAMAZ. */
  conditionsInvalid: boolean;
  challenge: { type: ChallengeType; goal: number; rewardPoints: number; rewardBadgeId: string | null } | null;
  /** Kayıtta tanınmayan görev türü vb. → müşteride görünmez. */
  challengeInvalid: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  archived: { at: string; reason: string } | null;
  status: CalendarStatus;
  /** Bütçeli kampanyada şimdiye dek kampanyalı kazanımlarda basılan puan (yalnız canlı/bitmiş yüklenir). */
  budgetSpent: number | null;
  targeted: boolean;
};

export type ConceptView = {
  kind: 'concept';
  id: string;
  version: string;
  name: string;
  description: string | null;
  priority: number;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  archived: { at: string; reason: string } | null;
  status: CalendarStatus;
};

export type CalendarItem = CampaignView | ConceptView;

export type ConflictSeverity = 'warning' | 'info';
export type Conflict = {
  id: string;
  kind: CalendarKind | 'cross';
  severity: ConflictSeverity;
  /** Örtüşme aralığı. */
  start: string;
  end: string;
  itemIds: string[];
  winnerId: string | null;
  message: string;
};

export type CalendarSummary = {
  now: string;
  liveCampaign: { id: string; name: string; multiplier: number; bonus: number; endsAt: string } | null;
  targetedLiveCount: number;
  liveConcept: { id: string; name: string; emoji: string | null; endsAt: string } | null;
  nextCampaign: { id: string; name: string; startsAt: string } | null;
  nextConcept: { id: string; name: string; startsAt: string } | null;
  /** Bugün (İstanbul) kampanyalı kazanımlarda basılan puan; null = ölçülemedi. */
  campaignPointsToday: number | null;
};

export type CalendarData = {
  window: { from: string; to: string; days: number };
  campaigns: CampaignView[];
  concepts: ConceptView[];
  conflicts: Conflict[];
  summary: CalendarSummary;
  caps: typeof CAMPAIGN_CAPS;
};

export type ListPage<T> = { items: T[]; total: number; page: number; size: number };

export type HistoryEntry = {
  id: string;
  action: string;
  label: string;
  at: string;
  actor: string | null;
  changedFields: string[];
  reason: string | null;
};

export type CampaignImpact = {
  /** Kampanyanın uygulandığı kazanımlarda basılan toplam puan (taban dahil). */
  points: number;
  events: number;
  users: number;
  bySource: Array<{ source: string; points: number; events: number }>;
  challenge: { claims: number; points: number } | null;
};

export type CampaignDetail = {
  item: CampaignView;
  impact: CampaignImpact;
  badge: { id: string; name: string; icon: string } | null;
  history: HistoryEntry[];
  conflicts: Conflict[];
};

export type ConceptDetail = {
  item: ConceptView;
  history: HistoryEntry[];
  conflicts: Conflict[];
};

export type PreviewResult = {
  /** Taslak şemadan geçmediyse false (önizleme hesaplanmaz; alan hataları kaydetmede döner). */
  valid: boolean;
  conflicts: Conflict[];
  /** Yalnız kampanya taslağında; son 7 günün gerçek defter verisiyle kaba tahmin. */
  estimate: {
    baselineDailyPoints: number;
    baselineDailyEvents: number;
    extraPerDay: number;
    windowDays: number;
    extraTotal: number;
    budgetDays: number | null;
    note: string;
  } | null;
  /** Taslak şu an canlı olsaydı kazanır mıydı (yalnız pencere şimdiyi kapsıyorsa). */
  wouldWinNow: boolean | null;
};

// ───────────────────────────── Ham satır → görünüm ─────────────────────────────

export type RawCampaign = {
  id: string;
  name: string;
  description: string;
  type: string;
  multiplier: number;
  bonusPoints: number;
  imageUrl: string | null;
  conditions: unknown;
  challengeType: string | null;
  challengeGoal: number | null;
  challengeRewardPoints: number | null;
  challengeRewardBadgeId: string | null;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  discount?: number | null;
};

export type RawConcept = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ArchiveEntry = { at: string; reason: string; by: string | null };
export type ArchiveMap = { campaigns: Record<string, ArchiveEntry>; concepts: Record<string, ArchiveEntry> };
export const EMPTY_ARCHIVE: ArchiveMap = { campaigns: {}, concepts: {} };

export function parseArchiveMap(raw: unknown): ArchiveMap {
  const out: ArchiveMap = { campaigns: {}, concepts: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of ['campaigns', 'concepts'] as const) {
    const bucket = (raw as Record<string, unknown>)[k];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
    for (const [id, v] of Object.entries(bucket as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const e = v as Record<string, unknown>;
      if (typeof e.at !== 'string') continue;
      out[k][id] = {
        at: e.at,
        reason: typeof e.reason === 'string' ? e.reason : '',
        by: typeof e.by === 'string' ? e.by : null,
      };
    }
  }
  return out;
}

function readConditions(raw: unknown): { minLevel: number | null; budgetPoints: number | null; invalid: boolean } {
  if (raw === null || raw === undefined) return { minLevel: null, budgetPoints: null, invalid: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { minLevel: null, budgetPoints: null, invalid: true };
  const o = raw as Record<string, unknown>;
  const known = new Set(['minLevel', 'budgetPoints']);
  const invalid = Object.keys(o).some((k) => !known.has(k));
  return {
    minLevel: typeof o.minLevel === 'number' ? o.minLevel : null,
    budgetPoints: typeof o.budgetPoints === 'number' ? o.budgetPoints : null,
    invalid,
  };
}

/** Kampanya kaydının içerik sürümü (SeasonalCampaign'de updatedAt yok → içerik özeti). */
export function campaignVersionPayload(c: RawCampaign): Record<string, unknown> {
  return {
    name: c.name,
    description: c.description,
    type: c.type,
    multiplier: c.multiplier,
    bonusPoints: c.bonusPoints,
    imageUrl: c.imageUrl,
    conditions: c.conditions ?? null,
    challengeType: c.challengeType,
    challengeGoal: c.challengeGoal,
    challengeRewardPoints: c.challengeRewardPoints,
    challengeRewardBadgeId: c.challengeRewardBadgeId,
    isActive: c.isActive,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  };
}

export function toCampaignView(
  c: RawCampaign,
  version: string,
  archive: ArchiveEntry | null,
  budgetSpent: number | null = null
): Omit<CampaignView, 'status'> {
  const cond = readConditions(c.conditions);
  const ct = c.challengeType;
  const validChallenge =
    (ct === 'games_played' || ct === 'reviews_written') && typeof c.challengeGoal === 'number' && c.challengeGoal > 0;
  return {
    kind: 'campaign',
    id: c.id,
    version,
    name: c.name,
    description: c.description,
    type: c.type,
    multiplier: c.multiplier,
    bonusPoints: c.bonusPoints,
    effectiveMultiplier: clampSeasonalMultiplier(c.multiplier),
    effectiveBonus: clampSeasonalBonus(c.bonusPoints),
    imageUrl: c.imageUrl,
    minLevel: cond.minLevel,
    budgetPoints: cond.budgetPoints,
    conditionsInvalid: cond.invalid,
    challenge: validChallenge
      ? {
          type: ct as ChallengeType,
          goal: c.challengeGoal as number,
          rewardPoints: Math.max(0, c.challengeRewardPoints ?? 0),
          rewardBadgeId: c.challengeRewardBadgeId,
        }
      : null,
    challengeInvalid: ct !== null && !validChallenge,
    isActive: c.isActive,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    createdAt: c.createdAt.toISOString(),
    archived: archive ? { at: archive.at, reason: archive.reason } : null,
    budgetSpent,
    targeted: TARGETED_CAMPAIGN_TYPES.has(c.type) || cond.minLevel !== null,
  };
}

export function toConceptView(c: RawConcept, archive: ArchiveEntry | null): Omit<ConceptView, 'status'> {
  return {
    kind: 'concept',
    id: c.id,
    version: c.updatedAt.toISOString(),
    name: c.name,
    description: c.description,
    priority: c.priority,
    backgroundEffect: c.backgroundEffect,
    themePresetId: c.themePresetId,
    bannerText: c.bannerText,
    bannerEmoji: c.bannerEmoji,
    isActive: c.isActive,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    createdAt: c.createdAt.toISOString(),
    archived: archive ? { at: archive.at, reason: archive.reason } : null,
  };
}

// ───────────────────────────── Durum + kazanan ─────────────────────────────

type Win = { id: string; startDate: string; endDate: string; isActive: boolean; archived: unknown };

function covers(i: Win, t: number): boolean {
  return new Date(i.startDate).getTime() <= t && t <= new Date(i.endDate).getTime();
}

/** Seçicinin kampanya karşılaştırması: büyük (kırpılmış) çarpan, eşitse büyük bonus. */
export function campaignBeats(
  a: { effectiveMultiplier: number; effectiveBonus: number },
  b: { effectiveMultiplier: number; effectiveBonus: number }
): boolean {
  return a.effectiveMultiplier > b.effectiveMultiplier || (a.effectiveMultiplier === b.effectiveMultiplier && a.effectiveBonus > b.effectiveBonus);
}

/** Konsept seçicisi: öncelik büyük, eşitse daha geç başlayan. */
export function conceptBeats(a: { priority: number; startDate: string }, b: { priority: number; startDate: string }): boolean {
  if (a.priority !== b.priority) return a.priority > b.priority;
  return new Date(a.startDate).getTime() > new Date(b.startDate).getTime();
}

function campaignApplies(c: Omit<CampaignView, 'status'>): boolean {
  return (
    !c.conditionsInvalid &&
    !(c.budgetPoints !== null && c.budgetSpent !== null && c.budgetSpent >= c.budgetPoints) &&
    (c.effectiveMultiplier > 1 || c.effectiveBonus > 0)
  );
}

/**
 * Herkese açık (hedefsiz) kampanyalar arasında `t` anındaki kazanan. Hedefli kampanyalar
 * yalnız ilgili kullanıcıda yarışır; herkese açık kazananı belirlemez.
 */
export function campaignWinnerAt(items: ReadonlyArray<Omit<CampaignView, 'status'>>, t: number) {
  let best: Omit<CampaignView, 'status'> | null = null;
  for (const c of items) {
    if (c.archived || !c.isActive || c.targeted || !covers(c, t) || !campaignApplies(c)) continue;
    if (!best || campaignBeats(c, best)) best = c;
  }
  return best;
}

export function conceptWinnerAt(items: ReadonlyArray<Omit<ConceptView, 'status'>>, t: number) {
  let best: Omit<ConceptView, 'status'> | null = null;
  for (const c of items) {
    if (c.archived || !c.isActive || !covers(c, t)) continue;
    if (!best || conceptBeats(c, best)) best = c;
  }
  return best;
}

export function withCampaignStatus(items: ReadonlyArray<Omit<CampaignView, 'status'>>, now: Date): CampaignView[] {
  const t = now.getTime();
  const winner = campaignWinnerAt(items, t);
  return items.map((c) => {
    let status: CalendarStatus;
    if (c.archived) status = 'archived';
    else if (new Date(c.endDate).getTime() < t) status = 'ended';
    else if (!c.isActive) status = 'paused';
    else if (new Date(c.startDate).getTime() > t) status = 'scheduled';
    else if (c.budgetPoints !== null && c.budgetSpent !== null && c.budgetSpent >= c.budgetPoints) status = 'exhausted';
    else if (c.targeted) status = c.conditionsInvalid ? 'shadowed' : 'live';
    else status = winner && winner.id === c.id ? 'live' : 'shadowed';
    return { ...c, status };
  });
}

export function withConceptStatus(items: ReadonlyArray<Omit<ConceptView, 'status'>>, now: Date): ConceptView[] {
  const t = now.getTime();
  const winner = conceptWinnerAt(items, t);
  return items.map((c) => {
    let status: CalendarStatus;
    if (c.archived) status = 'archived';
    else if (new Date(c.endDate).getTime() < t) status = 'ended';
    else if (!c.isActive) status = 'paused';
    else if (new Date(c.startDate).getTime() > t) status = 'scheduled';
    else status = winner && winner.id === c.id ? 'live' : 'shadowed';
    return { ...c, status };
  });
}

// ───────────────────────────── Çakışmalar ─────────────────────────────

function overlap(a: Win, b: Win): { start: number; end: number } | null {
  const start = Math.max(new Date(a.startDate).getTime(), new Date(b.startDate).getTime());
  const end = Math.min(new Date(a.endDate).getTime(), new Date(b.endDate).getTime());
  return end > start ? { start, end } : null;
}

const PROMISE_RE = /(puan|bonus|çarpan|kat\b|\b\d+\s*[x×]|[x×]\s*\d+)/i;

/** Banner metni puan vaat ediyor mu? (ekonomi katmanıyla tutarlılık uyarısı için) */
export function bannerPromisesPoints(text: string | null | undefined): boolean {
  return !!text && PROMISE_RE.test(text);
}

/**
 * Çakışma analizi. Yalnız etkin (arşivsiz, isActive, bitmemiş) kayıtlar değerlendirilir.
 *  - Kampanya × kampanya (ikisi de herkese açık): kaybedenin çarpanı/bonusu o aralıkta HİÇ
 *    uygulanmaz (seçici tek kampanya uygular) → uyarı.
 *  - Hedefli × herkese açık: hedef kitlede yalnız büyük olan uygulanır → bilgi.
 *  - Konsept × konsept: düşük öncelikli o aralıkta görünmez → uyarı.
 *  - Çapraz: banner puan vaat ediyor ama o pencerede herkese açık kampanya yok → uyarı.
 */
export function detectConflicts(
  campaigns: ReadonlyArray<Omit<CampaignView, 'status'>>,
  concepts: ReadonlyArray<Omit<ConceptView, 'status'>>,
  now: Date
): Conflict[] {
  const t = now.getTime();
  const relevant = <T extends Win>(x: T) => !x.archived && x.isActive && new Date(x.endDate).getTime() >= t;
  const cs = campaigns.filter(relevant);
  const ks = concepts.filter(relevant);
  const out: Conflict[] = [];

  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      const ov = overlap(a, b);
      if (!ov) continue;
      const [w, l] = campaignBeats(b, a) ? [b, a] : [a, b];
      const both = !a.targeted && !b.targeted;
      const lostWhat =
        l.effectiveBonus > 0 && l.effectiveMultiplier <= w.effectiveMultiplier
          ? `${l.name} kampanyasının ${l.effectiveBonus} puanlık bonusu`
          : `${l.name} kampanyası`;
      out.push({
        id: `cc:${a.id}:${b.id}`,
        kind: 'campaign',
        severity: both ? 'warning' : 'info',
        start: new Date(ov.start).toISOString(),
        end: new Date(ov.end).toISOString(),
        itemIds: [a.id, b.id],
        winnerId: w.id,
        message: both
          ? `${a.name} ile ${b.name} örtüşüyor. Aynı anda tek kampanya uygulanır: ${w.name} kazanır, ${lostWhat} bu aralıkta uygulanmaz.`
          : `${a.name} ile ${b.name} örtüşüyor. Hedef kitledeki müşteriye yalnız büyük olan (${w.name}) uygulanır.`,
      });
    }
  }

  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i];
      const b = ks[j];
      const ov = overlap(a, b);
      if (!ov) continue;
      const [w, l] = conceptBeats(b, a) ? [b, a] : [a, b];
      out.push({
        id: `kk:${a.id}:${b.id}`,
        kind: 'concept',
        severity: 'warning',
        start: new Date(ov.start).toISOString(),
        end: new Date(ov.end).toISOString(),
        itemIds: [a.id, b.id],
        winnerId: w.id,
        message: `${a.name} ile ${b.name} örtüşüyor. ${w.name} görünür (öncelik ${w.priority}${
          w.priority === l.priority ? ', daha geç başlıyor' : ` > ${l.priority}`
        }); ${l.name} bu aralıkta kullanıcıya hiç görünmez.`,
      });
    }
  }

  for (const k of ks) {
    if (!bannerPromisesPoints(k.bannerText)) continue;
    const backed = cs.some((c) => !c.targeted && campaignApplies(c) && overlap(c, k));
    if (!backed) {
      out.push({
        id: `x:${k.id}`,
        kind: 'cross',
        severity: 'warning',
        start: k.startDate,
        end: k.endDate,
        itemIds: [k.id],
        winnerId: null,
        message: `${k.name} banner’ı puan vaat ediyor ama bu pencerede herkese açık bir ekonomi kampanyası yok. Kampanya ekleyin ya da metni değiştirin.`,
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? a.start.localeCompare(b.start) : a.severity === 'warning' ? -1 : 1));
}

// ───────────────────────────── Tahmin ─────────────────────────────

/**
 * Kampanya taslağının kaba ek puan tahmini. Taban: son 7 günde kampanyanın uygulanacağı
 * kazanım yollarında (geri bildirim + tüketim pasif puanı) basılan puan ve olay sayısı.
 * Ek = taban × (çarpan − 1) + olay × bonus. Hedefli kampanyada gerçek etki çok daha küçüktür.
 */
export function estimateCampaignExtra(input: {
  baselineWeekPoints: number;
  baselineWeekEvents: number;
  multiplier: number;
  bonus: number;
  windowMs: number;
  budgetPoints: number | null;
  targeted: boolean;
}): NonNullable<PreviewResult['estimate']> {
  const dailyPts = Math.max(0, input.baselineWeekPoints) / 7;
  const dailyEv = Math.max(0, input.baselineWeekEvents) / 7;
  const m = clampSeasonalMultiplier(input.multiplier);
  const b = clampSeasonalBonus(input.bonus);
  const extraPerDay = Math.round(dailyPts * (m - 1) + dailyEv * b);
  const windowDays = Math.max(0, input.windowMs / 86_400_000);
  const extraTotal = Math.round(extraPerDay * windowDays);
  // Bütçe, kampanyalı kazanımlarda basılan TOPLAM puanı sayar (taban dahil).
  const spendPerDay = dailyPts * m + dailyEv * b;
  const budgetDays = input.budgetPoints !== null && spendPerDay > 0 ? Math.round((input.budgetPoints / spendPerDay) * 10) / 10 : null;
  return {
    baselineDailyPoints: Math.round(dailyPts),
    baselineDailyEvents: Math.round(dailyEv),
    extraPerDay,
    windowDays: Math.round(windowDays * 10) / 10,
    extraTotal,
    budgetDays,
    note: input.targeted
      ? 'Hedefli kampanya: yalnız hedef kitledeki müşteriler etkilenir, gerçek etki bu üst sınırın çok altındadır.'
      : 'Son 7 günün gerçek defter verisiyle kaba tahmin. Günlük tavanlar gerçek basımı düşürebilir.',
  };
}

// ───────────────────────────── Zaman çizelgesi geometrisi ─────────────────────────────

/** Bir aralığı pencere içinde yüzde konum/genişliğe çevirir (kırpılmış). Görünmüyorsa null. */
export function barGeometry(
  start: string,
  end: string,
  windowFrom: number,
  windowTo: number
): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (e < windowFrom || s > windowTo || windowTo <= windowFrom) return null;
  const span = windowTo - windowFrom;
  const cs = Math.max(s, windowFrom);
  const ce = Math.min(e, windowTo);
  const left = ((cs - windowFrom) / span) * 100;
  const width = Math.max(0.6, ((ce - cs) / span) * 100);
  return { left, width: Math.min(width, 100 - left), clippedStart: s < windowFrom, clippedEnd: e > windowTo };
}

/** Çakışmayan şeritlere yerleştirme (aynı şeritte örtüşen bar olmaz). */
export function assignLanes<T extends { id: string; startDate: string; endDate: string }>(items: readonly T[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const it of sorted) {
    const s = new Date(it.startDate).getTime();
    let lane = laneEnds.findIndex((end) => end < s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = new Date(it.endDate).getTime();
    lanes.set(it.id, lane);
  }
  return lanes;
}

// ───────────────────────────── Denetim etiketi ─────────────────────────────

export const HISTORY_LABEL: Record<string, string> = {
  CREATE_SEASONAL_CAMPAIGN: 'Oluşturuldu',
  UPDATE_SEASONAL_CAMPAIGN: 'Düzenlendi',
  SEASONAL_CAMPAIGN_ARCHIVE: 'Arşivlendi',
  SEASONAL_CAMPAIGN_RESTORE: 'Arşivden çıkarıldı',
  SEASONAL_CONCEPT_CREATE: 'Oluşturuldu',
  SEASONAL_CONCEPT_UPDATE: 'Düzenlendi',
  SEASONAL_CONCEPT_DELETE: 'Silindi (eski)',
  SEASONAL_CONCEPT_ARCHIVE: 'Arşivlendi',
  SEASONAL_CONCEPT_RESTORE: 'Arşivden çıkarıldı',
};

export const FIELD_LABEL: Record<string, string> = {
  name: 'Ad',
  description: 'Açıklama',
  type: 'Tür',
  multiplier: 'Çarpan',
  bonusPoints: 'Bonus',
  imageUrl: 'Görsel',
  conditions: 'Hedef/bütçe',
  challengeType: 'Görev türü',
  challengeGoal: 'Görev hedefi',
  challengeRewardPoints: 'Görev ödülü',
  challengeRewardBadgeId: 'Görev rozeti',
  isActive: 'Durum',
  startDate: 'Başlangıç',
  endDate: 'Bitiş',
  priority: 'Öncelik',
  backgroundEffect: 'Arka plan',
  themePresetId: 'Palet',
  bannerText: 'Banner metni',
  bannerEmoji: 'Banner emojisi',
};

/** Eski rotadan gelen sorgu parametrelerini koruyarak hedef URL. */
export function legacyCalendarTarget(
  layer: 'campaign' | 'concept',
  sp: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'layer') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (typeof v === 'string') params.append(k, v);
  }
  params.set('layer', layer);
  return `/admin/campaigns-calendar?${params.toString()}`;
}
