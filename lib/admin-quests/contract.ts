/**
 * Admin → Görev Yönetimi (/admin/quests) sözleşmesi — sunucu (lib/admin-quests/server.ts) ile
 * istemci (components/admin/a-gorevler) arasında PAYLAŞILAN saf modül (Prisma/Node yok).
 *
 * Kararlar (docs/audit/2026-10-08/admin/admin_quests.md):
 *  - Tür = DÖNEM (cadence): günlük/haftalık/aylık/tek seferlik — lib/quests/period.ts'in gerçekten
 *    uyguladığı dört dönem. "Aylık" artık motorlu (Bulgu 3).
 *  - Mekanik yalnız MOTORU OLANLARDAN seçilir (Bulgu 4): canlı sayılanlar (lib/quests/mechanics.ts),
 *    otomatik ödenen ziyaret görevi (lib/visit-missions.ts) ve "Yönetici onaylı" (custom): admin
 *    kullanıcı bazında tamamlandı işaretler, müşteri ödülü claim motorundan (lib/economy) alır.
 *  - Durum şemadan TÜRETİLİR (isActive/archivedAt/expiresAt): aktif · duraklatıldı · süresi doldu ·
 *    arşiv. Silme yok, arşiv var (Bulgu 6).
 *  - Bitiş anı Europe/Istanbul duvar saatiyle girilir; sunucuya mutlak ISO gider (Bulgu 11).
 */
import { z } from 'zod';
import type { QuestMechanic, QuestTracking } from '@/lib/quests/mechanics';
import { istanbulMidnight } from '@/lib/quests/period';

export type { QuestMechanic, QuestTracking };

// ───────────────────────────── Dönem (tür) ─────────────────────────────

export const QUEST_CADENCES = ['daily', 'weekly', 'monthly', 'special'] as const;
export type QuestCadence = (typeof QUEST_CADENCES)[number];

export const CADENCE_LABEL: Readonly<Record<QuestCadence, string>> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  special: 'Tek seferlik',
};

export const CADENCE_HINT: Readonly<Record<QuestCadence, string>> = {
  daily: 'Her gün İstanbul saatiyle 00:00’da sıfırlanır; ödül günde bir kez alınır.',
  weekly: 'Her pazartesi 00:00’da sıfırlanır; ödül haftada bir kez alınır.',
  monthly: 'Her ayın ilk günü 00:00’da sıfırlanır; ödül ayda bir kez alınır.',
  special: 'Bir kez tamamlanır, ödül bir kez alınır.',
};

/** Eski veride `DAILY`/`SPECIAL`/`mystery` de var → bilinmeyen her değer tek seferlik sayılır (motorla aynı). */
export function normalizeCadence(raw: unknown): QuestCadence {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'daily' || v === 'weekly' || v === 'monthly' ? v : 'special';
}

// ───────────────────────────── Mekanik ─────────────────────────────

/** Formdan oluşturulabilen mekanikler (hepsinin ilerletici motoru var). */
export const CREATABLE_MECHANICS = [
  'give_feedback',
  'feedback_with_photo',
  'detailed_feedback',
  'visit_businesses',
  'referral',
  'visit_category',
  'custom',
] as const;
export type CreatableMechanic = (typeof CREATABLE_MECHANICS)[number];

export interface MechanicMeta {
  label: string;
  /** Hedef birimi ("geri bildirim", "işletme"…). */
  unit: string;
  description: string;
  tracking: QuestTracking;
  /** Ödül tamamlanınca otomatik mi verilir (claim yok)? */
  autoReward: boolean;
  /** Dönemi zorunlu tek seferlik mi? */
  onceOnly: boolean;
}

export const MECHANIC_META: Readonly<Record<QuestMechanic, MechanicMeta>> = {
  give_feedback: {
    label: 'Geri bildirim ver',
    unit: 'geri bildirim',
    description: 'QR geri bildirimi ve tüketim yorumları sayılır (silinen/moderasyonla kaldırılan sayılmaz).',
    tracking: 'live',
    autoReward: false,
    onceOnly: false,
  },
  feedback_with_photo: {
    label: 'Fotoğraflı geri bildirim',
    unit: 'fotoğraflı geri bildirim',
    description: 'En az bir fotoğraf/medya içeren QR geri bildirimleri sayılır.',
    tracking: 'live',
    autoReward: false,
    onceOnly: false,
  },
  detailed_feedback: {
    label: 'Ayrıntılı yorum',
    unit: 'ayrıntılı yorum',
    description: 'Belirlenen karakter sayısını aşan geri bildirim ve yorumlar sayılır.',
    tracking: 'live',
    autoReward: false,
    onceOnly: false,
  },
  visit_businesses: {
    label: 'Farklı işletme ziyareti',
    unit: 'farklı işletme',
    description: 'Dönem içinde geri bildirim ya da tüketim kaydı olan farklı işletmeler sayılır.',
    tracking: 'live',
    autoReward: false,
    onceOnly: false,
  },
  referral: {
    label: 'Arkadaş daveti',
    unit: 'tamamlanmış davet',
    description: 'Yalnız tamamlanmış davetler sayılır (davet edilen ilk gerçek etkileşimini yaptığında).',
    tracking: 'live',
    autoReward: false,
    onceOnly: false,
  },
  visit_category: {
    label: 'Kategoride ziyaret (otomatik ödül)',
    unit: 'farklı işletme',
    description:
      'Bayi tüketim kaydettiğinde ilerler; hedefe ulaşınca ödül otomatik verilir. Kategori boşsa her işletme sayılır. Yalnız tek seferlik olabilir.',
    tracking: 'stored',
    autoReward: true,
    onceOnly: true,
  },
  custom: {
    label: 'Yönetici onaylı',
    unit: 'onay',
    description:
      'Otomatik ilerlemez: kullanıcıyı bu panelden “tamamlandı” işaretlersiniz, müşteri ödülü Görevler sayfasından alır. İşaretlenmeyen kullanıcıya görünmez.',
    tracking: 'manual',
    autoReward: false,
    onceOnly: false,
  },
  achievement: {
    label: 'Başarım (sistem)',
    unit: 'adım',
    description: 'Kozmetik, hediye ve vitrin işlemleriyle sistem tarafından ilerletilir; tamamlanınca ödül otomatik verilir.',
    tracking: 'stored',
    autoReward: true,
    onceOnly: true,
  },
};

export function isCreatableMechanic(v: unknown): v is CreatableMechanic {
  return typeof v === 'string' && (CREATABLE_MECHANICS as readonly string[]).includes(v);
}

export const DETAILED_MIN_LENGTH_DEFAULT = 100;

// ───────────────────────────── Durum ─────────────────────────────

export const QUEST_STATUSES = ['active', 'paused', 'expired', 'archived'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];
export const QUEST_STATUS_FILTERS = [...QUEST_STATUSES, 'all'] as const;
export type QuestStatusFilter = (typeof QUEST_STATUS_FILTERS)[number];

export const STATUS_LABEL: Readonly<Record<QuestStatus, string>> = {
  active: 'Yayında',
  paused: 'Duraklatıldı',
  expired: 'Süresi doldu',
  archived: 'Arşivde',
};

export function deriveQuestStatus(
  q: { isActive: boolean; archivedAt: Date | string | null; expiresAt: Date | string | null },
  now: Date = new Date()
): QuestStatus {
  if (q.archivedAt) return 'archived';
  if (q.expiresAt && new Date(q.expiresAt).getTime() <= now.getTime()) return 'expired';
  return q.isActive ? 'active' : 'paused';
}

// ───────────────────────────── Ödül sınırları ─────────────────────────────

/** Tek görev ödülü üst sınırı (lib/economy MAX_SINGLE_MINT ile uyumlu, ürün için bilinçli olarak düşük). */
export const QUEST_MAX_POINTS = 10_000;
export const QUEST_MAX_XP = 20_000;
/** Matris varsayılanının bu katını aşan ödül önizlemede uyarı alır. */
export const REWARD_WARN_MULTIPLIER = 5;

// ───────────────────────────── İstanbul duvar saati ─────────────────────────────

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:mm` (İstanbul) → ISO. Geçersiz → null. */
export function istanbulWallToIso(wall: string): string | null {
  const m = WALL_RE.exec(wall.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const at = new Date(istanbulMidnight(y, mo, d).getTime() + (h * 60 + mi) * 60_000);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

let wallFmt: Intl.DateTimeFormat | null = null;
/** ISO → `YYYY-MM-DDTHH:mm` (İstanbul) — `<input type="datetime-local">` değeri. */
export function isoToIstanbulWall(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  wallFmt ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of wallFmt.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

// ───────────────────────────── Girdi şemaları ─────────────────────────────

const name = z.string().trim().min(2, 'Görev adı en az 2 karakter olmalı').max(50, 'Görev adı en fazla 50 karakter olabilir');
const description = z
  .string()
  .trim()
  .min(5, 'Açıklama en az 5 karakter olmalı')
  .max(200, 'Açıklama en fazla 200 karakter olabilir');
const icon = z.string().trim().min(1, 'Bir simge seçin').max(16, 'Simge en fazla 16 karakter olabilir');
const target = z.number({ invalid_type_error: 'Hedef girin' }).int('Hedef tam sayı olmalı').min(1, 'Hedef en az 1 olmalı').max(10_000, 'Hedef en fazla 10.000 olabilir');
const points = z.number({ invalid_type_error: 'Puan girin' }).int('Puan tam sayı olmalı').min(0, 'Puan negatif olamaz').max(QUEST_MAX_POINTS, `Puan en fazla ${QUEST_MAX_POINTS.toLocaleString('tr-TR')} olabilir`);
const xp = z.number({ invalid_type_error: 'XP girin' }).int('XP tam sayı olmalı').min(0, 'XP negatif olamaz').max(QUEST_MAX_XP, `XP en fazla ${QUEST_MAX_XP.toLocaleString('tr-TR')} olabilir`);
const category = z.string().trim().max(60, 'Kategori en fazla 60 karakter olabilir').nullable().optional();
const minLength = z.number().int().min(20, 'En az 20 karakter').max(2000, 'En fazla 2000 karakter').nullable().optional();
const isoDate = z.string().datetime({ offset: true, message: 'Geçersiz tarih' });

type RuleInput = {
  mechanic?: CreatableMechanic | QuestMechanic;
  cadence?: QuestCadence;
  points?: number;
  xp?: number;
};

/** Çapraz alan kuralları (form ve API aynı). */
export function questCrossRules(v: RuleInput, ctx: z.RefinementCtx) {
  if (v.mechanic && v.cadence && MECHANIC_META[v.mechanic]?.onceOnly && v.cadence !== 'special') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cadence'], message: 'Bu mekanik yalnız tek seferlik olabilir (ödül otomatik verilir, sayaç sıfırlanmaz).' });
  }
  if (typeof v.points === 'number' && typeof v.xp === 'number' && v.points === 0 && v.xp === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['points'], message: 'Ödülsüz görev olmaz: puan ya da XP girin.' });
  }
}

const questBase = z.object({
  name,
  description,
  icon,
  cadence: z.enum(QUEST_CADENCES, { errorMap: () => ({ message: 'Dönem seçin' }) }),
  mechanic: z.enum(CREATABLE_MECHANICS, { errorMap: () => ({ message: 'Mekanik seçin' }) }),
  target,
  category,
  minLength,
  points,
  xp,
  expiresAt: isoDate.nullable(),
});

export const questCreateSchema = questBase
  .extend({ publish: z.boolean().default(false) })
  .superRefine(questCrossRules);
export type QuestCreateInput = z.infer<typeof questCreateSchema>;

export const questUpdateSchema = questBase
  .partial()
  .extend({
    /** İyimser eşzamanlılık: düzenlemenin başladığı sürüm (Quest.updatedAt). */
    baseUpdatedAt: isoDate,
  })
  .superRefine(questCrossRules);
export type QuestUpdateInput = z.infer<typeof questUpdateSchema>;

export const questIdParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const reason = z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(300, 'Gerekçe en fazla 300 karakter olabilir');

export const questActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause'), reason: reason.optional() }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('archive'), reason }),
  z.object({ action: z.literal('restore') }),
  z.object({ action: z.literal('duplicate') }),
  z.object({
    action: z.literal('manual_complete'),
    /** E-posta ya da kullanıcı kimliği. */
    user: z.string().trim().min(3, 'E-posta ya da kullanıcı kimliği girin').max(200),
    reason,
  }),
]);
export type QuestActionInput = z.infer<typeof questActionSchema>;
export type QuestActionName = QuestActionInput['action'];

// ───────────────────────────── Form (istemci) ─────────────────────────────

/** Editör formu: bitiş anı İstanbul duvar saati metni olarak tutulur. */
export const questFormSchema = z
  .object({
    name,
    description,
    icon,
    cadence: z.enum(QUEST_CADENCES, { errorMap: () => ({ message: 'Dönem seçin' }) }),
    mechanic: z.enum([...CREATABLE_MECHANICS, 'achievement'] as const, { errorMap: () => ({ message: 'Mekanik seçin' }) }),
    target,
    category: z.string().trim().max(60, 'Kategori en fazla 60 karakter olabilir'),
    minLength: z.number().int().min(20, 'En az 20 karakter').max(2000, 'En fazla 2000 karakter').nullable(),
    points,
    xp,
    hasExpiry: z.boolean(),
    expiresWall: z.string(),
    publish: z.boolean(),
  })
  .superRefine((v, ctx) => {
    questCrossRules(v, ctx);
    if (v.hasExpiry && !istanbulWallToIso(v.expiresWall)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresWall'], message: 'Bitiş tarihi ve saatini seçin' });
    }
    if (v.mechanic === 'detailed_feedback' && v.minLength == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minLength'], message: 'En az karakter sayısını girin' });
    }
  });
export type QuestFormValues = z.infer<typeof questFormSchema>;

export function formToCreateInput(v: QuestFormValues): QuestCreateInput {
  const mechanic = v.mechanic === 'achievement' ? 'custom' : v.mechanic;
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    icon: v.icon.trim(),
    cadence: v.cadence,
    mechanic,
    target: v.target,
    category: mechanic === 'visit_category' && v.category.trim() ? v.category.trim() : null,
    minLength: mechanic === 'detailed_feedback' ? v.minLength : null,
    points: v.points,
    xp: v.xp,
    expiresAt: v.hasExpiry ? istanbulWallToIso(v.expiresWall) : null,
    publish: v.publish,
  };
}

// ───────────────────────────── Liste sorgusu ─────────────────────────────

export const QUEST_PAGE_SIZE = 20;
export const QUEST_SORT_IDS = ['createdAt', 'name', 'expiresAt', 'updatedAt'] as const;
export const QUEST_DEFAULT_SORT = 'createdAt.desc';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))
    .catch(undefined);

export const questListQuerySchema = z.object({
  q: optionalTrimmed(80),
  status: z.enum(QUEST_STATUS_FILTERS).catch('active').default('active'),
  mechanic: z.enum([...CREATABLE_MECHANICS, 'achievement'] as const).optional().catch(undefined),
  cadence: z.enum(QUEST_CADENCES).optional().catch(undefined),
  sort: z
    .string()
    .regex(/^(createdAt|name|expiresAt|updatedAt)\.(asc|desc)$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(10).max(100).catch(QUEST_PAGE_SIZE),
});
export type QuestListQuery = z.infer<typeof questListQuerySchema>;

export function queryString(p: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

// ───────────────────────────── DTO'lar ─────────────────────────────

export type QuestWarningCode =
  /** Yönetici onaylı görev: kimse işaretlenmedikçe müşteriye görünmez. */
  | 'manual_only'
  /** Ziyaret görevinin kategorisi hiçbir işletmeyle eşleşmiyor → tamamlanamaz. */
  | 'category_no_match'
  /** Kayıttaki mekanik motorun tanımadığı bir değer (eski veri). */
  | 'unknown_mechanic'
  /** Görev yayında ama 3 günden az kaldı. */
  | 'expiring_soon';

export const WARNING_LABEL: Readonly<Record<QuestWarningCode, string>> = {
  manual_only: 'Yalnız yönetici onayıyla ilerler',
  category_no_match: 'Kategori hiçbir işletmeyle eşleşmiyor',
  unknown_mechanic: 'Mekaniği tanınmıyor — tamamlanamaz',
  expiring_soon: '3 günden az kaldı',
};

export interface QuestMetrics {
  /** İlerleme satırı olan kullanıcı. Canlı mekaniklerde satır ilk ödül alımında açılır. */
  participants: number;
  completed: number;
  /** En az bir kez ödül alan kullanıcı. */
  rewardedUsers: number;
  /** Son 30 günde defterdeki ödeme sayısı / basılan puan / XP (lib/economy PointsLedger). */
  payouts30d: number;
  points30d: number;
  xp30d: number;
  lastPayoutAt: string | null;
}

export interface QuestListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  cadence: QuestCadence;
  rawType: string;
  mechanic: QuestMechanic;
  rawMechanic: string;
  tracking: QuestTracking;
  autoReward: boolean;
  target: number;
  category: string | null;
  minLength: number | null;
  reward: { points: number; xp: number };
  status: QuestStatus;
  isActive: boolean;
  expiresAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isAchievement: boolean;
  /** Kategori eşleşen işletme sayısı (yalnız visit_category + kategori). */
  categoryDealers: number | null;
  warnings: QuestWarningCode[];
  metrics: QuestMetrics;
}

export interface QuestListPage {
  items: QuestListItem[];
  total: number;
  page: number;
  size: number;
  counts: Record<QuestStatus, number>;
  generatedAt: string;
}

export interface QuestStats {
  counts: Record<QuestStatus, number> & { all: number };
  rewards7d: { payouts: number; points: number; xp: number };
  rewards30d: { payouts: number; points: number; xp: number };
  /** Son 14 gün (İstanbul günleri, eskiden yeniye) basılan görev puanı. */
  dailyPoints14d: number[];
  /** Yayında olup dikkat gerektiren görev sayısı (uyarısı olan). */
  needsAttention: number;
  /** `quests` modülü müşterilere açık mı? */
  moduleEnabled: boolean;
  /** Puan matrisi görev varsayılanı (Puan Matrisi sayfasından). */
  rewardDefault: { points: number; xp: number };
  missingAchievements: number;
  generatedAt: string;
}

export interface QuestOptions {
  categories: Array<{ value: string; dealers: number }>;
  rewardDefault: { points: number; xp: number };
}

export interface QuestRecentRow {
  userId: string;
  name: string | null;
  email: string | null;
  progress: number;
  completedAt: string | null;
  rewardedAt: string | null;
}

export interface QuestAuditRow {
  id: string;
  action: string;
  at: string;
  actorName: string | null;
  reason: string | null;
  changes: string[];
}

export interface QuestDetail {
  quest: QuestListItem;
  recent: QuestRecentRow[];
  audit: QuestAuditRow[];
  /** Son 14 gün günlük ödeme sayısı (eskiden yeniye). */
  dailyPayouts14d: number[];
}

export interface QuestActionResult {
  id: string;
  status: QuestStatus;
  /** duplicate → yeni görevin kimliği. */
  createdId?: string;
  message: string;
}

export const AUDIT_ACTION_LABEL: Readonly<Record<string, string>> = {
  CREATE_QUEST: 'Oluşturuldu',
  UPDATE_QUEST: 'Düzenlendi',
  DELETE_QUEST: 'Arşivlendi (eski silme)',
  QUEST_PAUSE: 'Duraklatıldı',
  QUEST_RESUME: 'Yayına alındı',
  QUEST_ARCHIVE: 'Arşivlendi',
  QUEST_RESTORE: 'Arşivden çıkarıldı',
  QUEST_DUPLICATE: 'Kopyalandı',
  QUEST_DUPLICATED_FROM: 'Kopyadan oluşturuldu',
  QUEST_MANUAL_COMPLETE: 'Kullanıcı için tamamlandı işaretlendi',
  BULK_CREATE_QUEST: 'Toplu oluşturuldu',
};

export const FIELD_LABEL: Readonly<Record<string, string>> = {
  name: 'ad',
  description: 'açıklama',
  icon: 'simge',
  type: 'dönem',
  requirement: 'mekanik/hedef',
  reward: 'ödül',
  expiresAt: 'bitiş',
  isActive: 'yayın durumu',
  archivedAt: 'arşiv',
};

// ───────────────────────────── Şablonlar ─────────────────────────────

export interface QuestTemplate {
  id: string;
  title: string;
  summary: string;
  values: Pick<QuestFormValues, 'name' | 'description' | 'icon' | 'cadence' | 'mechanic' | 'target' | 'category' | 'minLength'> & {
    /** Matris varsayılanının katı (ödül sunucudaki varsayılandan türetilir). */
    rewardMultiplier: number;
  };
}

/** Hazır görev şablonları — hepsi motorlu mekaniklerden; ödül puan matrisinden türetilir. */
export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  {
    id: 'daily-feedback',
    title: 'Günlük geri bildirim',
    summary: 'Her gün 1 geri bildirim · günlük',
    values: { name: 'Günün Sesi', description: 'Bugün bir işletmeye geri bildirim bırak.', icon: '💬', cadence: 'daily', mechanic: 'give_feedback', target: 1, category: '', minLength: null, rewardMultiplier: 0.5 },
  },
  {
    id: 'weekly-feedback',
    title: 'Haftalık 3 yorum',
    summary: 'Haftada 3 geri bildirim · haftalık',
    values: { name: 'Haftanın Eleştirmeni', description: 'Bu hafta 3 geri bildirim ya da yorum paylaş.', icon: '📝', cadence: 'weekly', mechanic: 'give_feedback', target: 3, category: '', minLength: null, rewardMultiplier: 1 },
  },
  {
    id: 'photo-feedback',
    title: 'Fotoğraflı geri bildirim',
    summary: 'Haftada 1 fotoğraflı geri bildirim',
    values: { name: 'Objektif Göz', description: 'Fotoğraflı bir geri bildirim paylaş.', icon: '📸', cadence: 'weekly', mechanic: 'feedback_with_photo', target: 1, category: '', minLength: null, rewardMultiplier: 1 },
  },
  {
    id: 'detailed-review',
    title: 'Ayrıntılı yorum',
    summary: '100+ karakterlik yorum · haftalık',
    values: { name: 'Detaycı', description: 'En az 100 karakterlik ayrıntılı bir yorum yaz.', icon: '✍️', cadence: 'weekly', mechanic: 'detailed_feedback', target: 1, category: '', minLength: 100, rewardMultiplier: 1.5 },
  },
  {
    id: 'explorer',
    title: 'Yeni yerler keşfet',
    summary: 'Ayda 3 farklı işletme',
    values: { name: 'Kaşif', description: 'Bu ay 3 farklı işletmeyi ziyaret et.', icon: '🧭', cadence: 'monthly', mechanic: 'visit_businesses', target: 3, category: '', minLength: null, rewardMultiplier: 2 },
  },
  {
    id: 'referral',
    title: 'Arkadaşını getir',
    summary: 'Ayda 1 tamamlanmış davet',
    values: { name: 'Davetçi', description: 'Bir arkadaşını Qratex’e davet et; ilk etkileşiminde görev tamamlanır.', icon: '🤝', cadence: 'monthly', mechanic: 'referral', target: 1, category: '', minLength: null, rewardMultiplier: 2 },
  },
  {
    id: 'category-visit',
    title: 'Kategori turu',
    summary: 'Bir kategoride 3 işletme · otomatik ödül',
    values: { name: 'Kafe Turu', description: '3 farklı kafede tüketim kaydı oluştur.', icon: '☕', cadence: 'special', mechanic: 'visit_category', target: 3, category: '', minLength: null, rewardMultiplier: 2 },
  },
  {
    id: 'manual',
    title: 'Yönetici onaylı görev',
    summary: 'Etkinlik, yarışma, özel görev',
    values: { name: 'Etkinlik Katılımı', description: 'Etkinliğimize katıl; ekibimiz katılımını onayladığında ödülünü al.', icon: '🎟️', cadence: 'special', mechanic: 'custom', target: 1, category: '', minLength: null, rewardMultiplier: 2 },
  },
];

export const ICON_CHOICES = ['🎯', '💬', '📝', '📸', '✍️', '🧭', '🤝', '☕', '🍽️', '🎟️', '⭐', '🔥', '🏆', '🎁', '🗺️', '❤️'] as const;
