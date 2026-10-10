/**
 * Kullanıcı otomasyonu — koşul ve aksiyon şemaları + sınırlar (TEK kaynak, P0-19).
 *
 * Önceki durum: execute ucu koşul/aksiyonları `z.record` ile şekil doğrulamadan kabul
 * ediyordu; `set_role: ADMIN` ile toplu yetki yükseltmesi ve sınırsız tutarla toplu puan
 * mümkündü. Bu dosya kural kaydı, dry-run, execute ve iş kuyruğu (process anında yeniden
 * doğrulama) için ortak doğrulayıcıdır.
 */
import { z } from 'zod';

export const AUTOMATION_LIMITS = {
  /** Kişi başı tek aksiyonda |puan| üst sınırı. */
  maxPointsPerUser: 10_000,
  /** Kişi başı tek aksiyonda XP üst sınırı. */
  maxXpPerUser: 10_000,
  /** Bir çalıştırmanın toplam |puan| etkisi (kişi × tutar, bütün add_points aksiyonları). */
  maxRunPointsAbs: 200_000,
  /** Bir çalıştırmada en fazla hedef kullanıcı. */
  maxUsersPerRun: 1_000,
  defaultUsersPerRun: 500,
  /** Kural başına en fazla aksiyon. */
  maxActions: 5,
} as const;

export const automationConditionSchema = z
  .object({
    role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).optional(),
    minPoints: z.number().int().min(0).max(100_000_000).optional(),
    maxPoints: z.number().int().min(0).max(100_000_000).optional(),
    minLevel: z.number().int().min(1).max(1000).optional(),
    maxLevel: z.number().int().min(1).max(1000).optional(),
    createdBeforeDays: z.number().int().min(0).max(36_500).optional(),
    createdAfterDays: z.number().int().min(0).max(36_500).optional(),
    emailIncludes: z.string().trim().max(120).optional(),
    businessNameIncludes: z.string().trim().max(120).optional(),
  })
  .strict();

const fmt = (n: number) => n.toLocaleString('tr-TR');

export const automationActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('add_points'),
      amount: z
        .number()
        .int('Puan tutarı tam sayı olmalı')
        .refine((n) => n !== 0, 'Puan tutarı sıfır olamaz')
        .refine(
          (n) => Math.abs(n) <= AUTOMATION_LIMITS.maxPointsPerUser,
          `Kişi başı puan tutarı en fazla ${fmt(AUTOMATION_LIMITS.maxPointsPerUser)} olabilir`
        ),
      reason: z.string().trim().min(5, 'Puan aksiyonu için en az 5 karakterlik gerekçe yazın').max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('add_xp'),
      amount: z
        .number()
        .int('XP tutarı tam sayı olmalı')
        .min(1, 'XP tutarı en az 1 olmalı')
        .max(AUTOMATION_LIMITS.maxXpPerUser, `XP tutarı en fazla ${fmt(AUTOMATION_LIMITS.maxXpPerUser)} olabilir`),
    })
    .strict(),
  // Otomasyon kimseyi ADMIN yapamaz; ADMIN hedefler motor tarafından atlanır.
  z.object({ type: z.literal('set_role'), role: z.enum(['DEALER', 'CUSTOMER']) }).strict(),
  z
    .object({
      type: z.literal('send_notification'),
      title: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(1000),
      notificationType: z.enum(['info', 'success', 'warning', 'error']).optional(),
    })
    .strict(),
]);

export const automationActionsSchema = z
  .array(automationActionSchema)
  .min(1, 'En az bir aksiyon tanımlayın')
  .max(AUTOMATION_LIMITS.maxActions, `Bir kuralda en fazla ${AUTOMATION_LIMITS.maxActions} aksiyon olabilir`);

export type ValidatedCondition = z.infer<typeof automationConditionSchema>;
export type ValidatedAction = z.infer<typeof automationActionSchema>;

export type ParsedAutomation =
  | { ok: true; condition: ValidatedCondition; actions: ValidatedAction[] }
  | { ok: false; error: string };

/** Kayıtlı (JSON) koşul/aksiyonları yeniden doğrular — eski/bozuk kurallar çalışmaz (fail-closed). */
export function parseAutomation(condition: unknown, actions: unknown): ParsedAutomation {
  const c = automationConditionSchema.safeParse(condition ?? {});
  if (!c.success) return { ok: false, error: `Geçersiz koşul: ${c.error.errors[0]?.message ?? 'bilinmeyen alan'}` };
  const a = automationActionsSchema.safeParse(actions);
  if (!a.success) return { ok: false, error: `Geçersiz aksiyon: ${a.error.errors[0]?.message ?? 'bilinmeyen alan'}` };
  return { ok: true, condition: c.data, actions: a.data };
}

/** Kişi başı toplam puan etkisi (işaretli) ve XP. */
export function perUserImpact(actions: ValidatedAction[]): { points: number; xp: number } {
  let points = 0;
  let xp = 0;
  for (const a of actions) {
    if (a.type === 'add_points') points += a.amount;
    if (a.type === 'add_xp') xp += a.amount;
  }
  return { points, xp };
}

/** Bir çalıştırmanın toplam etkisi ve tavan kararı. */
export function runImpact(actions: ValidatedAction[], affectedCount: number) {
  const per = perUserImpact(actions);
  const absPerUser = actions.reduce((s, a) => (a.type === 'add_points' ? s + Math.abs(a.amount) : s), 0);
  const totalPointsDelta = per.points * affectedCount;
  const totalPointsAbs = absPerUser * affectedCount;
  return {
    perUserPoints: per.points,
    perUserXp: per.xp,
    totalPointsDelta,
    totalXp: per.xp * affectedCount,
    totalPointsAbs,
    withinCap: totalPointsAbs <= AUTOMATION_LIMITS.maxRunPointsAbs,
  };
}

/** Koşul/aksiyon içeriğinin kararlı parmak izi: onaylanan içerik ile çalışan içerik aynı mı? */
export function automationFingerprint(condition: unknown, actions: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = stable((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify({ c: stable(condition ?? {}), a: stable(actions ?? []) });
}

/**
 * Dört göz kuralı: onaylayan, kuralı oluşturan ya da içeriğini son değiştiren kişi olamaz.
 * Döner: hata mesajı ya da null (onay geçerli).
 */
export function approvalViolation(rule: {
  createdById: string;
  updatedById?: string | null;
  approverId: string;
}): string | null {
  if (rule.approverId === rule.createdById) {
    return 'Kuralı oluşturan kişi kendi kuralını onaylayamaz; başka bir yönetici onaylamalı.';
  }
  if (rule.updatedById && rule.approverId === rule.updatedById) {
    return 'Kuralı son değiştiren kişi onaylayamaz; başka bir yönetici onaylamalı.';
  }
  return null;
}

/** Çalıştırılabilir mi? (aktif + onaylı + onaylayan oluşturandan farklı) */
export function executionBlocker(rule: {
  isActive: boolean;
  approvedAt: Date | string | null;
  approvedById: string | null;
  createdById: string;
}): string | null {
  if (!rule.isActive) return 'Pasif kural çalıştırılamaz.';
  if (!rule.approvedAt || !rule.approvedById) {
    return 'Kural henüz onaylanmadı. Başka bir yönetici onayladıktan sonra çalıştırılabilir.';
  }
  if (rule.approvedById === rule.createdById) {
    return 'Kural, oluşturan kişi tarafından onaylanmış; geçerli bir ikinci onay gerekli.';
  }
  return null;
}
