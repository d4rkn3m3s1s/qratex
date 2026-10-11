/**
 * Bağış kampanyaları (/admin/donations) — istemci + sunucu ORTAK sözleşme.
 * Müşteri tarafıyla AYNI kurallar (`lib/customer-wallet/donate/impact.ts`): kategori yalnız
 * bilinen 5 anahtar, `goal ≥ 1`, `perPoint > 0`, etiket ≤ 8 × 40 karakter (rapor B4).
 *
 * Yaşam döngüsü şema değişmeden mevcut alanlardan TÜRETİLİR (rapor B2 — "Soft Freeze" sahteydi
 * ve kaldırıldı):
 *   archived  → `archivedAt` dolu (bağış geçmişi korunur; müşteride görünmez)
 *   inactive  → `isActive = false` (taslak / durdurulmuş; müşteride görünmez)
 *   scheduled → aktif ama `startDate` gelecekte
 *   ended     → aktif ama `endDate` geçmiş
 *   live      → bağış alıyor (hedefe ulaştıysa "tamamlandı" rozeti ayrıca gösterilir)
 */
import { z } from 'zod';
import { KNOWN_CATEGORIES, type KnownCategory } from '@/lib/customer-wallet/donate/impact';

export { KNOWN_CATEGORIES };
export type { KnownCategory };

export const CATEGORY_LABEL: Record<KnownCategory, string> = {
  water: 'Su',
  education: 'Eğitim',
  environment: 'Çevre',
  animals: 'Hayvanlar',
  health: 'Sağlık',
};

export const PROJECT_STATUSES = ['live', 'scheduled', 'ended', 'inactive', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'Bağış alıyor',
  scheduled: 'Planlandı',
  ended: 'Süresi doldu',
  inactive: 'Kapalı',
  archived: 'Arşivde',
};

export function projectStatus(
  p: { isActive: boolean; archivedAt: string | Date | null; startDate: string | Date; endDate: string | Date | null },
  now: Date = new Date()
): ProjectStatus {
  if (p.archivedAt) return 'archived';
  if (!p.isActive) return 'inactive';
  const t = now.getTime();
  if (new Date(p.startDate).getTime() > t) return 'scheduled';
  if (p.endDate && new Date(p.endDate).getTime() <= t) return 'ended';
  return 'live';
}

export const GOAL_MAX = 100_000_000;
export const PER_POINT_MAX = 1_000_000;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Tarih geçersiz.');

export const impactSchema = z.object({
  unit: z.string().trim().min(1, 'Birim gerekli (ör. litre).').max(40, 'Birim en fazla 40 karakter.'),
  label: z.string().trim().min(2, 'Etki etiketi gerekli (ör. Temiz su).').max(80, 'Etki etiketi en fazla 80 karakter.'),
  perPoint: z
    .number({ invalid_type_error: 'Oran sayı olmalı.' })
    .positive('1 puanın etkisi 0’dan büyük olmalı.')
    .max(PER_POINT_MAX, 'Oran çok büyük.'),
});
export type ImpactInput = z.infer<typeof impactSchema>;

export const projectUpsertSchema = z
  .object({
    name: z.string().trim().min(3, 'Ad en az 3 karakter.').max(80, 'Ad en fazla 80 karakter.'),
    description: z.string().trim().min(20, 'Açıklama en az 20 karakter.').max(2000, 'Açıklama en fazla 2000 karakter.'),
    icon: z
      .string()
      .trim()
      .min(1, 'Bir simge seçin.')
      .max(16, 'Simge tek bir emoji olmalı.'),
    category: z.enum(KNOWN_CATEGORIES, { errorMap: () => ({ message: 'Kategori seçin.' }) }),
    goal: z.number({ invalid_type_error: 'Hedef sayı olmalı.' }).int('Hedef tam sayı olmalı.').min(1, 'Hedef en az 1 puan.').max(GOAL_MAX, 'Hedef çok büyük.'),
    impact: impactSchema,
    tags: z.array(z.string().trim().min(2, 'Etiket en az 2 karakter.').max(40, 'Etiket en fazla 40 karakter.')).max(8, 'En fazla 8 etiket.').default([]),
    isFeatured: z.boolean().default(false),
    isActive: z.boolean().default(false),
    startDate: dateString,
    endDate: dateString.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && Date.parse(v.endDate) <= Date.parse(v.startDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Bitiş, başlangıçtan sonra olmalı.' });
    }
    const seen = new Set<string>();
    v.tags.forEach((t, i) => {
      const k = t.toLocaleLowerCase('tr-TR');
      if (seen.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tags', i], message: 'Etiket tekrar ediyor.' });
      seen.add(k);
    });
  });
export type ProjectUpsertValues = z.infer<typeof projectUpsertSchema>;

/** PATCH: tam form + iyimser kilit (`baseUpdatedAt` — sunucudaki `updatedAt` ile eşleşmeli). */
export const projectPatchSchema = z.object({
  values: projectUpsertSchema,
  baseUpdatedAt: z.string().min(1),
});

export const PROJECT_ACTIONS = ['activate', 'deactivate', 'feature', 'unfeature', 'archive', 'restore', 'reconcile'] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];
export const projectActionSchema = z
  .object({
    action: z.enum(PROJECT_ACTIONS),
    reason: z.string().trim().max(300).optional(),
    /** Uzlaştırmada istemcinin gördüğü gerçek toplam (arada bağış geldiyse 409). */
    expectedTotal: z.number().int().min(0).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.action === 'archive' || v.action === 'reconcile') && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Gerekçe en az 5 karakter.' });
    }
  });
export type ProjectActionInput = z.infer<typeof projectActionSchema>;

export const PROJECT_SORTS = ['newest', 'progress', 'raised', 'goal', 'name'] as const;
export const projectListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().transform((v) => (v && v.length >= 2 ? v : undefined)),
  status: z.enum(PROJECT_STATUSES).optional().catch(undefined),
  category: z.enum(KNOWN_CATEGORIES).optional().catch(undefined),
  sort: z.enum(PROJECT_SORTS).default('newest').catch('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  size: z.coerce.number().int().min(10).max(100).default(20).catch(20),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const transactionQuerySchema = z.object({
  projectId: z.string().regex(ID_RE).optional().catch(undefined),
  q: z.string().trim().max(80).optional().transform((v) => (v && v.length >= 2 ? v : undefined)),
  from: dayString.optional().catch(undefined),
  to: dayString.optional().catch(undefined),
  minPoints: z.coerce.number().int().min(1).max(10_000_000).optional().catch(undefined),
  visibility: z.enum(['public', 'private']).optional().catch(undefined),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(10).max(100).default(25).catch(25),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

// ───────────────────────────── DTO'lar ─────────────────────────────

export type ProjectRow = {
  id: string;
  name: string;
  icon: string;
  category: KnownCategory | 'other';
  rawCategory: string;
  status: ProjectStatus;
  featured: boolean;
  goal: number;
  /** Projede kayıtlı ilerleme (müşteriye gösterilen). */
  current: number;
  /** Bağış kayıtlarının gerçek toplamı (şeffaf toplam). */
  raised: number;
  donations: number;
  donors: number;
  percent: number | null;
  completed: boolean;
  impact: ImpactInput | null;
  startDate: string;
  endDate: string | null;
  lastDonationAt: string | null;
  updatedAt: string;
};

export type ProjectListPage = { items: ProjectRow[]; total: number; page: number; size: number };

export type DonationStats = {
  totalPoints: number;
  donations: number;
  donors: number;
  last30Points: number;
  last30Donations: number;
  avgDonation: number | null;
  /** Son 30 gün (İstanbul günleri, eski → yeni) puan serisi. */
  series: Array<{ day: string; points: number; donations: number }>;
  projects: Record<ProjectStatus, number> & { total: number; completed: number };
  /** Şeffaf toplam: kayıtlı ilerleme ile gerçek bağış toplamı farklı olan projeler. */
  mismatchedProjects: number;
  /** Puan defterinde bağış olarak düşülen toplam (makbuzlu bağışlar). */
  ledgerPoints: number;
  /** Defter satırı olmayan (eski, makbuzsuz) bağış sayısı. */
  unreceiptedDonations: number;
  moduleEnabled: boolean;
  asOf: string;
};

export type AuditItem = { id: string; at: string; actor: string | null; action: string; summary: string };

export type ProjectDetail = ProjectRow & {
  description: string;
  tags: string[];
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  series: Array<{ day: string; points: number }>;
  topDonors: Array<{ userId: string; name: string; email: string | null; points: number; donations: number }>;
  recent: TransactionRow[];
  history: AuditItem[];
};

export type TransactionRow = {
  id: string;
  receiptNo: string;
  at: string;
  points: number;
  message: string | null;
  isPublic: boolean;
  user: { id: string; name: string | null; email: string | null };
  project: { id: string; name: string; icon: string };
};

export type TransactionPage = { items: TransactionRow[]; nextCursor: string | null };

export type TransactionDetail = TransactionRow & {
  impact: { value: number; unit: string; label: string } | null;
  ledger: { id: string; delta: number; balanceAfter: number | null; status: string; at: string } | null;
};

/** "100 puan = 10 litre" — oran insan okunur. */
export function ratioText(impact: ImpactInput | null, base = 100): string {
  if (!impact) return 'Etki tanımsız';
  const value = Math.round(base * impact.perPoint * 100) / 100;
  return `${base.toLocaleString('tr-TR')} puan = ${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${impact.unit}`;
}

/** Müşteriyle aynı hesap (yuvarlama yok; 2 ondalık). */
export function impactFor(points: number, perPoint: number): number {
  return Math.round(points * perPoint * 100) / 100;
}

export function buildTxQs(q: Partial<Record<keyof TransactionQuery, string | number | undefined | null>>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  return sp.toString();
}

/** Kampanya listesi sorgu dizesi — sunucu ön yüklemesi ve istemci aynı sırayla üretir (önbellek eşleşmesi). */
export function buildProjectQs(v: { q?: string; status?: string; category?: string; sort?: string; page: number; size: number }): string {
  const sp = new URLSearchParams();
  if (v.q) sp.set('q', v.q);
  if (v.status) sp.set('status', v.status);
  if (v.category) sp.set('category', v.category);
  sp.set('sort', v.sort || 'newest');
  sp.set('page', String(v.page));
  sp.set('size', String(v.size));
  return sp.toString();
}
