/**
 * Kasa + İşlem Defteri — saf mantık (React/Prisma yok; jest ile test edilir).
 *
 * Yüzey: /dealer/scan (Kasa modu) ve /dealer/consumptions (İşlem defteri).
 * Zaman: bütün gün sınırları Europe/Istanbul (UTC+3, yaz saati yok).
 */

export const ISTANBUL_OFFSET = '+03:00';
const DAY_MS = 86_400_000;

/** Kayıt bu süre içinde (ve henüz değerlendirilmemişse) geri alınabilir. */
export const VOID_WINDOW_MS = 15 * 60_000;
/** Aynı kart + bayi için SCANNED denetim kaydı bu pencerede tekilleşir. */
export const SCAN_AUDIT_DEDUPE_MS = 60_000;
export const LEDGER_PAGE_SIZE = 20;
export const EXPORT_MAX_ROWS = 5000;
export const NOTE_MAX = 500;
export const AMOUNT_MAX = 1_000_000;

// ───────────────────────────── Zaman ─────────────────────────────

/** İstanbul takvim günü anahtarı (YYYY-MM-DD). */
export function istanbulDayKey(d: Date): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** İstanbul gününün başlangıcı (UTC Date). */
export function istanbulDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00${ISTANBUL_OFFSET}`);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const t = istanbulDayStart(v).getTime();
  return Number.isFinite(t) && istanbulDayKey(new Date(t)) === v;
}

// ───────────────────────────── Defter filtreleri ─────────────────────────────

export const LEDGER_RANGES = ['today', '7d', '30d', '90d', 'all', 'custom'] as const;
export type LedgerRange = (typeof LEDGER_RANGES)[number];
export const LEDGER_RATINGS = ['all', 'none', 'low', 'mid', 'high'] as const;
export type LedgerRating = (typeof LEDGER_RATINGS)[number];
export const LEDGER_SORTS = ['new', 'old', 'amount_desc', 'amount_asc'] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

export interface LedgerFilters {
  range: LedgerRange;
  from: string | null;
  to: string | null;
  rating: LedgerRating;
  productId: string | null;
  q: string;
  sort: LedgerSort;
  page: number;
}

export const DEFAULT_LEDGER_FILTERS: LedgerFilters = {
  range: '30d',
  from: null,
  to: null,
  rating: 'all',
  productId: null,
  q: '',
  sort: 'new',
  page: 1,
};

type ParamSource = { get(key: string): string | null } | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string {
  if (typeof (src as { get?: unknown }).get === 'function') return ((src as { get(k: string): string | null }).get(key) ?? '').trim();
  const v = (src as Record<string, string | string[] | undefined>)[key];
  return ((Array.isArray(v) ? v[0] : v) ?? '').trim();
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** URL/sorgu parametrelerinden doğrulanmış filtre. Geçersiz değer varsayılana düşer. */
export function parseLedgerFilters(src: ParamSource): LedgerFilters {
  const rangeRaw = read(src, 'range');
  let range = (LEDGER_RANGES as readonly string[]).includes(rangeRaw) ? (rangeRaw as LedgerRange) : DEFAULT_LEDGER_FILTERS.range;
  let from = read(src, 'from');
  let to = read(src, 'to');
  if (range === 'custom') {
    if (!isDayKey(from) || !isDayKey(to)) range = DEFAULT_LEDGER_FILTERS.range;
    else if (from > to) [from, to] = [to, from];
  }
  const ratingRaw = read(src, 'rating');
  const sortRaw = read(src, 'sort');
  const productRaw = read(src, 'product');
  const q = read(src, 'q').replace(/\s+/g, ' ').slice(0, 80);
  const page = Number.parseInt(read(src, 'page'), 10);
  return {
    range,
    from: range === 'custom' ? from : null,
    to: range === 'custom' ? to : null,
    rating: (LEDGER_RATINGS as readonly string[]).includes(ratingRaw) ? (ratingRaw as LedgerRating) : 'all',
    productId: ID_RE.test(productRaw) ? productRaw : null,
    q: q.length >= 2 ? q : '',
    sort: (LEDGER_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as LedgerSort) : 'new',
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** Filtreyi URL parametrelerine yazar (varsayılanlar yazılmaz → kısa, paylaşılabilir URL). */
export function ledgerFiltersToParams(f: LedgerFilters, opts: { includePage?: boolean } = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (f.range !== DEFAULT_LEDGER_FILTERS.range) p.set('range', f.range);
  if (f.range === 'custom' && f.from && f.to) {
    p.set('from', f.from);
    p.set('to', f.to);
  }
  if (f.rating !== 'all') p.set('rating', f.rating);
  if (f.productId) p.set('product', f.productId);
  if (f.q) p.set('q', f.q);
  if (f.sort !== 'new') p.set('sort', f.sort);
  if (opts.includePage !== false && f.page > 1) p.set('page', String(f.page));
  return p;
}

export interface DateWindow {
  /** Dahil. `null` → alt sınır yok ("tümü"). */
  from: Date | null;
  /** Hariç. */
  to: Date;
}

/** Seçili aralığın İstanbul günlerine hizalı penceresi. */
export function resolveLedgerWindow(f: Pick<LedgerFilters, 'range' | 'from' | 'to'>, now: Date): DateWindow {
  const today = istanbulDayKey(now);
  const tomorrow = new Date(istanbulDayStart(today).getTime() + DAY_MS);
  switch (f.range) {
    case 'today':
      return { from: istanbulDayStart(today), to: tomorrow };
    case '7d':
      return { from: new Date(tomorrow.getTime() - 7 * DAY_MS), to: tomorrow };
    case '30d':
      return { from: new Date(tomorrow.getTime() - 30 * DAY_MS), to: tomorrow };
    case '90d':
      return { from: new Date(tomorrow.getTime() - 90 * DAY_MS), to: tomorrow };
    case 'custom':
      if (f.from && f.to) {
        return { from: istanbulDayStart(f.from), to: new Date(istanbulDayStart(f.to).getTime() + DAY_MS) };
      }
      return resolveLedgerWindow({ range: '30d', from: null, to: null }, now);
    case 'all':
    default:
      return { from: null, to: tomorrow };
  }
}

/** Kıyas için bir önceki eşit uzunluktaki pencere ("tümü"de yok). */
export function previousWindow(w: DateWindow): DateWindow | null {
  if (!w.from) return null;
  const len = w.to.getTime() - w.from.getTime();
  return { from: new Date(w.from.getTime() - len), to: w.from };
}

/** Puan kovası → yıldız aralığı (silinmiş yorum "değerlendirilmedi" sayılır). */
export function ratingBounds(r: LedgerRating): { min: number; max: number } | 'none' | null {
  switch (r) {
    case 'low':
      return { min: 1, max: 2 };
    case 'mid':
      return { min: 3, max: 3 };
    case 'high':
      return { min: 4, max: 5 };
    case 'none':
      return 'none';
    default:
      return null;
  }
}

export function ratingTone(rating: number | null): 'danger' | 'neutral' | 'success' | null {
  if (rating == null) return null;
  if (rating <= 2) return 'danger';
  if (rating === 3) return 'neutral';
  return 'success';
}

// ───────────────────────────── Özet ─────────────────────────────

export interface LedgerSummaryNumbers {
  count: number;
  revenue: number;
  /** Tutarı girilmiş kayıtların ortalaması; yoksa null. */
  avgBasket: number | null;
  reviewed: number;
  /** Değerlendirilen ÷ işlem (0-100); işlem yoksa null. */
  reviewRate: number | null;
  uniqueCustomers: number;
  /** Aralıkta ≥2 işlem yapan müşteri oranı (0-100); müşteri yoksa null. */
  repeatRate: number | null;
}

export function buildSummary(input: {
  count: number;
  revenue: number | null;
  amountCount: number;
  reviewed: number;
  customerCounts: number[];
}): LedgerSummaryNumbers {
  const revenue = round2(input.revenue ?? 0);
  const unique = input.customerCounts.length;
  const repeat = input.customerCounts.filter((n) => n >= 2).length;
  return {
    count: input.count,
    revenue,
    avgBasket: input.amountCount > 0 ? round2(revenue / input.amountCount) : null,
    reviewed: input.reviewed,
    reviewRate: input.count > 0 ? round1((input.reviewed / input.count) * 100) : null,
    uniqueCustomers: unique,
    repeatRate: unique > 0 ? round1((repeat / unique) * 100) : null,
  };
}

/** Göreli değişim (%). Önceki 0/yoksa null (sonsuz artış uydurulmaz). */
export function pctDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return round1(((cur - prev) / Math.abs(prev)) * 100);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ───────────────────────────── Kimlik maskeleme ─────────────────────────────

/** "Ayşe Kaya Demir" → "Ayşe D." ; boş → null (kasa ekranında omuz üstü gizlilik). */
export function maskCustomerName(name: string | null | undefined): string | null {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toLocaleUpperCase('tr-TR')}.`;
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const a = parts[0].charAt(0);
  const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (a + b).toLocaleUpperCase('tr-TR');
}

export function cardLast4(token: string | null | undefined): string {
  return typeof token === 'string' && token.length >= 4 ? token.slice(-4) : '';
}

// ───────────────────────────── Geri alma ─────────────────────────────

export type VoidBlock = 'window' | 'reviewed' | null;

/** Geri alınabilir mi? (sunucu da aynı kuralı uygular; istemci yalnız düğmeyi gösterir). */
export function voidBlockReason(params: { createdAt: Date | string; hasReview: boolean; now: Date }): VoidBlock {
  if (params.hasReview) return 'reviewed';
  const created = new Date(params.createdAt).getTime();
  if (!Number.isFinite(created) || params.now.getTime() - created > VOID_WINDOW_MS) return 'window';
  return null;
}

export function voidDeadline(createdAt: Date | string): number {
  return new Date(createdAt).getTime() + VOID_WINDOW_MS;
}

// ───────────────────────────── Tutar girişi ─────────────────────────────

/**
 * Kasiyerin yazdığı tutar → sayı. "1.250" (TR binlik), "1.250,50", "12,5", "12.5" desteklenir.
 * Boş → null; geçersiz/negatif/üst sınır aşımı → NaN.
 */
export function parseAmountInput(raw: string): number | null {
  const s = raw.trim().replace(/\s|₺|TL/gi, '');
  if (!s) return null;
  let v = s;
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    v = lastComma > lastDot ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (lastComma > -1) {
    v = /^\d{1,3}(,\d{3})+$/.test(v) ? v.replace(/,/g, '') : v.replace(',', '.');
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(v)) {
    v = v.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(v)) return Number.NaN;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0 || n > AMOUNT_MAX) return Number.NaN;
  return Math.round(n * 100) / 100;
}

/**
 * Fiş OCR metninden toplam tutar. "TOPLAM/TUTAR/TOTAL" satırı öncelikli; yoksa metindeki en
 * büyük makul tutar. TR binlik ("1.250") 1250 okunur (eskiden 1,25 okunuyordu).
 */
export function extractReceiptTotal(raw: string): number | null {
  if (!raw) return null;
  const text = raw.replace(/ /g, ' ');
  const pattern = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
  const toNum = (s: string) => {
    const n = parseAmountInput(s);
    return n !== null && Number.isFinite(n) && n > 0 ? n : null;
  };
  const preferred = text
    .split(/\r?\n/)
    .filter((l) => /topl?am|tutar|genel|[oö]denecek|total/i.test(l))
    .pop();
  if (preferred) {
    const nums = (preferred.match(pattern) ?? []).map(toNum).filter((n): n is number => n !== null);
    if (nums.length) return Math.max(...nums);
  }
  const all = (text.match(pattern) ?? []).map(toNum).filter((n): n is number => n !== null && n < AMOUNT_MAX);
  return all.length ? Math.max(...all) : null;
}

// ───────────────────────────── CSV ─────────────────────────────

/** CSV hücresi: tırnak kaçışı + formül enjeksiyonu (= + - @ sekme) nötrleme. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(';');
}

/** İstanbul yerel tarih-saat "YYYY-MM-DD HH:mm". */
export function istanbulDateTime(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 16)}`;
}

// ───────────────────────────── Çevrimdışı kuyruk ─────────────────────────────

export interface QueuedConsumption {
  clientOpId: string;
  cardToken: string;
  customerLabel: string | null;
  productId: string | null;
  productName: string | null;
  amount: number | null;
  note: string | null;
  queuedAt: number;
  /** Kalıcı ret (kart bloklu vb.) — kullanıcı görüp kaldırır; tekrar denenmez. */
  failed?: { code: string | null; message: string } | null;
}

export const QUEUE_MAX = 200;

export function enqueue(queue: QueuedConsumption[], item: QueuedConsumption): QueuedConsumption[] {
  if (queue.some((q) => q.clientOpId === item.clientOpId)) return queue;
  return [...queue, item].slice(-QUEUE_MAX);
}

export function pendingItems(queue: QueuedConsumption[]): QueuedConsumption[] {
  return queue.filter((q) => !q.failed);
}

export type ReplayOutcome = 'done' | 'retry-later' | 'rejected';

/**
 * POST yanıtını kuyruk kararına çevirir: 2xx (yinelenen dahil) → done; ağ hatası, 408, 429,
 * 5xx → sonra tekrar; diğer 4xx (kart bloklu, ürün yok, doğrulama) → kalıcı ret.
 */
export function classifyReplay(status: number | null): ReplayOutcome {
  if (status === null) return 'retry-later';
  if (status >= 200 && status < 300) return 'done';
  if (status === 408 || status === 429 || status >= 500 || status === 401) return 'retry-later';
  return 'rejected';
}

export function sanitizeQueue(raw: unknown): QueuedConsumption[] {
  if (!Array.isArray(raw)) return [];
  const out: QueuedConsumption[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.clientOpId !== 'string' || !/^[A-Za-z0-9_.:-]{8,100}$/.test(o.clientOpId)) continue;
    if (typeof o.cardToken !== 'string' || !o.cardToken || o.cardToken.length > 200) continue;
    const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount >= 0 && o.amount <= AMOUNT_MAX ? o.amount : null;
    out.push({
      clientOpId: o.clientOpId,
      cardToken: o.cardToken,
      customerLabel: typeof o.customerLabel === 'string' ? o.customerLabel.slice(0, 80) : null,
      productId: typeof o.productId === 'string' && ID_RE.test(o.productId) ? o.productId : null,
      productName: typeof o.productName === 'string' ? o.productName.slice(0, 120) : null,
      amount,
      note: typeof o.note === 'string' ? o.note.slice(0, NOTE_MAX) : null,
      queuedAt: typeof o.queuedAt === 'number' ? o.queuedAt : Date.now(),
      failed:
        o.failed && typeof o.failed === 'object'
          ? {
              code: typeof (o.failed as Record<string, unknown>).code === 'string' ? ((o.failed as Record<string, unknown>).code as string) : null,
              message: String((o.failed as Record<string, unknown>).message ?? '').slice(0, 200),
            }
          : null,
    });
  }
  return out.slice(-QUEUE_MAX);
}
