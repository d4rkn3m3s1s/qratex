/**
 * Müşteri sesi duvarı (/dealer/voc-wall + /wall/[token]) — SAF sözleşme katmanı.
 *
 * Şema dalgası bittiği için duvar durumu `Settings` anahtar-değer tablosunda bayi başına tek
 * JSON belgede tutulur (`lib/dealer-queues/radar.ts` ile aynı desen):
 *   voc-wall:config:<dealerId>   → { rules, pinned[], hidden[], displays[], version }
 *   voc-wall:display:<sha256>    → { dealerId, displayId }  (oturumsuz ekran bağlantısı araması)
 *
 * Güvenlik kuralı: bayinin kuralı ya da "sabitle" kararı YAYIN GÜVENLİĞİNİ asla delmez —
 * toksik / güven-işaretli / sahte / denetlenmemiş / küfürlü yorum sabitlense bile ekrana çıkmaz.
 */
import { z } from 'zod';

export const VOC_WALL_MODULE = 'voc_wall';
export const WALL_CONFIG_CATEGORY = 'dealer_voc_wall';
export const wallConfigKey = (dealerId: string) => `voc-wall:config:${dealerId}`;
export const wallDisplayKey = (tokenHash: string) => `voc-wall:display:${tokenHash}`;

export const MAX_PINNED = 20;
export const MAX_HIDDEN = 1000;
export const MAX_ACTIVE_DISPLAYS = 10;
export const DISPLAY_TTL_DAYS = 365;
export const WALL_FEED_SIZE = 30;
export const CURATION_PAGE_SIZE = 20;
export const WALL_RANGES = [7, 30, 90] as const;
export type WallRange = (typeof WALL_RANGES)[number];

export const NAME_DISPLAYS = ['masked', 'none'] as const;
export type NameDisplay = (typeof NAME_DISPLAYS)[number];

export const WallRulesSchema = z.object({
  /** Otomatik yayın için en düşük yıldız (sabitlenen yorumlar bu kuraldan muaf). */
  minRating: z.number().int().min(1).max(5),
  /** Yalnız yazılı yorumlar (yalnız puan kayıtları ekrana çıkmaz). */
  requireText: z.boolean(),
  /** Ekranda ad gösterimi: maskeli baş harf ("A*** Y.") ya da hiç. Tam ad ASLA gönderilmez. */
  nameDisplay: z.enum(NAME_DISPLAYS),
  /** Alıntı başına süre (sn). Azaltılmış harekette istemci bunu iki katına çıkarır. */
  rotateSeconds: z.number().int().min(6).max(30),
  /** Varsayılan şube/QR süzgeci (null = tüm QR'lar). */
  qrCodeId: z.string().min(1).max(64).nullable(),
});
export type WallRules = z.infer<typeof WallRulesSchema>;

export const DEFAULT_WALL_RULES: WallRules = {
  minRating: 4,
  requireText: true,
  nameDisplay: 'masked',
  rotateSeconds: 10,
  qrCodeId: null,
};

export interface WallDisplay {
  id: string;
  label: string;
  tokenHash: string;
  qrCodeId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface WallConfig {
  rules: WallRules;
  pinned: string[];
  hidden: string[];
  displays: WallDisplay[];
  /** Her yazımda artar; ekran önbelleği anahtarına girer (moderasyon anında yansır). */
  version: number;
}

export const DEFAULT_WALL_CONFIG: WallConfig = {
  rules: DEFAULT_WALL_RULES,
  pinned: [],
  hidden: [],
  displays: [],
  version: 0,
};

const idList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))].slice(0, max) : [];

/** Bozuk/eksik JSON'u güvenli varsayılana tamamlar (fail-safe; asla fırlatmaz). */
export function parseWallConfig(raw: unknown): WallConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_WALL_CONFIG, rules: { ...DEFAULT_WALL_RULES } };
  const o = raw as Record<string, unknown>;
  const rulesIn = o.rules && typeof o.rules === 'object' ? (o.rules as Record<string, unknown>) : {};
  const rules = WallRulesSchema.safeParse({ ...DEFAULT_WALL_RULES, ...rulesIn });
  const displays: WallDisplay[] = Array.isArray(o.displays)
    ? (o.displays as unknown[])
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .filter((d) => typeof d.id === 'string' && typeof d.tokenHash === 'string' && typeof d.expiresAt === 'string')
        .map((d) => ({
          id: String(d.id),
          label: typeof d.label === 'string' ? d.label.slice(0, 60) : 'Ekran',
          tokenHash: String(d.tokenHash),
          qrCodeId: typeof d.qrCodeId === 'string' ? d.qrCodeId : null,
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date(0).toISOString(),
          expiresAt: String(d.expiresAt),
          revokedAt: typeof d.revokedAt === 'string' ? d.revokedAt : null,
        }))
        .slice(-50)
    : [];
  return {
    rules: rules.success ? rules.data : { ...DEFAULT_WALL_RULES },
    pinned: idList(o.pinned, MAX_PINNED),
    hidden: idList(o.hidden, MAX_HIDDEN),
    displays,
    version: typeof o.version === 'number' && Number.isFinite(o.version) ? o.version : 0,
  };
}

export type WallStatus = 'auto' | 'pinned' | 'hidden';

/** Moderasyon kararını listelere uygular (saf). Sabit listesi doluysa `null` döner. */
export function applyWallStatus(config: WallConfig, feedbackId: string, status: WallStatus): WallConfig | null {
  const pinned = config.pinned.filter((id) => id !== feedbackId);
  const hidden = config.hidden.filter((id) => id !== feedbackId);
  if (status === 'pinned') {
    if (pinned.length >= MAX_PINNED) return null;
    pinned.unshift(feedbackId);
  } else if (status === 'hidden') {
    hidden.unshift(feedbackId);
  }
  return { ...config, pinned, hidden: hidden.slice(0, MAX_HIDDEN), version: config.version + 1 };
}

export function displayIsActive(d: WallDisplay, now: Date = new Date()): boolean {
  return !d.revokedAt && new Date(d.expiresAt).getTime() > now.getTime();
}

// ───────────────────────── Yayın kararı (yönetim listesi) ─────────────────────────

export type BlockReason =
  | 'toxic'
  | 'flagged'
  | 'fraud'
  | 'pending'
  | 'author'
  | 'private'
  | 'language'
  | 'low_rating'
  | 'no_text'
  | 'other_qr';

export type WallVerdict =
  | { state: 'pinned' }
  | { state: 'live' }
  | { state: 'hidden' }
  | { state: 'blocked'; reason: BlockReason; /** güvenlik engeli mi (sabitlenemez) */ safety: boolean };

export interface VerdictRow {
  id: string;
  rating: number;
  text: string | null;
  isPublic: boolean;
  isToxic: boolean;
  trustFlagged: boolean;
  fraudScore: number | null;
  aiProcessedAt: Date | string | null;
  aiModelUsed: string | null;
  userId: string | null;
  authorFraudStatus: string | null;
  qrCodeId: string;
}

/**
 * Bir yorumun ekrandaki durumu. Sıra önemlidir: önce GÜVENLİK (kural ya da sabit bunu
 * aşamaz), sonra bayinin gizle/sabitle kararı, en son otomatik kurallar.
 * `wallEligibleWhere` (app/api/dealer/voc-wall/wall-policy.ts) ile aynı koşulları uygular.
 */
export function wallVerdict(
  row: VerdictRow,
  config: Pick<WallConfig, 'rules' | 'pinned' | 'hidden'>,
  opts: { fraudThreshold: number; blockedLanguage: (t: string | null) => boolean }
): WallVerdict {
  const safety = (reason: BlockReason): WallVerdict => ({ state: 'blocked', reason, safety: true });
  if (!row.isPublic) return safety('private');
  if (row.isToxic) return safety('toxic');
  if (row.trustFlagged) return safety('flagged');
  if (row.fraudScore != null && row.fraudScore >= opts.fraudThreshold) return safety('fraud');
  if (row.text && !row.aiProcessedAt && row.aiModelUsed !== 'local-fallback') return safety('pending');
  if (row.userId && row.authorFraudStatus !== 'clean') return safety('author');
  if (opts.blockedLanguage(row.text)) return safety('language');
  if (config.hidden.includes(row.id)) return { state: 'hidden' };
  if (config.pinned.includes(row.id)) return { state: 'pinned' };
  if (config.rules.qrCodeId && row.qrCodeId !== config.rules.qrCodeId) return { state: 'blocked', reason: 'other_qr', safety: false };
  if (row.rating < config.rules.minRating) return { state: 'blocked', reason: 'low_rating', safety: false };
  if (config.rules.requireText && !row.text?.trim()) return { state: 'blocked', reason: 'no_text', safety: false };
  return { state: 'live' };
}

export const CURATION_FILTERS = ['all', 'live', 'pinned', 'hidden', 'blocked'] as const;
export type CurationFilter = (typeof CURATION_FILTERS)[number];

// ───────────────────────── DTO'lar ─────────────────────────

export interface WallItemDto {
  id: string;
  rating: number;
  text: string | null;
  /** Maskeli ad ya da null (ad gösterilmiyor / anonim). */
  name: string | null;
  location: string | null;
  createdAt: string;
  pinned: boolean;
  replied: boolean;
}

export interface WallFeedDto {
  business: string | null;
  items: WallItemDto[];
  summary: { avgRating30d: number | null; count30d: number; count24h: number };
  /** "Siz de puan verin" QR'ı (SVG yolu) — etkin QR yoksa null. */
  feedbackQr: { url: string; path: string; size: number } | null;
  rotateSeconds: number;
  generatedAt: string;
}

export interface ThemeDto {
  theme: string;
  total: number;
  positive: number;
  negative: number;
}

export interface WallOverviewDto {
  range: WallRange;
  qrCodeId: string | null;
  stats: {
    avgRating: number | null;
    avgRatingPrev: number | null;
    count: number;
    countPrev: number;
    positivePct: number | null;
    positivePctPrev: number | null;
    liveCount: number;
  };
  themes: ThemeDto[];
  rules: WallRules;
  qrCodes: Array<{ id: string; name: string; location: string | null }>;
  pinnedCount: number;
  hiddenCount: number;
}

export interface CurationItemDto extends WallItemDto {
  verdict: WallVerdict;
  intent: string | null;
  themes: string[];
}

export interface CurationPageDto {
  items: CurationItemDto[];
  page: number;
  hasMore: boolean;
  filter: CurationFilter;
}

export interface DisplayDto {
  id: string;
  label: string;
  qrCodeId: string | null;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

// ───────────────────────── Yardımcılar ─────────────────────────

/** Feedback.themes JSON'undan tema adları (bozuk girdiye dayanıklı). */
export function themeNames(raw: unknown): Array<{ theme: string; sentiment: string | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ theme: string; sentiment: string | null }> = [];
  for (const t of raw) {
    if (typeof t === 'string' && t.trim()) out.push({ theme: t.trim().slice(0, 40), sentiment: null });
    else if (t && typeof t === 'object' && typeof (t as { theme?: unknown }).theme === 'string') {
      const name = (t as { theme: string }).theme.trim();
      if (name) out.push({ theme: name.slice(0, 40), sentiment: typeof (t as { sentiment?: unknown }).sentiment === 'string' ? (t as { sentiment: string }).sentiment : null });
    }
  }
  return out;
}

/** En çok geçen temalar, olumlu/olumsuz ayrımıyla (temanın kendi duygusu, yoksa yorumun). */
export function topThemes(rows: Array<{ themes: unknown; sentiment: string | null }>, limit = 6): ThemeDto[] {
  const map = new Map<string, ThemeDto>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const t of themeNames(r.themes)) {
      const key = t.theme.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = map.get(key) ?? { theme: t.theme, total: 0, positive: 0, negative: 0 };
      cur.total += 1;
      const s = (t.sentiment ?? r.sentiment ?? '').toLowerCase();
      if (s === 'positive') cur.positive += 1;
      else if (s === 'negative') cur.negative += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.theme.localeCompare(b.theme, 'tr')).slice(0, limit);
}

/** QR matrisini tek SVG yoluna çevirir (her koyu modül 1×1 kare). */
export function qrMatrixToPath(rows: boolean[][]): string {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}
