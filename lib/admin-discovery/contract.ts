/**
 * Keşif ve sponsorlu yerleşimler (/admin/discovery) — istemci + sunucu ORTAK sözleşme.
 * Prisma'ya bağımlı değildir (istemci paketine girer).
 *
 * Denetim (docs/audit/2026-10-08/admin/admin_discovery.md) kapanışları:
 *  - Bulgu 9: `config: z.unknown()` yerine gerçek şema (saat, gün, indirim aralığı, tarih
 *    geçerliliği ve sırası, URL protokolü, metin/dizi uzunlukları, tekil kimlikler, 0/0 koordinatı).
 *  - Bulgu 5: kategori/gün/saat yapılandırılmış değer (serbest virgüllü metin yok).
 *  - Bulgu 4: tarih/saat girişleri Europe/Istanbul olarak yorumlanır.
 *  - #14: Google Haritalar bağlantısı biçimleri (`@lat,lng`, `!3d..!4d..`, `q=`/`ll=`) ayrıştırılır.
 */
import { z } from 'zod';

export const DISCOVERY_TZ = 'Europe/Istanbul';
export const MAX_LOCATIONS = 500;
export const MAX_SPONSORED = 50;
export const MAX_CATEGORIES = 8;

/** Keşfet ucunun tanıdığı ana kategoriler (müşteri ucu `normalizeCategoryLabel` ile aynı küme). */
export const SUGGESTED_CATEGORIES = ['kahve', 'tatlı', 'yemek', 'bar', 'kahvaltı', 'fırın'] as const;

/** 0 = Pazar … 6 = Cumartesi (müşteri ucu ve `lib/places/business-hours` ile aynı). Görüntü Pzt'den başlar. */
export const WEEKDAYS: ReadonlyArray<{ value: number; short: string; long: string }> = [
  { value: 1, short: 'Pzt', long: 'Pazartesi' },
  { value: 2, short: 'Sal', long: 'Salı' },
  { value: 3, short: 'Çar', long: 'Çarşamba' },
  { value: 4, short: 'Per', long: 'Perşembe' },
  { value: 5, short: 'Cum', long: 'Cuma' },
  { value: 6, short: 'Cmt', long: 'Cumartesi' },
  { value: 0, short: 'Paz', long: 'Pazar' },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Bağlantı: yalnız `https://` ya da uygulama içi yol (`/customer/...`). `javascript:` vb. reddedilir. */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('/')) return !v.startsWith('//') && !/[\s\\]/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

/** Görsel: https URL ya da kök göreli yol. */
export function isSafeImage(value: string): boolean {
  return isSafeLink(value);
}

function isIsoDate(v: string): boolean {
  return !Number.isNaN(Date.parse(v));
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} en fazla ${max} karakter olabilir.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const discoveryLocationSchema = z
  .object({
    dealerId: z.string().trim().regex(ID_RE, 'Bir işletme seçin.'),
    latitude: z.number({ invalid_type_error: 'Enlem sayı olmalı.' }).min(-90, 'Enlem −90 ile 90 arasında olmalı.').max(90, 'Enlem −90 ile 90 arasında olmalı.'),
    longitude: z.number({ invalid_type_error: 'Boylam sayı olmalı.' }).min(-180, 'Boylam −180 ile 180 arasında olmalı.').max(180, 'Boylam −180 ile 180 arasında olmalı.'),
    address: optionalText(200, 'Adres'),
    categories: z
      .array(z.string().trim().min(2, 'Kategori en az 2 karakter.').max(30, 'Kategori en fazla 30 karakter.'))
      .max(MAX_CATEGORIES, `En fazla ${MAX_CATEGORIES} kategori.`)
      .default([])
      .transform((list) => [...new Set(list.map((c) => c.toLocaleLowerCase('tr-TR')))]),
    opensAt: z.string().regex(TIME_RE, 'Saat SS:dd biçiminde olmalı.').optional(),
    closesAt: z.string().regex(TIME_RE, 'Saat SS:dd biçiminde olmalı.').optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]).transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  })
  .superRefine((v, ctx) => {
    if (Math.abs(v.latitude) < 1e-6 && Math.abs(v.longitude) < 1e-6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latitude'], message: 'Konum seçilmedi (0, 0 geçerli bir işletme konumu değil).' });
    }
    if (!!v.opensAt !== !!v.closesAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.opensAt ? 'closesAt' : 'opensAt'], message: 'Açılış ve kapanış saatini birlikte girin.' });
    }
    if (v.opensAt && v.daysOfWeek.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['daysOfWeek'], message: 'Saat girildiyse en az bir gün seçin.' });
    }
  });
export type DiscoveryLocation = z.infer<typeof discoveryLocationSchema>;
export type DiscoveryLocationInput = z.input<typeof discoveryLocationSchema>;

export const sponsoredSchema = z
  .object({
    id: z.string().trim().regex(ID_RE, 'Geçersiz kimlik.'),
    title: z.string().trim().min(3, 'Başlık en az 3 karakter.').max(80, 'Başlık en fazla 80 karakter.'),
    description: optionalText(240, 'Açıklama'),
    discountRate: z
      .number({ invalid_type_error: 'İndirim sayı olmalı.' })
      .int('İndirim tam sayı olmalı.')
      .min(0, 'İndirim 0–100 arasında olmalı.')
      .max(100, 'İndirim 0–100 arasında olmalı.')
      .optional(),
    linkUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || isSafeLink(v), 'Bağlantı https:// ile ya da uygulama içi “/” yoluyla başlamalı.'),
    dealerId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || ID_RE.test(v), 'Geçersiz işletme.'),
    imageUrl: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || isSafeImage(v), 'Görsel https:// adresi olmalı.'),
    priority: z.number().int('Öncelik tam sayı olmalı.').min(0, 'Öncelik 0–1000 arasında.').max(1000, 'Öncelik 0–1000 arasında.').default(0),
    isActive: z.boolean().default(true),
    startsAt: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || isIsoDate(v), 'Başlangıç tarihi geçersiz.'),
    endsAt: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || isIsoDate(v), 'Bitiş tarihi geçersiz.'),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Bitiş, başlangıçtan sonra olmalı.' });
    }
  });
export type Sponsored = z.infer<typeof sponsoredSchema>;
export type SponsoredInput = z.input<typeof sponsoredSchema>;

export const DEFAULT_WEEKLY = {
  ambienceLabel: 'En Güzel Ambiyans',
  foodLabel: 'En Güzel Yemek',
  serviceLabel: 'En Güzel Hizmet',
} as const;

const weeklyLabel = (fallback: string) =>
  z
    .string()
    .trim()
    .max(40, 'Başlık en fazla 40 karakter.')
    .optional()
    .transform((v) => (v && v.length >= 2 ? v : fallback));

export const weeklySchema = z
  .object({
    ambienceLabel: weeklyLabel(DEFAULT_WEEKLY.ambienceLabel),
    foodLabel: weeklyLabel(DEFAULT_WEEKLY.foodLabel),
    serviceLabel: weeklyLabel(DEFAULT_WEEKLY.serviceLabel),
  })
  .default({});

export const discoveryConfigSchema = z
  .object({
    locations: z.array(discoveryLocationSchema).max(MAX_LOCATIONS, `En fazla ${MAX_LOCATIONS} yedek konum.`).default([]),
    sponsored: z.array(sponsoredSchema).max(MAX_SPONSORED, `En fazla ${MAX_SPONSORED} sponsorlu duyuru.`).default([]),
    weeklyHighlights: weeklySchema,
  })
  .superRefine((v, ctx) => {
    const seenDealer = new Set<string>();
    v.locations.forEach((l, i) => {
      if (seenDealer.has(l.dealerId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locations', i, 'dealerId'], message: 'Bu işletmenin zaten bir yedek konumu var.' });
      }
      seenDealer.add(l.dealerId);
    });
    const seenId = new Set<string>();
    v.sponsored.forEach((s, i) => {
      if (seenId.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sponsored', i, 'id'], message: 'Sponsorlu duyuru kimliği tekrar ediyor.' });
      seenId.add(s.id);
    });
  });
export type DiscoveryConfigValue = z.infer<typeof discoveryConfigSchema>;

/** PUT gövdesi: config + iyimser kilit sürümü (C2 — `baseVersion` zorunlu, 409). */
export const discoveryPutSchema = z.object({
  config: discoveryConfigSchema,
  baseVersion: z.string().min(1).max(200),
  /** Geçmişten geri yüklemede kaynak denetim kaydı (yalnız iz için). */
  restoredFrom: z.string().regex(ID_RE).optional(),
});

/** zod hata yolu → okunur Türkçe konum ("2. sponsor · Başlık"). */
export function issuePathLabel(path: ReadonlyArray<string | number>): string {
  const [section, index, field] = path;
  const sectionLabel = section === 'locations' ? 'yedek konum' : section === 'sponsored' ? 'sponsorlu duyuru' : section === 'weeklyHighlights' ? 'Haftanın enleri' : '';
  const fieldLabel: Record<string, string> = {
    dealerId: 'İşletme',
    latitude: 'Enlem',
    longitude: 'Boylam',
    address: 'Adres',
    categories: 'Kategoriler',
    opensAt: 'Açılış',
    closesAt: 'Kapanış',
    daysOfWeek: 'Günler',
    title: 'Başlık',
    description: 'Açıklama',
    discountRate: 'İndirim',
    linkUrl: 'Bağlantı',
    imageUrl: 'Görsel',
    priority: 'Öncelik',
    startsAt: 'Başlangıç',
    endsAt: 'Bitiş',
    ambienceLabel: 'Ambiyans başlığı',
    foodLabel: 'Yemek başlığı',
    serviceLabel: 'Hizmet başlığı',
  };
  if (typeof index === 'number') return `${index + 1}. ${sectionLabel}${field ? ` · ${fieldLabel[String(field)] ?? field}` : ''}`;
  if (typeof index === 'string') return `${sectionLabel} · ${fieldLabel[index] ?? index}`;
  return sectionLabel || 'Ayar';
}

// ───────────────────────────── Sponsor durumu ─────────────────────────────

export type SponsorStatus = 'live' | 'scheduled' | 'ended' | 'off';
export const SPONSOR_STATUS_LABEL: Record<SponsorStatus, string> = {
  live: 'Yayında',
  scheduled: 'Planlandı',
  ended: 'Bitti',
  off: 'Kapalı',
};

export function sponsorStatus(s: Pick<Sponsored, 'isActive' | 'startsAt' | 'endsAt'>, now: Date = new Date()): SponsorStatus {
  if (!s.isActive) return 'off';
  const t = now.getTime();
  if (s.endsAt && Date.parse(s.endsAt) <= t) return 'ended';
  if (s.startsAt && Date.parse(s.startsAt) > t) return 'scheduled';
  return 'live';
}

export function newSponsorId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.floor(Date.now()).toString(36);
  return `sp_${Date.now().toString(36)}${rnd}`.slice(0, 40);
}

// ───────────────────────────── Konum ayrıştırma ─────────────────────────────

function validPair(lat: number, lng: number): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) };
}

/**
 * "41.0, 29.0" · Google Haritalar uzun bağlantısı (`@41.0,29.0,17z`, `!3d41.0!4d29.0`,
 * `?q=41.0,29.0`, `ll=`) → koordinat. Kısa bağlantı (`maps.app.goo.gl`) yönlendirme gerektirir,
 * desteklenmez (null; arayüz bunu söyler).
 */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const text = input.trim();
  if (!text) return null;
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`@${num},${num}`),
    new RegExp(String.raw`[?&](?:q|ll|query|destination)=${num}(?:,|%2C)\s*${num}`, 'i'),
    new RegExp(String.raw`^${num}\s*[,;\s]\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const pair = validPair(Number(m[1]), Number(m[2]));
      if (pair) return pair;
    }
  }
  return null;
}

// ───────────────────────────── İstanbul saati ─────────────────────────────

/** ISO → `<input type="datetime-local">` değeri (İstanbul duvar saati). */
export function isoToIstanbulInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISCOVERY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** `datetime-local` (İstanbul duvar saati, UTC+3 — 2016'dan beri yaz saati yok) → ISO. */
export function istanbulInputToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}:00+03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ───────────────────────────── DTO'lar ─────────────────────────────

export type DealerRef = { id: string; name: string; email: string | null };

export type DiscoveryState = {
  config: DiscoveryConfigValue;
  version: string;
  isDefault: boolean;
  /** Ayarda geçen işletmelerin adları (seçicide ham kimlik yerine). Bulunamayan → yok. */
  dealers: Record<string, DealerRef>;
  /** Kayıtta okunamayan/ geçersiz satır sayısı (normalize sırasında düşenler). */
  droppedRows: number;
  moduleEnabled: boolean;
};

export const COVERAGE_FILTERS = ['all', 'missing-location', 'fallback', 'missing-hours', 'missing-category', 'complete'] as const;
export type CoverageFilter = (typeof COVERAGE_FILTERS)[number];
export const COVERAGE_FILTER_LABEL: Record<CoverageFilter, string> = {
  all: 'Tüm işletmeler',
  'missing-location': 'Konumu yok (Keşfet’te görünmüyor)',
  fallback: 'Yalnız yedek konumla görünen',
  'missing-hours': 'Çalışma saati yok',
  'missing-category': 'Kategorisi yok',
  complete: 'Bilgisi tam',
};

export const coverageQuerySchema = z.object({
  filter: z.enum(COVERAGE_FILTERS).default('all'),
  q: z.string().trim().max(80).optional().transform((v) => (v && v.length >= 2 ? v : undefined)),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(10).max(100).default(20),
});
export type CoverageQuery = z.infer<typeof coverageQuerySchema>;

export type CoverageSummary = {
  dealers: number;
  withProfileLocation: number;
  withFallbackOnly: number;
  withoutLocation: number;
  withHours: number;
  withCategories: number;
  complete: number;
  holiday: number;
  /** Yedek konumu olduğu halde profil konumu da olan (yedek kullanılmıyor). */
  shadowedFallbacks: number;
  asOf: string;
};

export type CoverageRow = {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  location: 'profile' | 'fallback' | 'none';
  hours: 'profile' | 'fallback' | 'none';
  holiday: boolean;
  categories: string[];
  hasFallbackRow: boolean;
};

export type CoveragePage = { summary: CoverageSummary; items: CoverageRow[]; total: number; page: number; size: number };

export const dealerSearchSchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  ids: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((x) => ID_RE.test(x)).slice(0, 100) : [])),
});

export const previewSchema = z.object({
  mode: z.enum(['draft', 'live']).default('draft'),
  config: discoveryConfigSchema.optional(),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  radiusKm: z.number().min(0.1).max(50).default(5),
  category: z.string().trim().max(30).optional().default('all'),
});
export type PreviewInput = z.input<typeof previewSchema>;

export type NearbyItem = {
  dealerId: string;
  businessName: string;
  address?: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  categories: string[];
  avgRating: number;
  trendScore: number;
  feedbackCount: number;
  /** null → çalışma saati bilinmiyor (uydurulmaz). */
  isOpenNow: boolean | null;
  openSource: 'profile' | 'fallback' | null;
  locationSource: 'profile' | 'fallback';
  holiday: boolean;
};

export type DiscoveryComputed = {
  trendingVenues: Array<{ dealerId: string; businessName: string; image: string | null; feedbackCount: number; avgRating: number; score: number }>;
  weeklyBest: Array<{ key: 'ambience' | 'food' | 'service'; label: string; winner: { dealerId: string; businessName: string; score: number } | null }>;
  sponsored: Sponsored[];
  nearby: NearbyItem[];
  nearbyTotal: number;
  liveBoosts: Array<{ dealerId: string | null; businessName: string; happyHourName: string; multiplier: number; distanceKm: number; scope: 'dealer' | 'global' }>;
};

export type PreviewResult = DiscoveryComputed & { mode: 'draft' | 'live'; computedAt: string };

export const historyQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

export type HistoryEntry = {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  summary: { locations: number; sponsored: number; liveSponsored: number };
  /** Bu kayıttaki yeni değer (taslağa yüklenebilir). Okunamazsa null. */
  config: DiscoveryConfigValue | null;
  restoredFrom: string | null;
};
export type HistoryPage = { items: HistoryEntry[]; total: number; page: number; size: number };

export function summarize(config: DiscoveryConfigValue | null, now: Date = new Date()) {
  if (!config) return { locations: 0, sponsored: 0, liveSponsored: 0 };
  return {
    locations: config.locations.length,
    sponsored: config.sponsored.length,
    liveSponsored: config.sponsored.filter((s) => sponsorStatus(s, now) === 'live').length,
  };
}
