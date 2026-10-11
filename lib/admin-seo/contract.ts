/**
 * Admin → SEO Motoru (/admin/seo) sözleşmesi — SAF (DB/Next yok), istemci + sunucu + test ortak.
 *
 * Tek kaynak zod şeması: PUT, sürüm geri yükleme, JSON içe aktarma ve istemci doğrulaması
 * aynı şemayı kullanır (denetim bulgu 6). Site URL zorunlu http(s) mutlak adres (P0-39 / D2
 * güvencesi `lib/seo-url.ts` ile birlikte; boş/bozuk değer hiçbir katmanda siteyi düşürmez).
 */
import { z } from 'zod';
import { isHttpUrl, normalizeOgImageUrl } from '@/lib/seo-url';

// ───────────────────────────── Desteklenen sayfalar (override registry) ─────────────────────────────

/**
 * Sayfa bazlı başlık/açıklama/canonical ezmesini GERÇEKTEN okuyan public rotalar
 * (`getPageSeo` tüketicileri: lib/landing/seo.ts, lib/legal/seo.ts, app/(okuma)/blog).
 * Listede olmayan yola override yazılamaz (eskiden sessizce yok sayılıyordu — bulgu 12).
 */
export const SEO_ROUTES = [
  { path: '/', label: 'Ana sayfa' },
  { path: '/guven', label: 'Güven' },
  { path: '/neden-qratex', label: 'Neden QRateX' },
  { path: '/blog', label: 'Blog' },
  { path: '/kullanim-sartlari', label: 'Kullanım Şartları' },
  { path: '/gizlilik-politikasi', label: 'Gizlilik Politikası' },
  { path: '/kvkk-aydinlatma-metni', label: 'KVKK Aydınlatma Metni' },
  { path: '/cerez-politikasi', label: 'Çerez Politikası' },
] as const;

export type SeoRoutePath = (typeof SEO_ROUTES)[number]['path'];
export const SEO_ROUTE_PATHS = SEO_ROUTES.map((r) => r.path) as [SeoRoutePath, ...SeoRoutePath[]];

export const CHANGE_FREQUENCIES = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'] as const;
export const CHANGE_FREQUENCY_LABEL: Record<(typeof CHANGE_FREQUENCIES)[number], string> = {
  always: 'Sürekli',
  hourly: 'Saatlik',
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  never: 'Hiç',
};

/** robots.ts'nin listesi boşken kullandığı varsayılan (UI bunu gösterir). */
export const DEFAULT_DISALLOW = ['/admin/', '/dealer/', '/customer/', '/auth/'] as const;

// ───────────────────────────── Şemalar ─────────────────────────────

const noTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
const text = (max: number) => z.string().max(max, `En fazla ${max} karakter`).transform(noTags);

const httpUrl = z
  .string()
  .trim()
  .refine((v) => isHttpUrl(v), 'https:// ile başlayan geçerli bir adres girin')
  .transform((v) => v.replace(/\/+$/, ''));

const optionalHttpUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || isHttpUrl(v), 'Boş bırakın ya da https:// ile başlayan geçerli bir adres girin')
  .transform((v) => v.replace(/\/+$/, ''));

const pathLike = z
  .string()
  .trim()
  .min(1, 'Yol boş olamaz')
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/*?=&%]*$/, '"/" ile başlayan bir yol girin (ör. /ozel/)');

export const sitemapEntrySchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, 'Adres boş olamaz')
      .max(500)
      .refine((v) => isHttpUrl(v) || /^\/[^\s]*$/.test(v), 'Mutlak https:// adres ya da "/" ile başlayan yol girin'),
    priority: z.number().min(0, '0 ile 1 arası').max(1, '0 ile 1 arası').optional(),
    changeFrequency: z.enum(CHANGE_FREQUENCIES).optional(),
    lastModified: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde tarih')
      .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Geçersiz tarih')
      .optional(),
  })
  .strict();

export const seoGlobalSchema = z
  .object({
    defaultTitle: text(120).pipe(z.string().min(10, 'Başlık en az 10 karakter olmalı')),
    defaultDescription: text(320).pipe(z.string().min(1, 'Açıklama boş olamaz')),
    siteName: text(60).pipe(z.string().min(1, 'Site adı boş olamaz')),
    siteUrl: httpUrl,
    ogImageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || normalizeOgImageUrl(v, '') !== '', 'https:// adres ya da "/" ile başlayan yol girin'),
    ogImageWidth: z.number().int('Tam sayı girin').min(200, 'En az 200').max(4096, 'En fazla 4096'),
    ogImageHeight: z.number().int('Tam sayı girin').min(100, 'En az 100').max(4096, 'En fazla 4096'),
    twitterHandle: z
      .string()
      .trim()
      .refine((v) => v === '' || /^@[A-Za-z0-9_]{1,15}$/.test(v), '@ ile başlayan, en fazla 15 karakterlik kullanıcı adı'),
    twitterCard: z.enum(['summary', 'summary_large_image']),
    locale: z.string().trim().regex(/^[a-z]{2}_[A-Z]{2}$/, 'xx_XX biçiminde girin (ör. tr_TR)'),
    keywords: z.array(text(60).pipe(z.string().min(1))).max(30, 'En fazla 30 anahtar kelime'),
    organizationName: text(120).pipe(z.string().min(1, 'Kuruluş adı boş olamaz')),
    organizationDescription: text(500),
    websiteDescription: text(500),
    robotsIndex: z.boolean(),
    robotsFollow: z.boolean(),
    robotsDisallow: z.array(pathLike).max(50, 'En fazla 50 yol'),
    sitemapEnabled: z.boolean(),
    canonicalBase: optionalHttpUrl,
    extraSitemapUrls: z.array(sitemapEntrySchema).max(200, 'En fazla 200 ek adres'),
  })
  .strict();

/** Boş başlık/açıklama/canonical alanı YAZILMAZ → tüketici varsayılanı kullanır (bulgu 2). */
export const seoOverrideSchema = z
  .object({
    path: z.enum(SEO_ROUTE_PATHS, { errorMap: () => ({ message: 'Desteklenen bir sayfa seçin' }) }),
    title: text(120).optional(),
    description: text(320).optional(),
    canonical: optionalHttpUrl.optional(),
  })
  .strict()
  .transform((o) => ({
    path: o.path,
    ...(o.title ? { title: o.title } : {}),
    ...(o.description ? { description: o.description } : {}),
    ...(o.canonical ? { canonical: o.canonical } : {}),
  }));

export const seoPayloadSchema = z
  .object({
    global: seoGlobalSchema,
    pageOverrides: z
      .array(seoOverrideSchema)
      .max(SEO_ROUTES.length)
      .superRefine((rows, ctx) => {
        const seen = new Set<string>();
        rows.forEach((r, i) => {
          if (seen.has(r.path)) ctx.addIssue({ code: 'custom', path: [i, 'path'], message: 'Bu sayfa için zaten bir satır var' });
          seen.add(r.path);
        });
      }),
  })
  .strict();

export type SeoGlobal = z.infer<typeof seoGlobalSchema>;
export type SeoOverride = z.infer<typeof seoOverrideSchema>;
export type SeoPayload = z.infer<typeof seoPayloadSchema>;
export type SeoPayloadInput = z.input<typeof seoPayloadSchema>;

/** PUT gövdesi: iyimser kilit için okunan sürümün `updatedAt`'i (ilk kayıtta null). */
export const seoPutBodySchema = z
  .object({
    payload: seoPayloadSchema,
    baseUpdatedAt: z.string().datetime().nullable(),
    /** Tehlikeli değişiklik (noindex vb.) için istemcinin aldığı açık onay. */
    confirmDangerous: z.boolean().optional(),
  })
  .strict();
export type SeoPutBody = z.infer<typeof seoPutBodySchema>;

export const seoRestoreBodySchema = z
  .object({
    auditLogId: z.string().min(1, 'auditLogId gerekli'),
    /** `restore`: kaydın oluşturduğu sürümü (newData) yükle. `undo` (eski davranış): o değişikliği geri al (oldData). */
    mode: z.enum(['restore', 'undo']).default('undo'),
    baseUpdatedAt: z.string().datetime().nullable().optional(),
    confirmDangerous: z.boolean().optional(),
  })
  .strict();

export const seoHistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export interface SeoState {
  payload: SeoPayload;
  /** Satırın `updatedAt`'i — yoksa (hiç kaydedilmemiş) null. */
  updatedAt: string | null;
  /** Ayar satırı DB'de geçersiz alan taşıyorsa: hangi alanlar varsayılana çekildi. */
  repairedKeys: string[];
  lastChange: { at: string; actor: string | null } | null;
  demoSite: boolean;
}

export interface SeoFieldChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface SeoHistoryEntry {
  id: string;
  action: 'create' | 'update' | 'rollback' | 'restore' | string;
  actionLabel: string;
  createdAt: string;
  actor: string | null;
  changes: SeoFieldChange[];
  dangerous: string[];
  canRestore: boolean;
}

export interface SeoHistoryPage {
  entries: SeoHistoryEntry[];
  nextCursor: string | null;
}

export type HealthSeverity = 'critical' | 'warning' | 'info';
export interface HealthCheck {
  key: string;
  label: string;
  passed: boolean;
  /** `false`: test edilemedi (ör. hedef sunucu izinli değil) — skoru etkilemez. */
  tested: boolean;
  detail: string;
  severity: HealthSeverity;
  /** Sorunu düzeltecek form alanı (sekme + alan anahtarı). */
  fix?: { tab: SeoTab; field: string };
}

export interface HealthReport {
  score: number;
  checks: HealthCheck[];
  passedCount: number;
  failedCount: number;
  checkedAt: string;
  checkedBy: string | null;
}

export type SeoTab = 'genel' | 'sosyal' | 'yapisal' | 'tarama' | 'sayfalar';

// ───────────────────────────── Saf yardımcılar ─────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  defaultTitle: 'Varsayılan başlık',
  defaultDescription: 'Varsayılan açıklama',
  siteName: 'Site adı',
  siteUrl: 'Site URL',
  ogImageUrl: 'OG görsel',
  ogImageWidth: 'OG genişlik',
  ogImageHeight: 'OG yükseklik',
  twitterHandle: 'X kullanıcı adı',
  twitterCard: 'X kart tipi',
  locale: 'Dil/bölge',
  keywords: 'Anahtar kelimeler',
  organizationName: 'Kuruluş adı',
  organizationDescription: 'Kuruluş açıklaması',
  websiteDescription: 'Web sitesi açıklaması',
  robotsIndex: 'İndekslemeye izin',
  robotsFollow: 'Bağlantı takibi',
  robotsDisallow: 'Engellenen yollar',
  sitemapEnabled: 'Sitemap',
  canonicalBase: 'Canonical tabanı',
  extraSitemapUrls: 'Ek sitemap adresleri',
  pageOverrides: 'Sayfa ezmeleri',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'İlk kayıt',
  update: 'Güncelleme',
  rollback: 'Geri alma',
  restore: 'Sürüm geri yükleme',
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

function show(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (v.every((x) => typeof x === 'string')) return v.join(', ');
    return `${v.length} kayıt`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const stable = (v: unknown) => JSON.stringify(v ?? null);

/** İki SEO yükü arasındaki alan bazlı fark (geçmiş, içe aktarma önizlemesi, onay). */
export function diffSeoPayload(before: unknown, after: unknown): SeoFieldChange[] {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const bg = (b.global && typeof b.global === 'object' ? b.global : {}) as Record<string, unknown>;
  const ag = (a.global && typeof a.global === 'object' ? a.global : {}) as Record<string, unknown>;
  const out: SeoFieldChange[] = [];
  const keys = new Set([...Object.keys(bg), ...Object.keys(ag)]);
  for (const key of keys) {
    if (stable(bg[key]) === stable(ag[key])) continue;
    out.push({ key, label: FIELD_LABELS[key] ?? key, before: show(bg[key]), after: show(ag[key]) });
  }
  const bo = Array.isArray(b.pageOverrides) ? b.pageOverrides : [];
  const ao = Array.isArray(a.pageOverrides) ? a.pageOverrides : [];
  if (stable(bo) !== stable(ao)) {
    out.push({ key: 'pageOverrides', label: FIELD_LABELS.pageOverrides, before: `${bo.length} satır`, after: `${ao.length} satır` });
  }
  return out;
}

export interface DangerFlag {
  key: string;
  message: string;
}

/** Siteyi aramadan düşürebilecek ayarlar (bulgu 4) — `next` içinde aktif olanlar. */
export function dangerousFlags(g: Pick<SeoGlobal, 'robotsIndex' | 'robotsFollow' | 'robotsDisallow' | 'sitemapEnabled'>): DangerFlag[] {
  const out: DangerFlag[] = [];
  if (!g.robotsIndex) out.push({ key: 'robotsIndex', message: 'Site "noindex" olur: Google ve diğer arama motorları sayfaları dizinden çıkarır.' });
  if (!g.robotsFollow) out.push({ key: 'robotsFollow', message: 'Bağlantılar "nofollow" olur: arama motorları site içi bağlantıları izlemez.' });
  if (g.robotsDisallow.some((p) => p.trim() === '/' || p.trim() === '/*'))
    out.push({ key: 'robotsDisallow', message: 'robots.txt "Disallow: /" içerir: tüm site taranmaya kapanır.' });
  if (!g.sitemapEnabled) out.push({ key: 'sitemapEnabled', message: 'Sitemap kapanır: yeni sayfaların keşfi yavaşlar.' });
  return out;
}

/** Yalnız YENİ açılan tehlikeleri döner (zaten kapalı olan ayar tekrar onay istemez). */
export function newlyDangerous(prev: SeoGlobal | null, next: SeoGlobal): DangerFlag[] {
  const before = new Set(prev ? dangerousFlags(prev).map((d) => d.key) : []);
  return dangerousFlags(next).filter((d) => !before.has(d.key));
}

/** Yayına çıkacak robots.txt metni — app/robots.ts mantığının birebir aynası. */
export function renderRobotsTxt(g: SeoGlobal, opts: { demo: boolean; base: string }): string {
  const lines: string[] = ['User-Agent: *'];
  if (opts.demo) {
    lines.push('Disallow: /');
  } else {
    lines.push('Allow: /');
    const disallow = g.robotsDisallow.length ? g.robotsDisallow : [...DEFAULT_DISALLOW];
    for (const d of disallow) lines.push(`Disallow: ${d}`);
  }
  if (g.sitemapEnabled) lines.push('', `Sitemap: ${opts.base}/sitemap.xml`);
  return lines.join('\n');
}

/** Formdaki ham durumdan şemaya uygun yük (boş satırlar, metin sayıları vb. temizlenir). */
export function parseSeoPayload(input: unknown):
  | { ok: true; data: SeoPayload }
  | { ok: false; errors: Array<{ path: string; message: string }> } {
  const r = seoPayloadSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

/** Bir sekme hangi alan yollarını içerir (hata rozeti + "düzelt" bağlantısı için). */
export function tabForPath(path: string): SeoTab {
  if (path.startsWith('pageOverrides')) return 'sayfalar';
  const key = path.replace(/^global\./, '').split('.')[0];
  if (['ogImageUrl', 'ogImageWidth', 'ogImageHeight', 'twitterHandle', 'twitterCard'].includes(key)) return 'sosyal';
  if (['organizationName', 'organizationDescription', 'websiteDescription'].includes(key)) return 'yapisal';
  if (['robotsIndex', 'robotsFollow', 'robotsDisallow', 'sitemapEnabled', 'extraSitemapUrls'].includes(key)) return 'tarama';
  return 'genel';
}
