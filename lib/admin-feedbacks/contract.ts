/**
 * Admin → Geri Bildirimler (platform moderasyon kuyruğu) sözleşmesi — istemci ve sunucu ortak.
 *
 * Bu dosya Prisma içermez (istemci paketine girer). Sunucu mantığı:
 *  - `lib/admin-feedbacks/feed.server.ts`    birleşik akış (QR ∪ tüketim yorumu), sayım, KPI, CSV
 *  - `lib/admin-feedbacks/detail.server.ts`  tek kaydın tam bağlamı (AI sinyalleri, telafi, denetim)
 *  - `lib/admin-feedbacks/actions.server.ts` toplu moderasyon (sil/geri al/gizle/işaret/hatırlat)
 *
 * Kurallar (docs/audit/2026-10-08/admin/admin_feedbacks.md):
 *  - Kalıcı silme yok: her iki kaynak da `deletedAt` ile çöp kutusuna gider, geri alınabilir.
 *  - Satır kimliği kaynak önekli (`qr:<id>` / `consumption:<id>`): iki tablonun kimlikleri
 *    tek seçimde, tek URL'de (`?id=`) karışmaz.
 *  - Zaman Europe/Istanbul: dönem ve özel aralık İstanbul takvim günüdür, bitiş günü DAHİL.
 */
import { z } from 'zod';
import { dayRangeToInstants, isValidDay, istanbulDay, resolvePreset } from '@/components/ds/page/date-range';

// ───────────────────────────── Sözlükler ─────────────────────────────

export const FEED_SOURCES = ['qr', 'consumption'] as const;
export type FeedSource = (typeof FEED_SOURCES)[number];

/** Kayıtlı görünümler (sekme). Varsayılan: dikkat gerektirenler. */
export const FEED_VIEWS = ['attention', 'all', 'unreplied', 'flagged', 'hidden', 'trash'] as const;
export type FeedView = (typeof FEED_VIEWS)[number];
export const FEED_DEFAULT_VIEW: FeedView = 'attention';

/** Tek duygu tanımı (analitik + bayi gelen kutusuyla aynı): AI yoksa puandan; metinli ve analiz bekleyen = pending. */
export const FEED_SENTIMENTS = ['positive', 'neutral', 'negative', 'pending'] as const;
export type FeedSentiment = (typeof FEED_SENTIMENTS)[number];

/** İşaretler: herhangi biri seçilirse "en az biri" (VEYA) anlamına gelir. */
export const FEED_FLAGS = ['toxic', 'trust', 'fraud'] as const;
export type FeedFlag = (typeof FEED_FLAGS)[number];

export const FEED_PERIODS = ['today', 'last7', 'last30', 'last90', 'thisYear'] as const;
export type FeedPeriod = (typeof FEED_PERIODS)[number];

export const FEED_SORT_IDS = ['createdAt', 'rating'] as const;
export type FeedSortId = (typeof FEED_SORT_IDS)[number];
export const FEED_DEFAULT_SORT = 'createdAt.desc';
export const FEED_PAGE_SIZES = [10, 20, 50, 100] as const;
export const FEED_DEFAULT_PAGE_SIZE = 20;
export const FEED_EXPORT_MAX_ROWS = 10_000;
/** Bu eşik ve üstü sahte yorum skoru "işaretli" sayılır. */
export const FRAUD_FLAG_THRESHOLD = 0.7;
/** Bayiye hatırlatma: aynı bayiye bu süre içinde ikinci hatırlatma gitmez. */
export const REMIND_COOLDOWN_HOURS = 24;

// ───────────────────────────── Sorgu ─────────────────────────────

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const pre = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => emptyToUndef(first(v)), schema);

/** `a,b,c` → izinli değerlerin tekil listesi (geçersizler sessizce düşer). */
function csvList<T extends string>(allowed: readonly T[]) {
  return z.preprocess((v) => {
    const raw = first(v);
    if (typeof raw !== 'string' || !raw.trim()) return undefined;
    const set = new Set(raw.split(',').map((s) => s.trim()));
    const out = allowed.filter((a) => set.has(a));
    return out.length ? out : undefined;
  }, z.array(z.enum(allowed as unknown as [T, ...T[]])).optional());
}

const RATING_VALUES = ['1', '2', '3', '4', '5'] as const;

export const feedFiltersSchema = z.object({
  view: pre(z.enum(FEED_VIEWS).optional()),
  q: pre(z.string().trim().max(100).optional()),
  source: pre(z.enum(FEED_SOURCES).optional()),
  sentiment: pre(z.enum(FEED_SENTIMENTS).optional()),
  rating: csvList(RATING_VALUES),
  flags: csvList(FEED_FLAGS),
  dealer: pre(z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Geçersiz bayi').optional()),
  period: pre(z.enum(FEED_PERIODS).optional()),
  from: pre(z.string().refine(isValidDay, 'Geçersiz başlangıç günü').optional()),
  to: pre(z.string().refine(isValidDay, 'Geçersiz bitiş günü').optional()),
});
export type FeedFilters = z.infer<typeof feedFiltersSchema>;

export const feedQuerySchema = feedFiltersSchema.extend({
  sort: pre(z.string().max(40).optional()),
  page: pre(z.coerce.number().int().min(1).max(100_000).default(1)),
  size: pre(
    z.coerce
      .number()
      .int()
      .refine((n) => (FEED_PAGE_SIZES as readonly number[]).includes(n), 'Geçersiz sayfa boyutu')
      .default(FEED_DEFAULT_PAGE_SIZE)
  ),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export interface ParsedSort {
  id: FeedSortId;
  desc: boolean;
}

export function parseFeedSort(raw: string | null | undefined): ParsedSort {
  const [id, dir] = String(raw || FEED_DEFAULT_SORT).split(',')[0].split('.');
  if ((FEED_SORT_IDS as readonly string[]).includes(id)) return { id: id as FeedSortId, desc: dir !== 'asc' };
  return { id: 'createdAt', desc: true };
}

/** 2 karakterden kısa arama yok sayılır; LIKE joker karakterleri kaçışlanır. */
export function searchPattern(q: string | undefined | null): string | null {
  const t = (q ?? '').trim();
  if (t.length < 2) return null;
  return `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Dönem → `[from, to)` anları. Özel aralık (from/to günleri) hazır dönemden önce gelir;
 * bitiş günü DAHİL (İstanbul gece yarısına kadar). Hiçbiri yoksa `null` = tüm zamanlar.
 */
export function resolveWindow(f: Pick<FeedFilters, 'period' | 'from' | 'to'>, today: string = istanbulDay()): { from: Date; to: Date } | null {
  if (f.from || f.to) {
    let a = f.from ?? f.to!;
    let b = f.to ?? today;
    if (a > b) [a, b] = [b, a];
    const r = dayRangeToInstants({ from: a, to: b });
    return { from: new Date(r.from), to: new Date(r.to) };
  }
  if (f.period) {
    const r = dayRangeToInstants(resolvePreset(f.period, today));
    return { from: new Date(r.from), to: new Date(r.to) };
  }
  return null;
}

/** Satır kimliği ↔ (kaynak, id). */
export function feedKey(source: FeedSource, id: string): string {
  return `${source}:${id}`;
}
export function parseFeedKey(key: string | null | undefined): { source: FeedSource; id: string } | null {
  if (!key) return null;
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const source = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!(FEED_SOURCES as readonly string[]).includes(source) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return { source: source as FeedSource, id };
}

/** Filtreleri URL dizgisine çevirir (BFF, CSV bağlantısı ve sayfa aynı anahtarları kullanır). */
export function feedQueryString(p: Partial<Record<keyof FeedQuery, string | number | readonly string[] | undefined | null>>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
      continue;
    }
    sp.set(k, String(v));
  }
  return sp.toString();
}

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export interface FeedItem {
  key: string;
  id: string;
  source: FeedSource;
  createdAt: string;
  rating: number;
  /** En fazla 280 karakter önizleme; tamamı detayda. */
  text: string | null;
  sentiment: FeedSentiment;
  dealerId: string;
  dealerName: string;
  /** QR adı ya da ürün adı. */
  place: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  replied: boolean;
  isToxic: boolean;
  trustFlagged: boolean;
  fraudScore: number | null;
  isPublic: boolean;
  deletedAt: string | null;
  topics: string[];
}

export interface FeedPage {
  items: FeedItem[];
  total: number;
  page: number;
  size: number;
}

export type ViewCounts = Record<FeedView, number>;

export interface FeedStats {
  /** Sekme sayaçları (görünümden bağımsız, diğer filtrelere duyarlı). */
  views: ViewCounts;
  /** Aşağıdakiler silinmemiş kayıtlar üzerinden (diğer filtrelere duyarlı). */
  total: number;
  avgRating: number | null;
  negative: number;
  pending: number;
  replied: number;
  /** Bayi yanıt süresi medyanı yerine ortalaması (saat); yanıt yoksa null. */
  avgReplyHours: number | null;
  /** NPS yalnız QR yorumlarında toplanır (tüketim yorumunda NPS sorusu yok). */
  nps: { value: number | null; n: number };
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface DealerOption {
  id: string;
  name: string;
}

export interface FeedDetailRemedy {
  id: string;
  status: string;
  message: string;
  selectedType: string | null;
  selectedValue: string | null;
  createdAt: string;
  acceptedAt: string | null;
}

export interface FeedDetailAudit {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  reason: string | null;
}

export interface FeedDetail {
  key: string;
  id: string;
  source: FeedSource;
  createdAt: string;
  rating: number;
  text: string | null;
  sentiment: FeedSentiment;
  dealer: { id: string; name: string };
  place: string | null;
  staffName: string | null;
  user: { id: string; name: string | null; email: string | null; isDemo: boolean; fraudStatus: string | null } | null;
  /** Bu müşterinin platformdaki diğer (silinmemiş) yorum sayısı. */
  userOtherReviews: number | null;
  dealerReply: string | null;
  dealerRepliedAt: string | null;
  dealerFirstViewedAt: string | null;
  isPublic: boolean;
  deletedAt: string | null;
  moderation: { isToxic: boolean; trustFlagged: boolean; trustReason: string | null; fraudScore: number | null };
  ai: {
    analyzedAt: string | null;
    model: string | null;
    intent: string | null;
    intentScore: number | null;
    urgency: number | null;
    churnRisk: number | null;
    npsScore: number | null;
    emotions: string[];
    topics: string[];
    dimensions: Array<{ key: string; label: string; value: number }>;
    actionSuggestions: Array<{ action: string; priority: string | null }>;
  };
  mediaCount: number;
  remedies: FeedDetailRemedy[];
  audit: FeedDetailAudit[];
}

// ───────────────────────────── Toplu işlem ─────────────────────────────

export const BULK_ACTIONS = ['delete', 'restore', 'hide', 'show', 'flag', 'clearFlags', 'remind'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
/** Gerekçesi zorunlu aksiyonlar (denetim izine yazılır). */
export const REASON_REQUIRED: readonly BulkAction[] = ['delete', 'hide', 'flag'];
/** Yalnız QR yorumunda anlamlı aksiyonlar (tüketim yorumunda görünürlük/işaret alanı yok). */
export const QR_ONLY_ACTIONS: readonly BulkAction[] = ['hide', 'show', 'flag', 'clearFlags'];

export const bulkBodySchema = z
  .object({
    action: z.enum(BULK_ACTIONS),
    keys: z
      .array(z.string().max(80))
      .min(1, 'En az bir kayıt seçin')
      .max(100, 'Tek seferde en fazla 100 kayıt')
      .transform((arr, ctx) => {
        const out: Array<{ source: FeedSource; id: string }> = [];
        const seen = new Set<string>();
        for (const k of arr) {
          const p = parseFeedKey(k);
          if (!p) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz kayıt kimliği' });
            return z.NEVER;
          }
          const kk = feedKey(p.source, p.id);
          if (!seen.has(kk)) {
            seen.add(kk);
            out.push(p);
          }
        }
        return out;
      }),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((b, ctx) => {
    if (REASON_REQUIRED.includes(b.action) && (b.reason ?? '').length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Gerekçe en az 3 karakter olmalı' });
    }
  });
export type BulkBody = z.infer<typeof bulkBodySchema>;

export interface BulkResult {
  action: BulkAction;
  requested: number;
  affected: number;
  skipped: Array<{ key: string; reason: string }>;
  /** `remind` için: bildirim giden bayi sayısı. */
  notifiedDealers?: number;
}

// ───────────────────────────── Etiketler (TR) ─────────────────────────────

export const SOURCE_LABEL: Record<FeedSource, string> = { qr: 'QR yorumu', consumption: 'Tüketim yorumu' };
export const VIEW_LABEL: Record<FeedView, string> = {
  attention: 'Dikkat gerektiren',
  all: 'Tümü',
  unreplied: 'Yanıtsız',
  flagged: 'İşaretli',
  hidden: 'Gizlenen',
  trash: 'Çöp kutusu',
};
export const SENTIMENT_LABEL: Record<FeedSentiment, string> = {
  positive: 'Olumlu',
  neutral: 'Nötr',
  negative: 'Olumsuz',
  pending: 'Analiz bekliyor',
};
export const FLAG_LABEL: Record<FeedFlag, string> = { toxic: 'Toksik', trust: 'Güven işaretli', fraud: 'Sahte şüphesi' };
export const PERIOD_LABEL: Record<FeedPeriod, string> = {
  today: 'Bugün',
  last7: 'Son 7 gün',
  last30: 'Son 30 gün',
  last90: 'Son 90 gün',
  thisYear: 'Bu yıl',
};
export const BULK_ACTION_LABEL: Record<BulkAction, string> = {
  delete: 'Çöp kutusuna taşı',
  restore: 'Geri yükle',
  hide: 'Yayından gizle',
  show: 'Yeniden yayınla',
  flag: 'Toksik olarak işaretle',
  clearFlags: 'İşaretleri temizle',
  remind: 'Bayiye hatırlat',
};
export const INTENT_LABEL: Record<string, string> = {
  complaint: 'Şikâyet',
  suggestion: 'Öneri',
  praise: 'Övgü',
  question: 'Soru',
  general: 'Genel',
};
export const EMOTION_LABEL: Record<string, string> = {
  happy: 'Mutlu',
  joy: 'Neşe',
  satisfied: 'Memnun',
  grateful: 'Minnettar',
  excited: 'Heyecanlı',
  surprised: 'Şaşkın',
  neutral: 'Nötr',
  sad: 'Üzgün',
  disappointed: 'Hayal kırıklığı',
  angry: 'Kızgın',
  frustrated: 'Bıkkın',
  annoyed: 'Rahatsız',
  confused: 'Kafası karışık',
  anxious: 'Endişeli',
  disgusted: 'Tiksinti',
};
export const DIMENSION_LABEL: Record<string, string> = {
  taste: 'Lezzet',
  service: 'Hizmet',
  ambiance: 'Ortam',
  atmosphere: 'Atmosfer',
  value: 'Fiyat / değer',
  price: 'Fiyat',
  cleanliness: 'Temizlik',
  speed: 'Hız',
  quality: 'Kalite',
  portion: 'Porsiyon',
  staff: 'Personel',
};
export const REMEDY_STATUS_LABEL: Record<string, string> = {
  pending: 'Müşteride bekliyor',
  awaiting_dealer_approval: 'Bayi onayında',
  accepted: 'Kabul edildi',
  expired: 'Süresi doldu',
  rejected: 'Reddedildi',
};
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  FEEDBACK_MOD_DELETE: 'Çöp kutusuna taşındı',
  FEEDBACK_MOD_RESTORE: 'Geri yüklendi',
  FEEDBACK_MOD_HIDE: 'Yayından gizlendi',
  FEEDBACK_MOD_SHOW: 'Yeniden yayınlandı',
  FEEDBACK_MOD_FLAG: 'Toksik olarak işaretlendi',
  FEEDBACK_MOD_CLEARFLAGS: 'İşaretler temizlendi',
  FEEDBACK_MOD_REMIND: 'Bayiye hatırlatıldı',
  SOFT_DELETE_FEEDBACKS: 'Silindi (eski ekran)',
  SOFT_DELETE_CONSUMPTION_REVIEWS: 'Silindi (eski ekran)',
  RESTORE_FEEDBACKS: 'Geri yüklendi (eski ekran)',
  RESTORE_CONSUMPTION_REVIEWS: 'Geri yüklendi (eski ekran)',
};

/** AI JSON alanı → metin listesi: dizi (string ya da `{label}`) ya da obje anahtarları. */
export function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          const s = o.label ?? o.name ?? o.topic ?? o.theme;
          return typeof s === 'string' ? s : null;
        }
        return null;
      })
      .filter((s): s is string => !!s && s.trim().length > 0)
      .map((s) => s.trim());
  }
  if (value && typeof value === 'object') return Object.keys(value as object);
  return [];
}

/** `{ taste: 5, service: { score: 4 } }` → sayısal boyutlar (TR etiketli); sayısal olmayanlar düşer. */
export function normalizeDimensions(value: unknown): Array<{ key: string; label: string; value: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const out: Array<{ key: string; label: string; value: number }> = [];
  for (const [k, raw] of Object.entries(value as Record<string, unknown>)) {
    let n: unknown = raw;
    if (raw && typeof raw === 'object') n = (raw as Record<string, unknown>).score ?? (raw as Record<string, unknown>).value;
    if (typeof n === 'number' && Number.isFinite(n)) out.push({ key: k, label: DIMENSION_LABEL[k] ?? k, value: n });
  }
  return out;
}

export function emotionLabel(e: string): string {
  return EMOTION_LABEL[e.toLowerCase()] ?? e;
}

/**
 * OWASP CSV enjeksiyonu: `= + - @ \t \r` ile başlayan hücre başına `'` alır;
 * ayraç/tırnak/satır sonu içeren hücre çift tırnağa alınır.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function csvLine(values: readonly unknown[]): string {
  return values.map(csvCell).join(';');
}

/** Kanonik liste sorgu dizgisi — sunucu ön yüklemesi ve istemci aynı anahtarı üretir (initialData eşleşir). */
export function canonicalFeedQs(q: FeedQuery): string {
  return feedQueryString({
    view: q.view,
    q: q.q,
    source: q.source,
    sentiment: q.sentiment,
    rating: q.rating,
    flags: q.flags,
    dealer: q.dealer,
    period: q.period,
    from: q.from,
    to: q.to,
    sort: q.sort,
    page: q.page,
    size: q.size,
  });
}

/** KPI/sekme sayaçları sorgusu — görünüm, sayfa ve sıralamadan bağımsız. */
export function canonicalStatsQs(q: FeedFilters): string {
  return feedQueryString({
    q: q.q,
    source: q.source,
    sentiment: q.sentiment,
    rating: q.rating,
    flags: q.flags,
    dealer: q.dealer,
    period: q.period,
    from: q.from,
    to: q.to,
  });
}

/** URL parametreleri → doğrulanmış sorgu; geçersiz alan varsayılana düşer (asla patlamaz). */
export function parseFeedQuery(params: { get(key: string): string | null }): FeedQuery {
  const keys = ['view', 'q', 'source', 'sentiment', 'rating', 'flags', 'dealer', 'period', 'from', 'to', 'sort', 'page', 'size'] as const;
  const raw: Record<string, string> = {};
  for (const k of keys) {
    const v = params.get(k);
    if (v != null) raw[k] = v;
  }
  const full = feedQuerySchema.safeParse(raw);
  if (full.success) return full.data;
  // Alan alan kurtar: yalnız hatalı anahtarlar düşer.
  const bad = new Set(full.error.issues.map((i) => String(i.path[0])));
  for (const k of bad) delete raw[k];
  const retry = feedQuerySchema.safeParse(raw);
  return retry.success ? retry.data : feedQuerySchema.parse({});
}
