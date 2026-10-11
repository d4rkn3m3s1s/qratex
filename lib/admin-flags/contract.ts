/**
 * Özellik ve Deney Kontrolü (/admin/features) — istemci + sunucu ortak sözleşmesi.
 *
 * Üç gerçek mekanizma, tek yüzey:
 *  1. Modül anahtarları — `Settings.moduleControls` + `assertModuleEnabled` (API kapısı).
 *     Her anahtarın GERÇEK zorlama seviyesi koddan taranır (`lib/data/module-gate-bindings.json`),
 *     okuyucusu olmayan anahtar "etkisiz" gösterilir ve değiştirilemez.
 *  2. Kademeli açılış — `FeatureFlag` satırı = bir modül anahtarının yüzdesel/allowlist açılışı;
 *     modül kapısı (`lib/module-gate.ts`) her istekte değerlendirir. Kodda okunmayan bayrak
 *     oluşturmak yapısal olarak imkânsız: anahtar yalnız katalog modülü olabilir.
 *  3. A/B deneyleri — `Settings.innovationPlatform.campaignAb` (hash tabanlı yapışkan atama,
 *     `innovation_ab_*` gösterim/dönüşüm olayları) + sunucuda istatistik (Wilson, z-testi, SRM).
 */
import { z } from 'zod';

// ───────────────────────────── Ortak ─────────────────────────────

export const ReasonField = z
  .string()
  .trim()
  .min(5, 'Gerekçe en az 5 karakter olmalı.')
  .max(500, 'Gerekçe en fazla 500 karakter olabilir.');

export type ModuleScope = 'customer' | 'dealer' | 'admin' | 'platform';
export type ModuleSeverity = 'critical' | 'important' | 'optional';
/** Zorlama seviyesi — koddan türetilir, elle yazılmaz. */
export type Enforcement = 'api' | 'page' | 'server' | 'landing' | 'menu' | 'none';

export const SCOPE_LABEL: Record<ModuleScope, string> = {
  customer: 'Müşteri',
  dealer: 'Bayi',
  admin: 'Yönetim',
  platform: 'Platform',
};

export const SEVERITY_LABEL: Record<ModuleSeverity, string> = {
  critical: 'Kritik',
  important: 'Önemli',
  optional: 'İsteğe bağlı',
};

export const ENFORCEMENT_LABEL: Record<Enforcement, string> = {
  api: 'API kapısı',
  page: 'Sayfa kapısı',
  server: 'Sunucu mantığı',
  landing: 'Açık site bölümü',
  menu: 'Yalnız menü',
  none: 'Etkisiz',
};

export const ENFORCEMENT_HINT: Record<Enforcement, string> = {
  api: 'Kapatınca bağlı API uçları 403 döner; menü de gizlenir.',
  page: 'Kapatınca sayfa sunucuda engellenir.',
  server: 'Kapatınca sunucu mantığı bu anahtarı okuyup davranışını değiştirir.',
  landing: 'Kapatınca açık sitedeki bölüm gizlenir.',
  menu: 'Kapatınca yalnız menüden gizlenir; adres ve API erişilebilir kalır.',
  none: 'Bu anahtarı okuyan kod yok. Kapatmak hiçbir şeyi değiştirmez, bu yüzden değiştirilemez.',
};

// ───────────────────────────── Modüller ─────────────────────────────

export type GateEndpoint = { endpoint: string; methods: string[]; file: string };

export type ModuleBindings = {
  api: GateEndpoint[];
  pages: string[];
  server: string[];
  landing: string[];
  menu: string[];
};

export type BlockCounts = { global: number; role: number; rollout: number; anonymous: number; total: number };

export type RoleMatrix = { customer: boolean | null; dealer: boolean | null; system: boolean | null };

export type ModuleChange = {
  at: string;
  key: string;
  from: boolean | null;
  to: boolean | null;
  actor: string | null;
  reason: string | null;
  source: 'feature_control' | 'settings' | 'rollout';
  summary: string;
};

export type ModuleRow = {
  key: string;
  label: string;
  description: string;
  scope: ModuleScope;
  severity: ModuleSeverity;
  enabled: boolean;
  enforcement: Enforcement;
  bindings: ModuleBindings;
  roles: RoleMatrix;
  blocks24h: BlockCounts;
  rollout: RolloutSummary | null;
  adminHref: string | null;
  previewPath: string | null;
  lastChange: ModuleChange | null;
};

export type UnknownGateKey = { key: string; files: string[] };

export type ModulesOverview = {
  generatedAt: string;
  version: string | null;
  modules: ModuleRow[];
  unknownKeys: UnknownGateKey[];
  totals: {
    modules: number;
    disabled: number;
    roleRestricted: number;
    inert: number;
    apiGated: number;
    blocks24h: number;
    activeRollouts: number;
    runningExperiments: number;
  };
  killSwitches: { featureFlags: boolean; abTesting: boolean };
};

export const PatchModuleBody = z
  .object({
    enabled: z.boolean(),
    reason: ReasonField,
    baseVersion: z.string().max(64).nullable(),
  })
  .strict();
export type PatchModuleInput = z.infer<typeof PatchModuleBody>;

export const HistoryQuery = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,64}$/).optional(),
  kind: z.enum(['all', 'module', 'rollout', 'experiment']).default('all'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  size: z.coerce.number().int().min(10).max(100).default(25),
});
export type HistoryQueryInput = z.infer<typeof HistoryQuery>;

export type HistoryItem = {
  id: string;
  at: string;
  kind: 'module' | 'rollout' | 'experiment';
  subject: string;
  action: string;
  summary: string;
  actor: string | null;
  reason: string | null;
};

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

// ───────────────────────────── Kademeli açılış ─────────────────────────────

export type RolloutSummary = {
  active: boolean;
  percent: number;
  allowCount: number;
  expiresAt: string | null;
  expired: boolean;
};

export type RolloutRow = {
  id: string;
  key: string;
  label: string;
  scope: ModuleScope | null;
  active: boolean;
  percent: number;
  allowUserIds: string[];
  expiresAt: string | null;
  expired: boolean;
  note: string | null;
  owner: string | null;
  updatedAt: string;
  moduleEnabled: boolean | null;
  enforcement: Enforcement | null;
};

export type OrphanFlag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  updatedAt: string;
  archivedAt: string | null;
};

export type RolloutsState = {
  rollouts: RolloutRow[];
  orphans: OrphanFlag[];
  killSwitchOn: boolean;
  candidates: { key: string; label: string; scope: ModuleScope; enforcement: Enforcement }[];
};

const CUID_LIKE = /^[a-zA-Z0-9_-]{6,64}$/;

export const UpsertRolloutBody = z
  .object({
    active: z.boolean(),
    percent: z.number().int().min(0, 'Yüzde 0–100 olmalı.').max(100, 'Yüzde 0–100 olmalı.'),
    allowUserIds: z.array(z.string().regex(CUID_LIKE, 'Geçersiz kullanıcı kimliği.')).max(200, 'En fazla 200 kullanıcı.').default([]),
    expiresAt: z
      .string()
      .datetime({ offset: true, message: 'Geçerli bir tarih girin.' })
      .nullable()
      .default(null),
    note: z.string().trim().max(300).nullable().default(null),
    reason: ReasonField,
    baseUpdatedAt: z.string().max(64).nullable(),
  })
  .strict();
export type UpsertRolloutInput = z.infer<typeof UpsertRolloutBody>;

export const ArchiveFlagBody = z.object({ reason: ReasonField }).strict();

// ───────────────────────────── Deneyler ─────────────────────────────

export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: 'Taslak',
  running: 'Çalışıyor',
  paused: 'Duraklatıldı',
  completed: 'Tamamlandı',
};

export const DIMENSIONS = ['copy', 'push_title', 'push_hour', 'banner_image'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const DIMENSION_LABEL: Record<Dimension, string> = {
  copy: 'Metin',
  push_title: 'Bildirim başlığı',
  push_hour: 'Bildirim saati',
  banner_image: 'Afiş görseli',
};

export type ExperimentRow = {
  id: string;
  name: string;
  status: ExperimentStatus;
  dimension: Dimension;
  hypothesis: string | null;
  primaryMetric: string | null;
  variantA: string;
  variantB: string;
  splitPercentB: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  winner: 'A' | 'B' | null;
  decisionNote: string | null;
  owner: string | null;
  /** Eski /admin/innovation'dan gelen ve yaşam döngüsü alanı olmayan kayıt. */
  legacy: boolean;
};

export type ExperimentsState = {
  version: string | null;
  experiments: ExperimentRow[];
  killSwitchOn: boolean;
  defaultSplitPercentForB: number;
};

const ID_RE = /^[a-z0-9][a-z0-9_-]{2,47}$/;
const HOUR_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const VariantFields = {
  name: z.string().trim().min(3, 'Ad en az 3 karakter.').max(120),
  dimension: z.enum(DIMENSIONS),
  hypothesis: z.string().trim().max(500).nullable().default(null),
  primaryMetric: z.string().trim().max(160).nullable().default(null),
  variantA: z.string().trim().min(1, 'A varyantı boş olamaz.').max(500),
  variantB: z.string().trim().min(1, 'B varyantı boş olamaz.').max(500),
  splitPercentB: z.number().int().min(1, 'B payı %1–99 olmalı.').max(99, 'B payı %1–99 olmalı.'),
};

function dimensionRefine(v: { dimension: Dimension; variantA: string; variantB: string }, ctx: z.RefinementCtx) {
  if (v.dimension === 'push_hour') {
    if (!HOUR_RE.test(v.variantA)) ctx.addIssue({ code: 'custom', path: ['variantA'], message: 'Saat SS:DD biçiminde olmalı (ör. 18:30).' });
    if (!HOUR_RE.test(v.variantB)) ctx.addIssue({ code: 'custom', path: ['variantB'], message: 'Saat SS:DD biçiminde olmalı (ör. 19:00).' });
  }
  if (v.dimension === 'banner_image') {
    for (const k of ['variantA', 'variantB'] as const) {
      if (!/^https:\/\/\S+$/.test(v[k])) ctx.addIssue({ code: 'custom', path: [k], message: 'Görsel adresi https ile başlamalı.' });
    }
  }
}

export const CreateExperimentBody = z
  .object({
    id: z.string().trim().toLowerCase().regex(ID_RE, 'Anahtar küçük harf, rakam, - veya _ olmalı (3–48 karakter).'),
    ...VariantFields,
    baseVersion: z.string().max(64).nullable(),
  })
  .strict()
  .superRefine(dimensionRefine);
export type CreateExperimentInput = z.infer<typeof CreateExperimentBody>;

export const EditExperimentBody = z
  .object({
    action: z.literal('edit'),
    ...VariantFields,
    baseVersion: z.string().max(64).nullable(),
  })
  .strict()
  .superRefine(dimensionRefine);

export const TransitionExperimentBody = z
  .object({
    action: z.enum(['start', 'pause', 'resume', 'complete']),
    winner: z.enum(['A', 'B']).nullable().optional(),
    reason: ReasonField,
    baseVersion: z.string().max(64).nullable(),
  })
  .strict();

export const DeleteDraftBody = z.object({ action: z.literal('delete'), baseVersion: z.string().max(64).nullable() }).strict();

export const ExperimentActionBody = z.union([EditExperimentBody, TransitionExperimentBody, DeleteDraftBody]);
export type ExperimentActionInput = z.infer<typeof ExperimentActionBody>;

export const AssignmentQuery = z.object({ subject: z.string().trim().min(3).max(200) });

export type VariantStats = {
  variant: 'A' | 'B';
  expectedShare: number;
  exposedUsers: number;
  convertedUsers: number;
  impressions: number;
  conversions: number;
  anonymousImpressions: number;
  rate: number | null;
  ci: [number, number] | null;
};

export type ExperimentResults = {
  experimentId: string;
  window: { from: string | null; to: string };
  variants: [VariantStats, VariantStats];
  comparison: {
    /** B − A, yüzde puanı. */
    diffPp: number | null;
    diffCi: [number, number] | null;
    /** (B − A) / A, yüzde. */
    relativeLift: number | null;
    pValue: number | null;
    verdict: 'insufficient' | 'not_significant' | 'b_better' | 'a_better';
  };
  srm: { chi2: number | null; pValue: number | null; mismatch: boolean };
  minSample: number;
  daily: { day: string; aImpr: number; bImpr: number; aConv: number; bConv: number }[];
  generatedAt: string;
};

export type AssignmentCheck = {
  subject: string;
  resolvedUserId: string | null;
  label: string | null;
  bucket: number;
  variant: 'A' | 'B';
  experimentActive: boolean;
};
