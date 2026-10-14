/**
 * Seslerim — saf (Prisma'sız) çekirdek: anahtar, imleç, birleşik sayfalama, yolculuk ve
 * telafi önceliği. Jest ile doğrudan test edilir (__tests__/lib/customer-voices.test.ts).
 */
import type {
  CustomerRemedyStatus,
  JourneyEvent,
  VoiceKind,
  VoiceStage,
  VoiceStatusFilter,
  VoiceTypeFilter,
} from './types';
import { CUSTOMER_VISIBLE_REMEDY_STATUSES, VOICE_STATUS_FILTERS, VOICE_TYPE_FILTERS } from './types';

/* ───────────────────────── Anahtar ───────────────────────── */

const KEY_RE = /^(fb|cs)-([A-Za-z0-9_-]{1,64})$/;

/** `fb-<feedbackId>` (QR) · `cs-<consumptionId>` (tüketim; yorumsuz olabilir). */
export function voiceKey(kind: VoiceKind, id: string): string {
  return `${kind === 'qr' ? 'fb' : 'cs'}-${id}`;
}

export function parseVoiceKey(key: string | null | undefined): { kind: VoiceKind; id: string } | null {
  if (typeof key !== 'string') return null;
  const m = KEY_RE.exec(key.trim());
  if (!m) return null;
  return { kind: m[1] === 'fb' ? 'qr' : 'review', id: m[2] };
}

/* ───────────────────────── Filtre ───────────────────────── */

export const VOICE_PAGE_SIZE = 20;
export const VOICE_PAGE_MAX = 50;
export const VOICE_QUERY_MAX = 100;

export function normalizeVoiceTypeFilter(v: unknown): VoiceTypeFilter {
  return (VOICE_TYPE_FILTERS as readonly string[]).includes(String(v)) ? (v as VoiceTypeFilter) : 'all';
}

export function normalizeVoiceStatusFilter(v: unknown): VoiceStatusFilter {
  return (VOICE_STATUS_FILTERS as readonly string[]).includes(String(v)) ? (v as VoiceStatusFilter) : 'all';
}

/** Arama metni: kırpılır, boşluklar sadeleşir, uzunluk sınırlanır. */
export function normalizeVoiceQuery(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, VOICE_QUERY_MAX);
}

/* ───────────────────────── İmleç ───────────────────────── */

/**
 * Birleşik sıralama: `createdAt` azalan, eşitlikte anahtar (`fb-…`/`cs-…`) azalan.
 * İmleç son görülen öğenin (createdAt, key) çiftidir; base64url JSON.
 */
export type VoiceCursor = { at: string; key: string };

export function encodeVoiceCursor(c: VoiceCursor): string {
  return Buffer.from(JSON.stringify([c.at, c.key]), 'utf8').toString('base64url');
}

export function decodeVoiceCursor(raw: string | null | undefined): VoiceCursor | null {
  if (!raw || typeof raw !== 'string' || raw.length > 300) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, key] = parsed;
    if (typeof at !== 'string' || typeof key !== 'string') return null;
    if (Number.isNaN(new Date(at).getTime()) || !parseVoiceKey(key)) return null;
    return { at, key };
  } catch {
    return null;
  }
}

/** Birleşik sıralamada `a`, `b`'den önce mi gelir (daha yeni ya da eşitlikte büyük anahtar)? */
export function voiceComesBefore(a: VoiceCursor, b: VoiceCursor): boolean {
  const ta = new Date(a.at).getTime();
  const tb = new Date(b.at).getTime();
  if (ta !== tb) return ta > tb;
  return a.key > b.key;
}

/**
 * Bir tablodaki satırın imleçten SONRA gelip gelmediğini belirleyen Prisma koşulunun
 * parçalarını üretir. `prefix` tablonun anahtar önekidir (`fb` ya da `cs`); `idField`
 * eşitlik durumunda karşılaştırılan alan. Dönüş `null` ise imleç yoktur (filtre yok).
 *
 *   createdAt < at  VEYA  (createdAt = at VE key < cursor.key)
 *
 * Aynı anda iki tabloda eşit zaman damgası olası değildir ama sıralama yine de toplamdır:
 * "cs-" < "fb-" olduğundan imleç fb ise eşit anlı tüm cs satırları sonra gelir.
 */
export function cursorWhere(
  cursor: VoiceCursor | null,
  prefix: 'fb' | 'cs',
  idField: string
): Record<string, unknown> | null {
  if (!cursor) return null;
  const at = new Date(cursor.at);
  const parsed = parseVoiceKey(cursor.key)!;
  const cursorPrefix = parsed.kind === 'qr' ? 'fb' : 'cs';
  const older = { createdAt: { lt: at } };
  if (cursorPrefix === prefix) {
    return { OR: [older, { AND: [{ createdAt: at }, { [idField]: { lt: parsed.id } }] }] };
  }
  // Önek farklı: eşit anlı satırların hepsi ya önce (atla) ya sonra (dahil et) gelir.
  const sameInstantAfter = `${prefix}-` < `${cursorPrefix}-`;
  return sameInstantAfter ? { createdAt: { lte: at } } : older;
}

/**
 * İki tablodan ayrı ayrı `limit + 1` satır çekildikten sonra birleştirir. Her kaynak kendi
 * içinde (createdAt, key) azalan sıralı gelmelidir. `nextCursor` yalnız gerçekten daha fazla
 * kayıt varken döner (kaynaklardan biri `limit`'ten fazla getirdiyse ya da birleşim kırpıldıysa).
 */
export function mergeVoicePages<T extends { createdAt: string; key: string }>(
  sources: Array<{ rows: T[]; exhausted: boolean }>,
  limit: number
): { items: T[]; nextCursor: string | null } {
  const all = sources.flatMap((s) => s.rows);
  all.sort((a, b) => (voiceComesBefore({ at: a.createdAt, key: a.key }, { at: b.createdAt, key: b.key }) ? -1 : 1));
  const items = all.slice(0, limit);
  const hasMore = all.length > limit || sources.some((s) => !s.exhausted);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeVoiceCursor({ at: last.createdAt, key: last.key }) : null };
}

/* ───────────────────────── Telafi ───────────────────────── */

export function isCustomerRemedyStatus(s: unknown): s is CustomerRemedyStatus {
  return (CUSTOMER_VISIBLE_REMEDY_STATUSES as readonly string[]).includes(String(s));
}

/**
 * Bir sese bağlı tekliflerden kartta gösterileceği seçer: açık (pending) teklif her zaman
 * önce gelir (en yenisi), sonra en yeni kabul edilmiş, sonra en yeni süresi dolmuş.
 * (Eski liste "en eski teklif kazanır" hatasıyla güncel teklifi gizliyordu.)
 */
export function pickActiveRemedy<T extends { status: string; createdAt: Date | string }>(offers: readonly T[]): T | null {
  const visible = offers.filter((o) => isCustomerRemedyStatus(o.status));
  const newest = (s: CustomerRemedyStatus) =>
    visible
      .filter((o) => o.status === s)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
  return newest('pending') ?? newest('accepted') ?? newest('expired');
}

/* ───────────────────────── Yolculuk ───────────────────────── */

export function voiceStage(input: { viewedAt?: Date | string | null; repliedAt?: Date | string | null }): VoiceStage {
  if (input.repliedAt) return 'replied';
  if (input.viewedAt) return 'viewed';
  return 'sent';
}

export type JourneyRemedyInput = {
  id: string;
  status: string;
  createdAt: Date | string;
  acceptedAt: Date | string | null;
  /** Müşteriye görünür zaman çizelgesi olayları (gizli türler süzülmüş olmalı). */
  events: Array<{ kind: string; createdAt: Date | string; meta?: unknown }>;
  selectionLabel: string | null;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** Zaman çizelgesindeki `completed` olayından kredilenen puan (yoksa null). */
export function creditedPointsFromEvents(events: Array<{ kind: string; meta?: unknown }>): number | null {
  const ev = events.find((e) => e.kind === 'completed');
  if (!ev || !ev.meta || typeof ev.meta !== 'object') return null;
  const p = (ev.meta as { creditedPoints?: unknown }).creditedPoints;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

/**
 * Kayıtlı zaman damgalarından kronolojik yolculuk. Hiçbir adım uydurulmaz:
 *  - "İnceledi" adımı yalnız `viewedAt` kayıtlıysa ve yanıttan SONRA değilse gösterilir
 *    (otomatik yanıtta bayi kaydı açmamış olabilir; sonradan açması zamanı geriye akıtmasın).
 *  - Telafi teklifinin zamanı müşteriye bildirim anıdır (onay kuyruğundaki taslak anı değil).
 */
export function buildVoiceJourney(input: {
  createdAt: Date | string;
  viewedAt?: Date | string | null;
  repliedAt?: Date | string | null;
  remedies?: JourneyRemedyInput[];
}): JourneyEvent[] {
  const events: JourneyEvent[] = [{ id: 'submitted', kind: 'submitted', at: iso(input.createdAt) }];
  const repliedMs = input.repliedAt ? new Date(input.repliedAt).getTime() : null;
  if (input.viewedAt) {
    const viewedMs = new Date(input.viewedAt).getTime();
    if (repliedMs === null || viewedMs <= repliedMs) {
      events.push({ id: 'viewed', kind: 'viewed', at: iso(input.viewedAt) });
    }
  }
  if (input.repliedAt) events.push({ id: 'replied', kind: 'replied', at: iso(input.repliedAt) });

  for (const r of input.remedies ?? []) {
    if (!isCustomerRemedyStatus(r.status)) continue;
    const notified = r.events.find((e) => e.kind === 'notified');
    events.push({
      id: `remedy-${r.id}-offered`,
      kind: 'remedy_offered',
      at: iso(notified?.createdAt ?? r.createdAt),
      remedyId: r.id,
    });
    if (r.status === 'accepted' && r.acceptedAt) {
      events.push({
        id: `remedy-${r.id}-accepted`,
        kind: 'remedy_accepted',
        at: iso(r.acceptedAt),
        remedyId: r.id,
        detail: r.selectionLabel,
      });
      const completed = r.events.find((e) => e.kind === 'completed');
      const credited = creditedPointsFromEvents(r.events);
      if (completed && credited !== null) {
        events.push({
          id: `remedy-${r.id}-credited`,
          kind: 'remedy_credited',
          at: iso(completed.createdAt),
          remedyId: r.id,
          detail: String(credited),
        });
      }
    }
    if (r.status === 'expired') {
      const expired = r.events.find((e) => e.kind === 'expired');
      events.push({
        id: `remedy-${r.id}-expired`,
        kind: 'remedy_expired',
        at: iso(expired?.createdAt ?? r.createdAt),
        remedyId: r.id,
      });
    }
  }

  // Kronolojik; eşit anlarda üretim sırası korunur (sort kararlıdır).
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/* ───────────────────────── Metin ───────────────────────── */

export const VOICE_PREVIEW_CHARS = 220;

export function previewText(text: string | null | undefined, max = VOICE_PREVIEW_CHARS): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Medya Json alanından güvenli URL listesi (yalnız http(s) ya da data:image). */
export function mediaUrls(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const url = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { url?: unknown }).url : null;
    const type = item && typeof item === 'object' ? (item as { type?: unknown }).type : undefined;
    if (typeof url !== 'string') continue;
    if (type && type !== 'image') continue;
    if (/^https:\/\//i.test(url) || url.startsWith('/api/files/feedback/') || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/** Boyut puanları Json'undan yalnız bilinen anahtarlar ve 1–5 tam sayılar. */
export const REVIEW_DIMENSIONS = ['taste', 'service', 'ambiance', 'value', 'cleanliness'] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export function normalizeDimensions(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const k of REVIEW_DIMENSIONS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

type Senti = 'positive' | 'neutral' | 'negative';
const toSenti = (v: unknown): Senti => (v === 'positive' || v === 'negative' ? v : 'neutral');

/**
 * AI analizinden müşteriye yararlı kısım ("AI ne anladı"). Bayi triyaj alanları
 * (aciliyet, efor, kaybetme riski, niyet, aksiyon önerileri) BİLEREK alınmaz.
 */
export function customerAnalysis(f: {
  aiAnalysis?: unknown;
  themes?: unknown;
  statementSentiments?: unknown;
  topics?: unknown;
}): { summary: string | null; themes: Array<{ theme: string; sentiment: Senti }>; statements: Array<{ statement: string; sentiment: Senti }>; topics: string[] } | null {
  const summaryRaw = f.aiAnalysis && typeof f.aiAnalysis === 'object' ? (f.aiAnalysis as { summary?: unknown }).summary : null;
  const summary = typeof summaryRaw === 'string' && summaryRaw.trim() ? summaryRaw.trim().slice(0, 600) : null;
  const themes = Array.isArray(f.themes)
    ? f.themes
        .filter((t): t is { theme: string; sentiment?: unknown } => !!t && typeof t === 'object' && typeof (t as { theme?: unknown }).theme === 'string')
        .slice(0, 8)
        .map((t) => ({ theme: t.theme.slice(0, 80), sentiment: toSenti(t.sentiment) }))
    : [];
  const statements = Array.isArray(f.statementSentiments)
    ? f.statementSentiments
        .filter((s): s is { statement: string; sentiment?: unknown } => !!s && typeof s === 'object' && typeof (s as { statement?: unknown }).statement === 'string')
        .slice(0, 10)
        .map((s) => ({ statement: s.statement.slice(0, 300), sentiment: toSenti(s.sentiment) }))
    : [];
  const topics = Array.isArray(f.topics) ? f.topics.filter((t): t is string => typeof t === 'string').slice(0, 8) : [];
  if (!summary && themes.length === 0 && statements.length === 0 && topics.length === 0) return null;
  return { summary, themes, statements, topics };
}

/** Europe/Istanbul takvim ayının başlangıç anı (UTC+3 sabit; 2016'dan beri yaz saati yok). */
export function istanbulMonthStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + 3 * 3600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - 3 * 3600_000);
}
