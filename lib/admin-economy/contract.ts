/**
 * Ekonomi Stüdyosu (/admin/economy) — istemci ve sunucunun paylaştığı SAF sözleşme.
 * Prisma yok; istemci adası buradan güvenle içe aktarır.
 *
 * Sekmeler: Puan matrisi · Çarpan ve tavanlar · Ligler · Simülasyon.
 * Eski rotalar (/admin/points-matrix, /admin/gamification-settings, /admin/league-settings,
 * /admin/economy-sim) buraya kalıcı yönlenir.
 */
import { z } from 'zod';
import type { PointsMatrix } from '@/lib/points-rules';
import type { LeagueKey, LeagueRule } from '@/lib/league-rules-core';

export const ECONOMY_TABS = ['matrix', 'multipliers', 'leagues', 'simulation'] as const;
export type EconomyTab = (typeof ECONOMY_TABS)[number];

export function parseEconomyTab(raw: string | null | undefined): EconomyTab {
  return (ECONOMY_TABS as readonly string[]).includes(raw ?? '') ? (raw as EconomyTab) : 'matrix';
}

/** Eski rota → sekme (permanentRedirect için). */
export const LEGACY_TAB: Record<string, EconomyTab> = {
  '/admin/points-matrix': 'matrix',
  '/admin/gamification-settings': 'multipliers',
  '/admin/league-settings': 'leagues',
  '/admin/economy-sim': 'simulation',
};

/** Sorgu parametrelerini koruyarak /admin/economy?tab=… adresi üretir (eski rotalar için). */
export function legacyRedirectTarget(
  tab: EconomyTab,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === 'tab' || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
  }
  if (tab !== 'matrix') qs.set('tab', tab);
  const s = qs.toString();
  return s ? `/admin/economy?${s}` : '/admin/economy';
}

// ─────────────────────────── Sürümlü kaynak ───────────────────────────

export type Versioned<T> = { data: T; version: string };

/** Sunucu ön yüklemesi: başarısızsa `null` (istemci görünür hata + "Tekrar dene"). */
export type Preload<T> = Versioned<T> | null;

// ─────────────────────────── Puan matrisi ───────────────────────────

export type MatrixResource = { matrix: PointsMatrix; defaults: PointsMatrix };

// ─────────────────────────── Çarpanlar ───────────────────────────

/**
 * Platform çarpanı sınırları. 0 ya da negatif çarpan tüketicide (lib/gamification-settings)
 * sessizce 1'e döndüğü için alt sınır 0,1; üst sınır yazım hatasıyla 100× enflasyonu önlemek
 * için 5 (gamification-settings raporu Bulgu 4, 9).
 */
export const MULTIPLIER_LIMITS = { min: 0.1, max: 5, step: 0.05, warnAbove: 2 } as const;

export const multipliersSchema = z.object({
  pointMultiplier: z
    .number({ invalid_type_error: 'Puan çarpanı sayı olmalı', required_error: 'Puan çarpanı gerekli' })
    .finite('Puan çarpanı sayı olmalı')
    .min(MULTIPLIER_LIMITS.min, `Puan çarpanı en az ${MULTIPLIER_LIMITS.min.toLocaleString('tr-TR')} olmalı`)
    .max(MULTIPLIER_LIMITS.max, `Puan çarpanı en fazla ${MULTIPLIER_LIMITS.max} olabilir`),
  xpMultiplier: z
    .number({ invalid_type_error: 'XP çarpanı sayı olmalı', required_error: 'XP çarpanı gerekli' })
    .finite('XP çarpanı sayı olmalı')
    .min(MULTIPLIER_LIMITS.min, `XP çarpanı en az ${MULTIPLIER_LIMITS.min.toLocaleString('tr-TR')} olmalı`)
    .max(MULTIPLIER_LIMITS.max, `XP çarpanı en fazla ${MULTIPLIER_LIMITS.max} olabilir`),
});
export type Multipliers = z.infer<typeof multipliersSchema>;

export const multipliersPutSchema = multipliersSchema.extend({
  baseVersion: z.string().trim().min(1, 'Sürüm bilgisi gerekli').max(200),
});

/**
 * Çarpanların GERÇEKTEN uygulandığı kaynaklar (lib/feedback-funnel/reward.ts tek tüketici).
 * Arayüz bu listeyi gösterir — "global" vaadi yok.
 */
export const MULTIPLIER_SCOPE = ['feedback'] as const;

// ─────────────────────────── Tavanlar (salt okunur, lib/economy/caps) ───────────────────────────

export type CapRow = {
  category: string;
  label: string;
  daily: number | null;
  weekly: number | null;
  perActorDaily: number | null;
  requiresActor: boolean;
  description: string;
  /** Son 7 günde tavana takılan (0 tutarlı defter satırı) kredi sayısı. */
  hits7d: number | null;
};

export type CapsSnapshot = {
  rows: CapRow[];
  maxSingleMint: number;
  maxSingleXp: number;
  adminAdjust: { perOperation: number; dailyPerUser: number; secondApprovalAbove: number };
};

export type MultipliersResource = {
  multipliers: Multipliers;
  /** DB'de satır yoksa true (varsayılan 1× uygulanıyor). */
  isDefault: boolean;
  caps: CapsSnapshot;
};

// ─────────────────────────── Ligler ───────────────────────────

export const LEAGUE_KEYS: readonly LeagueKey[] = ['BASLANGIC', 'KOR', 'VEYRA', 'SAVASCI', 'ETERON', 'VETRA', 'ZENOR'];
/** Son ligin "sınırsız" üst ucu (Int aralığında). */
export const LEAGUE_OPEN_MAX = 2_000_000_000;
export const LEAGUE_MIN_LIMIT = 10_000_000;

const leagueRuleSchema = z.object({
  key: z.enum(LEAGUE_KEYS as unknown as [LeagueKey, ...LeagueKey[]], {
    errorMap: () => ({ message: 'Bilinmeyen lig anahtarı' }),
  }),
  name: z.string().trim().min(1, 'Lig adı boş olamaz').max(32, 'Lig adı en fazla 32 karakter olabilir'),
  minPoints: z.number().int('Eşik tam sayı olmalı').min(0, 'Eşik negatif olamaz').max(LEAGUE_MIN_LIMIT, 'Eşik çok büyük'),
  /** Yok sayılır: sunucu üst sınırı bir sonraki eşikten türetir (deriveLeagueRanges). */
  maxPoints: z.number().int().min(0).max(LEAGUE_OPEN_MAX).optional(),
  gradient: z.string().max(200).optional(),
});

/**
 * Lig kuralları: tam 7 benzersiz lig, ilki 0'dan başlar, eşikler KESİN artan. Üst sınırlar
 * kullanıcıdan alınmaz; kayıtta `deriveLeagueRanges` ile bitişik türetilir (max = sonraki
 * min − 1, son lig sınırsız). Boşluk/çakışma/ulaşılamaz lig imkânsız (league-settings B3, B4).
 */
export const leagueRulesSchema = z
  .array(leagueRuleSchema)
  .length(LEAGUE_KEYS.length, `Tam ${LEAGUE_KEYS.length} lig gönderilmeli`)
  .superRefine((rules, ctx) => {
    const keys = new Set(rules.map((r) => r.key));
    if (keys.size !== rules.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Aynı lig iki kez gönderilmiş' });
      return;
    }
    if (rules[0]?.minPoints !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [0, 'minPoints'], message: 'İlk lig 0 puandan başlamalı' });
    }
    for (let i = 1; i < rules.length; i++) {
      if (rules[i].minPoints <= rules[i - 1].minPoints) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'minPoints'],
          message: `${rules[i].name} eşiği ${rules[i - 1].name} eşiğinden büyük olmalı`,
        });
      }
    }
  });

/** Eşiklerden bitişik aralıkları türetir (max alanı kullanıcıdan alınmaz). */
export function deriveLeagueRanges(rules: readonly LeagueRule[]): LeagueRule[] {
  return rules.map((r, i) => ({
    ...r,
    maxPoints: i === rules.length - 1 ? LEAGUE_OPEN_MAX : Math.max(r.minPoints, (rules[i + 1]?.minPoints ?? 0) - 1),
  }));
}

/** Yalnız istemci doğrulaması: alan → hata metni. */
export function leagueRuleErrors(rules: readonly LeagueRule[]): Record<number, string> {
  const out: Record<number, string> = {};
  const parsed = leagueRulesSchema.safeParse(deriveLeagueRanges(rules));
  if (parsed.success) return out;
  for (const issue of parsed.error.issues) {
    const idx = typeof issue.path[0] === 'number' ? issue.path[0] : 0;
    if (!out[idx]) out[idx] = issue.message;
  }
  return out;
}

export type LeagueDistribution = Record<string, number>;

export type LeaguesResource = {
  rules: LeagueRule[];
  isDefault: boolean;
  /** Kural başına kullanıcı sayısı (müşteri, silinmemiş), User.points üzerinden. */
  distribution: LeagueDistribution | null;
  totalUsers: number | null;
};

export type LeaguePreview = {
  current: LeagueDistribution;
  draft: LeagueDistribution;
  promoted: number;
  demoted: number;
  unchanged: number;
  total: number;
};

export const leaguePreviewBodySchema = z.object({ rules: leagueRulesSchema });

// ─────────────────────────── Akış (PointsLedger) ───────────────────────────

export const FLOW_WINDOWS = [7, 30, 90] as const;
export const flowQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (FLOW_WINDOWS as readonly number[]).includes(d), 'Dönem 7, 30 ya da 90 gün olmalı')
    .default(30),
});

export type FlowKind = 'mint' | 'sink' | 'transfer' | 'correction' | 'excluded';

export type FlowSourceRow = {
  source: string;
  label: string;
  kind: FlowKind;
  points: number;
  count: number;
  xp: number;
};

export type FlowDay = { day: string; mint: number; sink: number };

export type EconomyFlow = {
  days: number;
  from: string;
  to: string;
  minted: number;
  spent: number;
  net: number;
  /** Önceki eş dönem (kıyas). */
  previous: { minted: number; spent: number; net: number };
  /** Dolaşımdaki toplam puan (User.points toplamı, şimdi). */
  supply: number;
  /** Dönem başına göre dolaşım büyümesi (%); başlangıç arzı 0 ise null. */
  inflationPct: number | null;
  /** Harcama / basım (%) — basım yoksa null. */
  redeemPct: number | null;
  bySource: FlowSourceRow[];
  series: FlowDay[];
  pending: number;
  voided: number;
  asOf: string;
};

// ─────────────────────────── Simülasyon ───────────────────────────

export const simulateBodySchema = z.object({
  days: z
    .number()
    .int()
    .refine((d) => (FLOW_WINDOWS as readonly number[]).includes(d), 'Dönem 7, 30 ya da 90 gün olmalı')
    .default(30),
  /** Taslak matris (kaydedilmemiş). Verilmezse kayıtlı matris. */
  matrix: z.unknown().optional(),
  /** Taslak çarpanlar. Verilmezse kayıtlı çarpanlar. */
  multipliers: multipliersSchema.optional(),
});
export type SimulateBody = z.infer<typeof simulateBodySchema>;

export type SimSourceRow = {
  source: string;
  label: string;
  observed: number;
  projected: number;
  /** projected / observed (gözlem 0 ise null). */
  factor: number | null;
  /** Ölçeklemenin dayanağı (insan okuması). */
  basis: string;
  modeled: boolean;
};

export type SimulationResult = {
  days: number;
  observedMint: number;
  projectedMint: number;
  observedSpend: number;
  observedNet: number;
  projectedNet: number;
  deltaPct: number | null;
  rows: SimSourceRow[];
  assumptions: string[];
  asOf: string;
};

// ─────────────────────────── Geçmiş (AuditLog) ───────────────────────────

export const HISTORY_ACTIONS = {
  matrix: 'UPDATE_POINTS_MATRIX',
  multipliers: 'UPDATE_GAMIFICATION_SETTINGS',
  leagues: 'UPDATE_LEAGUE_RULES',
} as const;
export type HistoryKind = keyof typeof HISTORY_ACTIONS;

export const historyQuerySchema = z.object({
  kind: z.enum(['matrix', 'multipliers', 'leagues']),
  page: z.coerce.number().int().min(1).max(500).default(1),
  size: z.coerce.number().int().min(5).max(50).default(10),
});

export type FieldChange = { path: string; before: string; after: string };

export type HistoryEntry = {
  id: string;
  at: string;
  actor: string;
  changes: FieldChange[];
  /** Bu kayıttaki yeni değer (taslağa yüklemek için). */
  snapshot: unknown;
};

export type HistoryPage = { items: HistoryEntry[]; page: number; size: number; total: number };

// ─────────────────────────── Fark ───────────────────────────

function fmtLeaf(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('tr-TR');
  if (typeof v === 'boolean') return v ? 'açık' : 'kapalı';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * İki JSON değeri arasındaki yaprak farkları (`feedback.base.points: 10 → 20`).
 * Diziler kimlik alanı (`id`/`key`/`days`) varsa ona göre, yoksa sıraya göre eşlenir.
 */
export function diffJson(before: unknown, after: unknown, prefix = '', out: FieldChange[] = [], limit = 60): FieldChange[] {
  if (out.length >= limit) return out;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    const idOf = (x: unknown): string | null => {
      if (!isObj(x)) return null;
      for (const k of ['id', 'key', 'days']) if (x[k] !== undefined) return String(x[k]);
      return null;
    };
    const keyed = [...a, ...b].every((x) => idOf(x) !== null);
    if (keyed) {
      const ma = new Map(a.map((x) => [idOf(x)!, x]));
      const mb = new Map(b.map((x) => [idOf(x)!, x]));
      for (const id of new Set([...ma.keys(), ...mb.keys()])) {
        const p = `${prefix}[${id}]`;
        if (!ma.has(id)) out.push({ path: p, before: '—', after: 'eklendi' });
        else if (!mb.has(id)) out.push({ path: p, before: 'vardı', after: 'silindi' });
        else diffJson(ma.get(id), mb.get(id), p, out, limit);
        if (out.length >= limit) break;
      }
      return out;
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < limit; i++) diffJson(a[i], b[i], `${prefix}[${i}]`, out, limit);
    return out;
  }
  if (isObj(before) || isObj(after)) {
    const a = isObj(before) ? before : {};
    const b = isObj(after) ? after : {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffJson(a[k], b[k], prefix ? `${prefix}.${k}` : k, out, limit);
      if (out.length >= limit) break;
    }
    return out;
  }
  if (fmtLeaf(before) !== fmtLeaf(after)) out.push({ path: prefix || '(değer)', before: fmtLeaf(before), after: fmtLeaf(after) });
  return out;
}

// ─────────────────────────── Etiketler ───────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  feedback: 'Geri bildirim',
  review: 'Tüketim yorumu',
  consumption: 'Tüketim (pasif)',
  dealer_passive: 'Bayi pasif puanı',
  game: 'Mini oyunlar',
  game_quest: 'Oyun görevi',
  game_streak: 'Oyun serisi',
  tournament: 'Turnuva',
  quest: 'Görev',
  visit_mission: 'Ziyaret görevi',
  badge: 'Rozet ödülü',
  referral: 'Davet',
  referral_milestone: 'Davet kademesi',
  birthday: 'Doğum günü',
  streak: 'Seri',
  spin: 'Günlük çark',
  surprise: 'Sürpriz kutu',
  squad: 'Klan',
  squad_battle: 'Klan savaşı havuzu',
  squad_escrow: 'Klan savaşı emaneti',
  squad_escrow_refund: 'Klan emanet iadesi',
  remedy: 'Telafi',
  seasonal: 'Sezonluk',
  seasonal_challenge: 'Sezonluk görev',
  seasonal_event: 'Sezonluk etkinlik',
  automation: 'Otomasyon',
  shop: 'Mağaza',
  reward: 'Ödül kullanımı',
  gift: 'Hediye',
  donation: 'Bağış',
  spend: 'Harcama',
  admin_adjust: 'Admin düzeltmesi',
  reversal: 'Ters kayıt',
  opening_balance: 'Açılış bakiyesi',
  demo_seed: 'Demo verisi',
};

/** Emanet/havuz hareketleri net-sıfır transferdir — enflasyona sayılmaz. */
const TRANSFER_SOURCES = new Set(['squad_escrow', 'squad_escrow_refund', 'squad_battle']);
const CORRECTION_SOURCES = new Set(['admin_adjust', 'reversal']);
const EXCLUDED_SOURCES = new Set(['opening_balance', 'demo_seed']);

export function classifySource(source: string, delta: number): FlowKind {
  if (EXCLUDED_SOURCES.has(source)) return 'excluded';
  if (TRANSFER_SOURCES.has(source)) return 'transfer';
  if (CORRECTION_SOURCES.has(source)) return 'correction';
  return delta >= 0 ? 'mint' : 'sink';
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
