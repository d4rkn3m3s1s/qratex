/**
 * QR kodlar ve şubeler (/dealer/qr-codes) — SAF kurallar (istemci + sunucu ortak).
 * Denetim: docs/audit/2026-10-08/bayi/dealer_qr-codes.md
 *
 *  - Durum türetme tek yerde (`deriveQrStatus`): arşiv > iptal > süresi dolmuş > duraklatıldı > aktif.
 *    Liste filtresi (`statusWhere`) ve rozet aynı tanımı kullanır (eskiden "Aktif" sayacı iptal
 *    edilmiş/süresi dolmuş kodları da sayıyordu — rapor #11, Bulgu 5).
 *  - Zod şemaları hem `defineRoute` hem form tarafından kullanılır (tek kaynak).
 *  - Baskı rengi kontrol kuralları (WCAG göreli parlaklık): QR okuyucular koyu-üstüne-açık ister;
 *    kontrast < 4,5 ya da ters renk reddedilir (rapor #43-44).
 */
import { z } from 'zod';

// ───────────────────────────── Sabitler ─────────────────────────────

export const QR_PAGE_SIZE = 24;
export const QR_NAME_MIN = 2;
export const QR_NAME_MAX = 100;
export const QR_DESCRIPTION_MAX = 500;
/** Seri oluşturmada tek istekte en fazla kod ("Masa 1–N"). */
export const QR_SERIES_MAX = 50;
/** Toplu işlem / toplu baskı tavanı. */
export const QR_BULK_MAX = 200;
export const QR_PRINT_MAX = 50;
/** "Süresi yaklaşıyor" penceresi. */
export const QR_EXPIRING_DAYS = 7;
/** Karşılama bağlantısı (segment) sayısı tavanı. */
export const QR_LINKS_MAX = 8;
export const QR_WELCOME_MAX = 280;
export const QR_CTA_MAX = 40;
export const LOCATION_NAME_MAX = 80;
export const LOCATION_ADDRESS_MAX = 300;
/** Kartlardaki istatistik penceresi (gün). */
export const QR_STATS_DAYS = 30;
/** Kart mini çizgisi (gün). */
export const QR_SPARK_DAYS = 14;

const DAY_MS = 86_400_000;

// ───────────────────────────── Durum ─────────────────────────────

export type QrStatus = 'active' | 'paused' | 'expired' | 'revoked' | 'archived';
export type QrStatusFilter = 'all' | 'active' | 'paused' | 'expiring' | 'expired' | 'revoked' | 'archived';
export const QR_STATUS_FILTERS: readonly QrStatusFilter[] = ['all', 'active', 'paused', 'expiring', 'expired', 'revoked', 'archived'];

export interface QrLifecycleFields {
  isActive: boolean;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  archivedAt: Date | string | null;
}

function toTime(v: Date | string | null): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Tek durum tanımı. Sunucu saatine göre hesaplanır (istemci saatine güvenilmez). */
export function deriveQrStatus(qr: QrLifecycleFields, now: Date): QrStatus {
  if (qr.archivedAt) return 'archived';
  if (qr.revokedAt) return 'revoked';
  const exp = toTime(qr.expiresAt);
  if (exp != null && exp <= now.getTime()) return 'expired';
  if (!qr.isActive) return 'paused';
  return 'active';
}

/** Aktif ve süresi `QR_EXPIRING_DAYS` içinde dolacak mı? */
export function isExpiringSoon(qr: QrLifecycleFields, now: Date): boolean {
  if (deriveQrStatus(qr, now) !== 'active') return false;
  const exp = toTime(qr.expiresAt);
  return exp != null && exp - now.getTime() <= QR_EXPIRING_DAYS * DAY_MS;
}

/** Kota tüketen "canlı" kod: iptal ve arşiv dışı (lib/qr-quota `liveQrWhere` ile aynı). */
export function isLive(qr: Pick<QrLifecycleFields, 'revokedAt' | 'archivedAt'>): boolean {
  return !qr.revokedAt && !qr.archivedAt;
}

/** Prisma `where` parçası (dealerId ayrıca eklenir). Saf nesne — test edilebilir. */
export function statusWhere(filter: QrStatusFilter, now: Date): Record<string, unknown> {
  const soon = new Date(now.getTime() + QR_EXPIRING_DAYS * DAY_MS);
  const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  switch (filter) {
    case 'archived':
      return { archivedAt: { not: null } };
    case 'revoked':
      return { archivedAt: null, revokedAt: { not: null } };
    case 'expired':
      return { archivedAt: null, revokedAt: null, expiresAt: { lte: now } };
    case 'paused':
      return { archivedAt: null, revokedAt: null, isActive: false, ...notExpired };
    case 'expiring':
      return { archivedAt: null, revokedAt: null, isActive: true, expiresAt: { gt: now, lte: soon } };
    case 'active':
      return { archivedAt: null, revokedAt: null, isActive: true, ...notExpired };
    case 'all':
    default:
      return { archivedAt: null };
  }
}

// ───────────────────────────── Arama ─────────────────────────────

/** Türkçe katlama: "İ/ı" ve aksanlar arama karşılaştırmasında sorun çıkarmasın. */
export function foldTr(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .trim();
}

// ───────────────────────────── Liste sorgusu ─────────────────────────────

export const QR_SORTS = ['newest', 'oldest', 'name', 'expiry'] as const;
export type QrSort = (typeof QR_SORTS)[number];

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const qrListQuerySchema = z.object({
  q: trimmedOptional(80),
  /** Eski global arama derin linki `?search=` (rapor #15). */
  search: trimmedOptional(80),
  status: z.enum(QR_STATUS_FILTERS as [QrStatusFilter, ...QrStatusFilter[]]).catch('all').default('all'),
  /** Şube kimliği, `none` (şubesiz) ya da boş (hepsi). */
  location: trimmedOptional(64),
  sort: z.enum(QR_SORTS).catch('newest').default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type QrListQuery = z.infer<typeof qrListQuerySchema>;

export interface QrListFilters {
  q: string | null;
  status: QrStatusFilter;
  location: string | null;
  sort: QrSort;
  page: number;
}

export function normalizeQrFilters(raw: Partial<Record<string, unknown>>): QrListFilters {
  const parsed = qrListQuerySchema.safeParse(raw);
  const v = parsed.success ? parsed.data : qrListQuerySchema.parse({});
  return {
    q: v.q ?? v.search ?? null,
    status: v.status,
    location: v.location ?? null,
    sort: v.sort,
    page: v.page,
  };
}

/** URL'ye yazılacak (varsayılanları atlayan) sorgu parametreleri. */
export function filtersToSearchParams(f: QrListFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.status !== 'all') p.set('status', f.status);
  if (f.location) p.set('location', f.location);
  if (f.sort !== 'newest') p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

// ───────────────────────────── Yazma şemaları ─────────────────────────────

const qrName = z
  .string({ required_error: 'Ad gerekli' })
  .trim()
  .min(QR_NAME_MIN, `Ad en az ${QR_NAME_MIN} karakter olmalı`)
  .max(QR_NAME_MAX, `Ad en fazla ${QR_NAME_MAX} karakter olabilir`);

const qrDescription = z
  .string()
  .trim()
  .max(QR_DESCRIPTION_MAX, `Açıklama en fazla ${QR_DESCRIPTION_MAX} karakter olabilir`)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const idRef = z.string().trim().min(1).max(64);

/** `YYYY-MM-DD` (İstanbul günü; o günün sonunda, 23:59:59 İstanbul, sona erer) ya da null. */
const expiryDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı')
  .nullable()
  .optional();

export const qrCreateSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('single'),
    name: qrName,
    description: qrDescription,
    locationId: idRef.nullable().optional(),
    expiresOn: expiryDay,
  }),
  z.object({
    mode: z.literal('series'),
    /** "Masa" → "Masa 1", "Masa 2", … */
    prefix: z
      .string({ required_error: 'Ön ek gerekli' })
      .trim()
      .min(1, 'Ön ek gerekli')
      .max(QR_NAME_MAX - 6, 'Ön ek çok uzun'),
    from: z.number({ invalid_type_error: 'Başlangıç sayı olmalı' }).int().min(0).max(9999),
    to: z.number({ invalid_type_error: 'Bitiş sayı olmalı' }).int().min(0).max(9999),
    description: qrDescription,
    locationId: idRef.nullable().optional(),
    expiresOn: expiryDay,
  }),
]).superRefine((v, ctx) => {
  if (v.mode !== 'series') return;
  if (v.to < v.from) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitiş başlangıçtan küçük olamaz', path: ['to'] });
  else if (v.to - v.from + 1 > QR_SERIES_MAX)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Tek seferde en fazla ${QR_SERIES_MAX} kod oluşturulabilir`, path: ['to'] });
});
export type QrCreateInput = z.infer<typeof qrCreateSchema>;

export function seriesNames(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to && out.length < QR_SERIES_MAX; i++) out.push(`${prefix.trim()} ${i}`);
  return out;
}

/** Karşılama bağlantısı anahtarı (huni sayfası `?segment=` ile aynı alfabe, daha dar). */
export const LINK_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export const qrLinkSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(LINK_KEY_RE, 'Anahtar 2-32 karakter; küçük harf, rakam, - ve _ kullanılabilir'),
  welcomeText: z
    .string()
    .trim()
    .min(2, 'Karşılama metni en az 2 karakter olmalı')
    .max(QR_WELCOME_MAX, `Karşılama metni en fazla ${QR_WELCOME_MAX} karakter olabilir`),
});
export type QrLink = z.infer<typeof qrLinkSchema>;

/** Düzenlemede `undefined` = dokunma; `null`/'' = temizle (oluşturmadaki dönüşüm undefined'ı null'a çevirirdi). */
const qrDescriptionPatch = z
  .string()
  .trim()
  .max(QR_DESCRIPTION_MAX, `Açıklama en fazla ${QR_DESCRIPTION_MAX} karakter olabilir`)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

export const qrUpdateSchema = z
  .object({
    name: qrName.optional(),
    description: qrDescriptionPatch,
    locationId: idRef.nullable().optional(),
    expiresOn: expiryDay,
    isActive: z.boolean().optional(),
    links: z
      .array(qrLinkSchema)
      .max(QR_LINKS_MAX, `En fazla ${QR_LINKS_MAX} karşılama bağlantısı eklenebilir`)
      .optional()
      .refine((arr) => !arr || new Set(arr.map((l) => l.key)).size === arr.length, {
        message: 'Aynı anahtar iki kez kullanılamaz',
      }),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Değiştirilecek alan yok' });
export type QrUpdateInput = z.infer<typeof qrUpdateSchema>;
/** İstemcinin gönderdiği gövde (dönüşüm öncesi). */
export type QrUpdateBody = z.input<typeof qrUpdateSchema>;

export const QR_LIFECYCLE_ACTIONS = ['revoke', 'unrevoke', 'archive', 'restore', 'rotate'] as const;
export type QrLifecycleAction = (typeof QR_LIFECYCLE_ACTIONS)[number];
export const qrLifecycleSchema = z.object({ action: z.enum(QR_LIFECYCLE_ACTIONS) });

export const qrBulkSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
  ids: z.array(idRef).min(1, 'En az bir kod seçin').max(QR_BULK_MAX, `Tek seferde en fazla ${QR_BULK_MAX} kod`),
});

export const locationCreateSchema = z.object({
  name: z.string().trim().min(2, 'Şube adı en az 2 karakter olmalı').max(LOCATION_NAME_MAX),
  address: z
    .string()
    .trim()
    .max(LOCATION_ADDRESS_MAX)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

export const locationUpdateSchema = z.union([
  z.object({ action: z.enum(['archive', 'restore']) }),
  z.object({
    name: z.string().trim().min(2, 'Şube adı en az 2 karakter olmalı').max(LOCATION_NAME_MAX).optional(),
    address: z
      .string()
      .trim()
      .max(LOCATION_ADDRESS_MAX)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
  }),
]);

// ───────────────────────────── Karşılama bağlantıları ↔ segmentConfig ─────────────────────────────

/** `QRCode.segmentConfig` (`{ anahtar: { welcomeText } }`) → bağlantı listesi. Bozuk girdiler atlanır. */
export function linksFromSegmentConfig(cfg: unknown): QrLink[] {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return [];
  const out: QrLink[] = [];
  for (const [key, entry] of Object.entries(cfg as Record<string, unknown>)) {
    if (!LINK_KEY_RE.test(key) || !entry || typeof entry !== 'object') continue;
    const text = (entry as { welcomeText?: unknown }).welcomeText;
    if (typeof text === 'string' && text.trim()) out.push({ key, welcomeText: text.trim().slice(0, QR_WELCOME_MAX) });
    if (out.length >= QR_LINKS_MAX) break;
  }
  return out;
}

export function segmentConfigFromLinks(links: QrLink[]): Record<string, { welcomeText: string }> | null {
  if (links.length === 0) return null;
  const out: Record<string, { welcomeText: string }> = {};
  for (const l of links) out[l.key] = { welcomeText: l.welcomeText };
  return out;
}

/** Bağlantı URL'si: kanonik hedef + `?segment=` + isteğe bağlı UTM (yalnız oluşturucu; saklanmaz). */
export function buildLinkUrl(
  targetUrl: string,
  opts: { segment?: string | null; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null } = {}
): string {
  const params = new URLSearchParams();
  if (opts.segment) params.set('segment', opts.segment);
  const clean = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, '-').slice(0, 64);
  if (clean(opts.utmSource)) params.set('utm_source', clean(opts.utmSource));
  if (clean(opts.utmMedium)) params.set('utm_medium', clean(opts.utmMedium));
  if (clean(opts.utmCampaign)) params.set('utm_campaign', clean(opts.utmCampaign));
  const qs = params.toString();
  return qs ? `${targetUrl}?${qs}` : targetUrl;
}

// ───────────────────────────── Son kullanma (İstanbul) ─────────────────────────────

/** `YYYY-MM-DD` İstanbul gününün SONU (23:59:59.999 +03:00). Türkiye 2016'dan beri sabit UTC+3. */
export function istanbulDayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999+03:00`);
}

/** Tarih → İstanbul günü `YYYY-MM-DD`. */
export function istanbulDay(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// ───────────────────────────── Baskı ─────────────────────────────

export const PRINT_TEMPLATES = ['card', 'tent', 'sticker', 'plain'] as const;
export type PrintTemplate = (typeof PRINT_TEMPLATES)[number];
export const PRINT_FORMATS = ['svg', 'pdf'] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const printQuerySchema = z.object({
  ids: z
    .string()
    .trim()
    .min(1, 'Kod seçin')
    .transform((s) => Array.from(new Set(s.split(',').map((x) => x.trim()).filter(Boolean))))
    .pipe(z.array(idRef).min(1, 'Kod seçin').max(QR_PRINT_MAX, `Tek baskıda en fazla ${QR_PRINT_MAX} kod`)),
  template: z.enum(PRINT_TEMPLATES).default('card'),
  format: z.enum(PRINT_FORMATS).default('pdf'),
  fg: z.string().regex(HEX_RE, 'Renk #RRGGBB olmalı').default('#111111'),
  bg: z.string().regex(HEX_RE, 'Renk #RRGGBB olmalı').default('#FFFFFF'),
  cta: z.string().trim().max(QR_CTA_MAX).optional(),
  /** Karşılama bağlantısı anahtarı (QR içeriğine `?segment=` olarak girer). */
  link: z.string().trim().regex(LINK_KEY_RE).optional(),
});
export type PrintQuery = z.infer<typeof printQuerySchema>;

export interface PrintStyle {
  fg: string;
  bg: string;
  cta: string;
}

export const DEFAULT_CTA = 'Deneyiminizi puanlayın';

export const PRINT_PRESETS: ReadonlyArray<{ id: string; label: string; fg: string; bg: string }> = [
  { id: 'classic', label: 'Klasik', fg: '#111111', bg: '#FFFFFF' },
  { id: 'brand', label: 'Mor', fg: '#5B21B6', bg: '#FFFFFF' },
  { id: 'navy', label: 'Lacivert', fg: '#1E3A8A', bg: '#F8FAFC' },
  { id: 'forest', label: 'Orman', fg: '#14532D', bg: '#F7FEE7' },
  { id: 'cream', label: 'Krem', fg: '#3F2A14', bg: '#FFF7E6' },
];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_QR_CONTRAST = 4.5;

export type ColorVerdict = { ok: true; ratio: number } | { ok: false; ratio: number; reason: 'low_contrast' | 'inverted' };

/** Basılacak renk çifti okunur mu? Ters (açık QR, koyu zemin) birçok okuyucuda çalışmaz → red. */
export function checkPrintColors(fg: string, bg: string): ColorVerdict {
  if (!HEX_RE.test(fg) || !HEX_RE.test(bg)) return { ok: false, ratio: 1, reason: 'low_contrast' };
  const ratio = contrastRatio(fg, bg);
  if (relativeLuminance(fg) >= relativeLuminance(bg)) return { ok: false, ratio, reason: 'inverted' };
  if (ratio < MIN_QR_CONTRAST) return { ok: false, ratio, reason: 'low_contrast' };
  return { ok: true, ratio };
}

/** Dosya adı için ASCII güvenli parça. */
export function fileSlug(s: string): string {
  const map: Record<string, string> = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' };
  const out = s
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return out || 'qr';
}

// ───────────────────────────── Form (istemci) ─────────────────────────────

/**
 * Oluşturma formunun düz şeması (RHF ayrık birleşimle zor çalışır). Gönderimde
 * `toCreateInput` ile API şemasına çevrilir; sunucu `qrCreateSchema` ile yeniden doğrular.
 */
export const qrCreateFormSchema = z
  .object({
    mode: z.enum(['single', 'series']),
    name: z.string().trim().max(QR_NAME_MAX, `Ad en fazla ${QR_NAME_MAX} karakter olabilir`),
    prefix: z.string().trim().max(QR_NAME_MAX - 6, 'Ön ek çok uzun'),
    from: z.number({ invalid_type_error: 'Sayı girin' }).int().min(0).max(9999).nullable(),
    to: z.number({ invalid_type_error: 'Sayı girin' }).int().min(0).max(9999).nullable(),
    description: z.string().trim().max(QR_DESCRIPTION_MAX, `Açıklama en fazla ${QR_DESCRIPTION_MAX} karakter olabilir`),
    locationId: z.string(),
    expiresOn: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'single') {
      if (v.name.length < QR_NAME_MIN) ctx.addIssue({ code: 'custom', path: ['name'], message: `Ad en az ${QR_NAME_MIN} karakter olmalı` });
    } else {
      if (!v.prefix) ctx.addIssue({ code: 'custom', path: ['prefix'], message: 'Ön ek gerekli' });
      if (v.from == null) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Başlangıç gerekli' });
      if (v.to == null) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Bitiş gerekli' });
      if (v.from != null && v.to != null) {
        if (v.to < v.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Bitiş başlangıçtan küçük olamaz' });
        else if (v.to - v.from + 1 > QR_SERIES_MAX)
          ctx.addIssue({ code: 'custom', path: ['to'], message: `Tek seferde en fazla ${QR_SERIES_MAX} kod oluşturulabilir` });
      }
    }
    if (v.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(v.expiresOn)) {
      ctx.addIssue({ code: 'custom', path: ['expiresOn'], message: 'Geçerli bir tarih seçin' });
    }
  });
export type QrCreateForm = z.infer<typeof qrCreateFormSchema>;

/** Şube seçiminde "şubesiz" değeri. */
export const NO_LOCATION = 'none';

export function toCreateInput(v: QrCreateForm): QrCreateInput {
  const common = {
    description: v.description || null,
    locationId: v.locationId && v.locationId !== NO_LOCATION ? v.locationId : null,
    expiresOn: v.expiresOn || null,
  };
  return v.mode === 'single'
    ? { mode: 'single', name: v.name, ...common }
    : { mode: 'series', prefix: v.prefix, from: v.from ?? 1, to: v.to ?? 1, ...common };
}

/** Seri önizlemesi: kaç kod, ilk/son ad. */
export function seriesPreview(prefix: string, from: number | null, to: number | null): { count: number; first: string; last: string } | null {
  if (!prefix.trim() || from == null || to == null || to < from) return null;
  const count = to - from + 1;
  return { count, first: `${prefix.trim()} ${from}`, last: `${prefix.trim()} ${to}` };
}
