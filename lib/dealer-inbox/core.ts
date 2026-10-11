/**
 * Bayi Gelen Kutusu — saf çekirdek (Prisma/React yok; jest ile test edilir).
 *
 *  - kayıt anahtarı (`qr-…` / `cr-…`), filtre normalizasyonu
 *  - iki kaynaklı imleç (createdAt + anahtar; yeni→eski ya da eski→yeni) ve sayfa birleştirme
 *  - tek duygu tanımı (AI duygusu, yoksa puan eşiği; metinli ve analiz edilmemişse "bekliyor")
 *  - öncelik ve SLA (olumsuz: 24 sa, diğerleri: 72 sa; yanıt ya da kapanışla biter)
 *  - durum türetme (vaka kapandı > yanıt var > yeni)
 *  - yanıt şablonu değişkenleri, boyut puanları, CSV (formül enjeksiyonu korumalı)
 */
import type {
  InboxAssignedFilter,
  InboxFilters,
  InboxPriority,
  InboxRangeFilter,
  InboxRatingFilter,
  InboxSentiment,
  InboxSentimentFilter,
  InboxSignalFilter,
  InboxSla,
  InboxSort,
  InboxSource,
  InboxSourceFilter,
  InboxStatus,
  InboxStatusFilter,
  SentimentBasis,
  InboxDimension,
} from './types';

/* ───────────────────────── Anahtar ───────────────────────── */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function inboxKey(source: InboxSource, id: string): string {
  return `${source === 'qr' ? 'qr' : 'cr'}-${id}`;
}

export function parseInboxKey(key: unknown): { source: InboxSource; id: string } | null {
  if (typeof key !== 'string') return null;
  const m = /^(qr|cr)-(.+)$/.exec(key.trim());
  if (!m || !ID_RE.test(m[2])) return null;
  return { source: m[1] === 'qr' ? 'qr' : 'consumption', id: m[2] };
}

/** Eski derin linkler (`/dealer/feedbacks?tab=qr`, `/dealer/reviews?rating=2`) → yeni sorgu. */
export function legacyInboxParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, raw] of Object.entries(input)) {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v == null || v === '') continue;
    if (k === 'tab') {
      if (v === 'qr') out.set('source', 'qr');
      else if (v === 'consumption' || v === 'reviews') out.set('source', 'consumption');
      continue;
    }
    if (k === 'search') {
      out.set('q', v);
      continue;
    }
    out.set(k, v);
  }
  return out;
}

/* ───────────────────────── Filtreler ───────────────────────── */

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export const SOURCE_FILTERS: readonly InboxSourceFilter[] = ['all', 'qr', 'consumption'];
export const STATUS_FILTERS: readonly InboxStatusFilter[] = ['new', 'replied', 'resolved', 'all'];
export const RATING_FILTERS: readonly InboxRatingFilter[] = ['all', '1', '2', '3', '4', '5'];
export const SENTIMENT_FILTERS: readonly InboxSentimentFilter[] = ['all', 'negative', 'neutral', 'positive', 'pending'];
export const SIGNAL_FILTERS: readonly InboxSignalFilter[] = ['all', 'urgent', 'churn', 'trust'];
export const ASSIGNED_FILTERS: readonly InboxAssignedFilter[] = ['all', 'me', 'unassigned'];
export const RANGE_FILTERS: readonly InboxRangeFilter[] = ['all', '7', '30', '90'];
export const SORTS: readonly InboxSort[] = ['newest', 'oldest'];

/** Varsayılan görünüm: "Yeni" (yanıt bekleyenler), en yeni önce. */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  source: 'all',
  status: 'new',
  rating: 'all',
  sentiment: 'all',
  signal: 'all',
  assigned: 'all',
  range: 'all',
  qr: null,
  q: '',
  sort: 'newest',
};

export const INBOX_QUERY_MAX = 120;

export function normalizeInboxQuery(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, INBOX_QUERY_MAX);
}

type RawParams = Record<string, unknown> | { get(key: string): string | null };

function read(params: RawParams, key: string): unknown {
  if (typeof (params as { get?: unknown }).get === 'function') return (params as { get(k: string): string | null }).get(key);
  const v = (params as Record<string, unknown>)[key];
  return Array.isArray(v) ? v[0] : v;
}

export function normalizeInboxFilters(params: RawParams): InboxFilters {
  const qrRaw = read(params, 'qr');
  const source = pick(read(params, 'source'), SOURCE_FILTERS, 'all');
  const qr = typeof qrRaw === 'string' && ID_RE.test(qrRaw) ? qrRaw : null;
  return {
    // QR kodu filtresi yalnız QR kaynağında anlamlı.
    source: qr ? 'qr' : source,
    status: pick(read(params, 'status'), STATUS_FILTERS, DEFAULT_INBOX_FILTERS.status),
    rating: pick(read(params, 'rating'), RATING_FILTERS, 'all'),
    sentiment: pick(read(params, 'sentiment'), SENTIMENT_FILTERS, 'all'),
    signal: pick(read(params, 'signal'), SIGNAL_FILTERS, 'all'),
    assigned: pick(read(params, 'assigned'), ASSIGNED_FILTERS, 'all'),
    range: pick(read(params, 'range'), RANGE_FILTERS, 'all'),
    qr,
    q: normalizeInboxQuery(read(params, 'q')),
    sort: pick(read(params, 'sort'), SORTS, 'newest'),
  };
}

/** "Okundu say" işlemine gidebilecek anahtarlar: yalnız QR (tüketim yorumunda görüldü alanı yok). */
export function viewableKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => parseInboxKey(k)?.source === 'qr');
}

/** Hangi kaynaklar sorgulanır (QR'a özgü filtreler tüketim kaynağını eler). */
export function sourcesFor(filters: Pick<InboxFilters, 'source' | 'signal' | 'qr'>): { qr: boolean; consumption: boolean } {
  const qrOnly = filters.qr !== null || filters.signal === 'urgent' || filters.signal === 'trust';
  return {
    qr: filters.source !== 'consumption',
    consumption: filters.source !== 'qr' && !qrOnly,
  };
}

/* ───────────────────────── İmleç ───────────────────────── */

export type InboxCursor = { at: string; key: string };

export function encodeInboxCursor(c: InboxCursor): string {
  return Buffer.from(JSON.stringify([c.at, c.key]), 'utf8').toString('base64url');
}

export function decodeInboxCursor(raw: string | null | undefined): InboxCursor | null {
  if (!raw || typeof raw !== 'string' || raw.length > 300) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, key] = parsed;
    if (typeof at !== 'string' || typeof key !== 'string') return null;
    if (Number.isNaN(new Date(at).getTime()) || !parseInboxKey(key)) return null;
    return { at, key };
  } catch {
    return null;
  }
}

/** Birleşik sıralamada `a`, `b`'den önce mi gelir? (yeni→eski: daha yeni ya da eşitlikte büyük anahtar) */
export function inboxComesBefore(a: InboxCursor, b: InboxCursor, sort: InboxSort): boolean {
  const ta = new Date(a.at).getTime();
  const tb = new Date(b.at).getTime();
  if (ta !== tb) return sort === 'newest' ? ta > tb : ta < tb;
  return sort === 'newest' ? a.key > b.key : a.key < b.key;
}

/**
 * Bir tablodaki satırın imleçten SONRA gelmesi için Prisma koşulu. `prefix` tablonun anahtar
 * önekidir. Eşit anda önek farklıysa tüm satırlar ya önce ya sonra gelir (sıralama toplamdır).
 */
export function inboxCursorWhere(
  cursor: InboxCursor | null,
  prefix: 'qr' | 'cr',
  sort: InboxSort
): Record<string, unknown> | null {
  if (!cursor) return null;
  const at = new Date(cursor.at);
  const parsed = parseInboxKey(cursor.key)!;
  const cursorPrefix = parsed.source === 'qr' ? 'qr' : 'cr';
  const beyond = sort === 'newest' ? { createdAt: { lt: at } } : { createdAt: { gt: at } };
  if (cursorPrefix === prefix) {
    const idCmp = sort === 'newest' ? { lt: parsed.id } : { gt: parsed.id };
    return { OR: [beyond, { AND: [{ createdAt: at }, { id: idCmp }] }] };
  }
  // newest: anahtar azalan → "cr-" < "qr-"; eşit anda cr satırları qr imlecinden SONRA gelir.
  const sameInstantAfter = sort === 'newest' ? `${prefix}-` < `${cursorPrefix}-` : `${prefix}-` > `${cursorPrefix}-`;
  if (!sameInstantAfter) return beyond;
  return sort === 'newest' ? { createdAt: { lte: at } } : { createdAt: { gte: at } };
}

/**
 * İki tablodan ayrı ayrı `limit + 1` satır çekildikten sonra birleştirir. Her kaynak kendi
 * içinde aynı yönde sıralı gelmelidir. `nextCursor` yalnız gerçekten daha fazla kayıt varken döner.
 */
export function mergeInboxPages<T extends { createdAt: string; key: string }>(
  sources: Array<{ rows: T[]; exhausted: boolean }>,
  limit: number,
  sort: InboxSort
): { items: T[]; nextCursor: string | null } {
  const all = sources.flatMap((s) => s.rows);
  all.sort((a, b) => (inboxComesBefore({ at: a.createdAt, key: a.key }, { at: b.createdAt, key: b.key }, sort) ? -1 : 1));
  const items = all.slice(0, limit);
  const hasMore = all.length > limit || sources.some((s) => !s.exhausted);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeInboxCursor({ at: last.createdAt, key: last.key }) : null };
}

/* ───────────────────────── Duygu, öncelik, SLA ───────────────────────── */

const SENTIMENTS = new Set(['positive', 'neutral', 'negative']);

export function ratingSentiment(rating: number): Exclude<InboxSentiment, 'pending'> {
  if (rating <= 2) return 'negative';
  if (rating >= 4) return 'positive';
  return 'neutral';
}

/**
 * Tek duygu tanımı: AI duygusu varsa o; metinli ama analiz edilmemişse "bekliyor"
 * (nötr yüzle karıştırılmaz); metinsiz ya da analiz sonuçsuzsa puan eşiği.
 */
export function unifiedSentiment(input: {
  sentiment: string | null | undefined;
  rating: number;
  hasText: boolean;
  analyzed: boolean;
}): { sentiment: InboxSentiment; basis: SentimentBasis } {
  const s = (input.sentiment ?? '').toLowerCase();
  if (SENTIMENTS.has(s)) return { sentiment: s as InboxSentiment, basis: 'ai' };
  if (input.hasText && !input.analyzed) return { sentiment: 'pending', basis: 'pending' };
  return { sentiment: ratingSentiment(input.rating), basis: 'rating' };
}

/** Olumsuz (SLA 24 sa): 1–2 yıldız ya da AI duygusu olumsuz. */
export function isNegativeItem(rating: number, sentiment: string | null | undefined): boolean {
  return rating <= 2 || (sentiment ?? '').toLowerCase() === 'negative';
}

export const URGENT_THRESHOLD = 0.7;
export const CHURN_THRESHOLD = 0.7;

export function priorityOf(input: {
  rating: number;
  sentiment: string | null | undefined;
  urgency?: number | null;
  churnRisk?: number | null;
}): InboxPriority {
  if (
    isNegativeItem(input.rating, input.sentiment) ||
    (input.urgency ?? 0) >= URGENT_THRESHOLD ||
    (input.churnRisk ?? 0) >= CHURN_THRESHOLD
  ) {
    return 'high';
  }
  if (input.rating === 3 || (input.sentiment ?? '').toLowerCase() === 'neutral') return 'medium';
  return 'low';
}

export const DEFAULT_SLA_HOURS = { negative: 24, default: 72 } as const;

/** "Yaklaşıyor": kalan süre hedefin %25'inden az ya da 4 saatten az. */
export function computeSla(input: {
  createdAt: Date;
  negative: boolean;
  closed: boolean;
  now: Date;
  hours?: { negative: number; default: number };
}): InboxSla {
  const hours = input.hours ?? DEFAULT_SLA_HOURS;
  const targetHours = input.negative ? hours.negative : hours.default;
  const targetMs = targetHours * 3_600_000;
  const due = new Date(input.createdAt.getTime() + targetMs);
  if (input.closed) return { state: 'done', dueAt: due.toISOString(), targetHours };
  const remaining = due.getTime() - input.now.getTime();
  if (remaining <= 0) return { state: 'overdue', dueAt: due.toISOString(), targetHours };
  const soon = Math.min(targetMs * 0.25, 4 * 3_600_000);
  return { state: remaining <= soon ? 'due_soon' : 'ok', dueAt: due.toISOString(), targetHours };
}

/** Durum: kapanmış vaka > yanıt var > yeni. */
export function deriveStatus(input: { replied: boolean; resolved: boolean }): InboxStatus {
  if (input.resolved) return 'resolved';
  return input.replied ? 'replied' : 'new';
}

/* ───────────────────────── Vaka bağlantısı ───────────────────────── */

/** Vaka (Incident) türleri: gelen kutusunun açtığı + yorum bağlantılı otomatik olaylar. */
export const INBOX_CASE_TYPE = 'inbox_case';
export const LINKED_CASE_TYPES = [INBOX_CASE_TYPE, 'FEEDBACK', 'negative_feedback_sla_breach'] as const;
export const OPEN_CASE_STATUSES = ['open', 'assigned', 'in_progress'] as const;

/** Olay meta verisinden bağlı kayıt anahtarı (`feedbackId` → qr, `consumptionReviewId` → cr). */
export function caseKeyFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.feedbackId === 'string' && ID_RE.test(m.feedbackId)) return inboxKey('qr', m.feedbackId);
  if (typeof m.consumptionReviewId === 'string' && ID_RE.test(m.consumptionReviewId)) {
    return inboxKey('consumption', m.consumptionReviewId);
  }
  return null;
}

export type CaseRow = {
  id: string;
  status: string;
  assignedToId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  metadata: unknown;
};

export type CaseIndexEntry = {
  id: string;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved';
  assignedToId: string | null;
  resolvedAt: Date | null;
  /** Kayda bağlı açık vakaların kimlikleri (kapatırken hepsi kapanır). */
  openIds: string[];
  /** En son kapanmış vaka (yeniden açarken kullanılır). */
  lastResolvedId: string | null;
};

/**
 * Kayıt başına vaka özeti: açık vaka varsa en yenisi (atama oradan), yoksa en son kapanan.
 * `rows` en yeniden eskiye sıralı gelmelidir.
 */
export function buildCaseIndex(rows: readonly CaseRow[]): Map<string, CaseIndexEntry> {
  const index = new Map<string, CaseIndexEntry>();
  for (const row of rows) {
    const key = caseKeyFromMetadata(row.metadata);
    if (!key) continue;
    const isOpen = (OPEN_CASE_STATUSES as readonly string[]).includes(row.status);
    const isResolved = row.status === 'resolved';
    if (!isOpen && !isResolved) continue;
    const existing = index.get(key);
    if (!existing) {
      index.set(key, {
        id: row.id,
        status: isOpen ? (row.status as CaseIndexEntry['status']) : 'resolved',
        assignedToId: row.assignedToId,
        resolvedAt: row.resolvedAt,
        openIds: isOpen ? [row.id] : [],
        lastResolvedId: isResolved ? row.id : null,
      });
      continue;
    }
    if (isOpen) {
      existing.openIds.push(row.id);
      if (existing.status === 'resolved') {
        // Daha eski bir açık vaka varken en yeni kapanmış olan kaydı "çözüldü" yapmaz.
        existing.id = row.id;
        existing.status = row.status as CaseIndexEntry['status'];
        existing.assignedToId = row.assignedToId;
        existing.resolvedAt = null;
      }
    } else if (isResolved && !existing.lastResolvedId) {
      existing.lastResolvedId = row.id;
    }
  }
  return index;
}

/** Vaka dizininden kaynak başına id kümeleri (liste filtreleri için). */
export function caseSets(index: Map<string, CaseIndexEntry>, meId: string) {
  const resolved: Record<InboxSource, string[]> = { qr: [], consumption: [] };
  const assignedToMe: Record<InboxSource, string[]> = { qr: [], consumption: [] };
  const assignedAny: Record<InboxSource, string[]> = { qr: [], consumption: [] };
  for (const [key, entry] of index) {
    const parsed = parseInboxKey(key);
    if (!parsed) continue;
    if (entry.status === 'resolved') {
      resolved[parsed.source].push(parsed.id);
      continue;
    }
    if (entry.assignedToId) {
      assignedAny[parsed.source].push(parsed.id);
      if (entry.assignedToId === meId) assignedToMe[parsed.source].push(parsed.id);
    }
  }
  return { resolved, assignedToMe, assignedAny };
}

/* ───────────────────────── Metin yardımcıları ───────────────────────── */

export function previewText(text: string | null | undefined, max = 220): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function normalizeTopics(raw: unknown, max = 3): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') list = Object.keys(raw as object);
  const out: string[] = [];
  for (const t of list) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (s && s.length <= 40 && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Medya alanından yalnız https görsel bağlantıları (en fazla 6). */
export function normalizeMedia(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    const url = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { url?: unknown }).url : null;
    if (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(url) && url.length <= 2048) out.push(url);
    if (out.length >= 6) break;
  }
  return out;
}

export function hasMedia(raw: unknown): boolean {
  return normalizeMedia(raw).length > 0;
}

/** `actionSuggestions` → kısa öneri metinleri (en fazla 3). */
export function normalizeActionSuggestions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    const text =
      typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { action?: unknown }).action : null;
    if (typeof text === 'string' && text.trim()) out.push(text.trim().slice(0, 200));
    if (out.length >= 3) break;
  }
  return out;
}

const DIMENSION_LABELS: Record<string, { tr: string; en: string }> = {
  taste: { tr: 'Lezzet', en: 'Taste' },
  service: { tr: 'Servis', en: 'Service' },
  ambiance: { tr: 'Ambiyans', en: 'Ambiance' },
  value: { tr: 'Fiyat/performans', en: 'Value' },
  cleanliness: { tr: 'Temizlik', en: 'Cleanliness' },
};

/** Boyut puanları: bilinen anahtarlar, 1–5 tam sayı; bilinmeyen anahtar gizlenir. */
export function normalizeDimensions(raw: unknown, locale: 'tr' | 'en' = 'tr'): InboxDimension[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: InboxDimension[] = [];
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const v = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(v) && v >= 1 && v <= 5) out.push({ key, label: label[locale], value: Math.round(v) });
  }
  return out;
}

export function displayName(name: string | null | undefined): string | null {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  return n ? n.slice(0, 80) : null;
}

/** Kart token'ının yalnız son 4 hanesi (ham token istemciye gitmez). */
export function last4(token: string | null | undefined): string | null {
  if (typeof token !== 'string' || token.length < 4) return null;
  return token.slice(-4);
}

/* ───────────────────────── Yanıt şablonu ───────────────────────── */

export const REPLY_MAX = 2000;

/**
 * Şablon değişkenleri: {{isim}} / {{ad}} (müşteri adının ilk kelimesi), {{ürün}} / {{urun}},
 * {{işletme}} / {{isletme}}. Değeri bilinmeyen değişken (ör. anonim müşteride {{isim}})
 * kibar bir karşılıkla doldurulur; tanınmayan değişken olduğu gibi kalır.
 */
export function fillReplyTemplate(
  template: string,
  vars: { customerName?: string | null; product?: string | null; business?: string | null },
  locale: 'tr' | 'en' = 'tr'
): string {
  const first = (vars.customerName ?? '').trim().split(/\s+/)[0] || '';
  const fallbackName = locale === 'en' ? 'valued guest' : 'değerli misafirimiz';
  const values: Record<string, string> = {
    isim: first || fallbackName,
    ad: first || fallbackName,
    'ürün': (vars.product ?? '').trim() || (locale === 'en' ? 'your order' : 'siparişiniz'),
    urun: (vars.product ?? '').trim() || (locale === 'en' ? 'your order' : 'siparişiniz'),
    'işletme': (vars.business ?? '').trim() || (locale === 'en' ? 'our team' : 'ekibimiz'),
    isletme: (vars.business ?? '').trim() || (locale === 'en' ? 'our team' : 'ekibimiz'),
  };
  return template
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (whole, name: string) => {
      const k = name.toLocaleLowerCase('tr-TR');
      return Object.prototype.hasOwnProperty.call(values, k) ? values[k] : whole;
    })
    .slice(0, REPLY_MAX);
}

/* ───────────────────────── İstatistik ───────────────────────── */

export function median(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function ratio(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export function roundRating(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/* ───────────────────────── CSV ───────────────────────── */

/**
 * CSV hücresi: tırnaklanır; `= + - @ \t \r` ile başlayan hücrelerin önüne `'` eklenir
 * (OWASP CSV Injection) — müşteri metni Excel'de formül olarak çalışamaz.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines = [header.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  // BOM: Excel Türkçe karakterleri doğru açsın.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Aralık filtresi için başlangıç günü sayısı (null = tüm zamanlar). */
export function rangeDays(range: InboxRangeFilter): number | null {
  return range === 'all' ? null : Number(range);
}
