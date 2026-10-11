/**
 * Bayi Ayarlar okuma modeli — sayfa (RSC) ve `GET /api/dealer/settings` aynı fonksiyonu
 * kullanır. Tek paralel tur; yazma yan etkisi YOK, GET'te LLM çağrısı YOK.
 *
 * Hata görünür (denetim B1/B4): kullanıcı satırı okunamazsa fırlatır → sayfa hata durumu
 * gösterir; varsayılan değerlerle form açılıp sonra o varsayılanlar kaydedilmez.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { versionFromContent, versionFromDate, NO_VERSION } from '@/lib/settings-version';
import { getLearningRetrainSuggestion } from '@/lib/ai-learning';
import { getModuleControls } from '@/lib/module-gate';
import { isR2Configured } from '@/lib/r2-storage';
import { deviceLabel } from '@/lib/customer-settings/device-label';
import { istanbulDay, addDays } from '@/components/ds/page/date-range';
import {
  REVOKE_SESSIONS_ACTION,
  SECURITY_EVENT_ACTIONS,
  type AccountSettings,
  type AiSection,
  type AiSettingsView,
  type BusinessSettings,
  type DealerSettingsSnapshot,
  type LearningStatus,
} from './contract';
import { hoursFromStored } from './hours';

export class DealerSettingsNotFoundError extends Error {
  constructor() {
    super('USER_NOT_FOUND');
    this.name = 'DealerSettingsNotFoundError';
  }
}

export interface LoadContext {
  jti?: string | null;
  userAgent?: string | null;
  now?: Date;
}

const PASSWORD_ACTIONS = ['CHANGE_PASSWORD', 'SET_INITIAL_PASSWORD', 'PASSWORD_RESET'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** İşletme alanlarının sürüm özeti (logo ayrı uçtan yazılır, sürüme girmez). */
export const BUSINESS_VERSION_SELECT = {
  businessName: true,
  businessDesc: true,
  address: true,
  latitude: true,
  longitude: true,
  businessHours: true,
  holidayMode: true,
  defaultReplyTemplate: true,
} as const;

export const ACCOUNT_VERSION_SELECT = {
  name: true,
  phone: true,
  image: true,
  preferredLanguage: true,
} as const;

function pick(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = row[k] ?? null;
  return out;
}

export function businessVersionOf(row: Record<string, unknown>): string {
  return versionFromContent(pick(row, Object.keys(BUSINESS_VERSION_SELECT)));
}

export function accountVersionOf(row: Record<string, unknown>): string {
  return versionFromContent(pick(row, Object.keys(ACCOUNT_VERSION_SELECT)));
}

export const AI_DEFAULTS = {
  isEnabled: true,
  autoAnalyze: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  weeklyReportEnabled: true,
  customPrompt: null as string | null,
};

export function toAiView(
  row: {
    isEnabled: boolean;
    autoAnalyze: boolean;
    alertOnToxic: boolean;
    alertOnUrgent: boolean;
    alertOnChurnRisk: boolean;
    weeklyReportEnabled: boolean;
    customPrompt: string | null;
    updatedAt: Date;
  } | null
): AiSettingsView {
  if (!row) return { ...AI_DEFAULTS, version: NO_VERSION, isDefault: true };
  return {
    isEnabled: row.isEnabled,
    autoAnalyze: row.autoAnalyze,
    alertOnToxic: row.alertOnToxic,
    alertOnUrgent: row.alertOnUrgent,
    alertOnChurnRisk: row.alertOnChurnRisk,
    weeklyReportEnabled: row.weeklyReportEnabled,
    customPrompt: row.customPrompt ?? null,
    version: versionFromDate(row.updatedAt),
    isDefault: false,
  };
}

export const AI_SETTINGS_SELECT = {
  isEnabled: true,
  autoAnalyze: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  weeklyReportEnabled: true,
  customPrompt: true,
  updatedAt: true,
} as const;

function learningStatus(raw: string | null | undefined): LearningStatus {
  return raw === 'idle' || raw === 'training' || raw === 'ready' ? raw : 'unknown';
}

/** AI bölümü: ayar + istatistik + öğrenme. LLM YOK. */
export async function loadAiSection(dealerId: string, now: Date = new Date()): Promise<AiSection> {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since24 = new Date(now.getTime() - DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const firstDay = addDays(istanbulDay(now), -6);

  const [row, controls, profile, correctionsTotal, analyzedTotal, analyzedLast24h, pendingLast30d, usageLast7d, dailyRows, retrain] =
    await Promise.all([
      prisma.aISettings.findUnique({ where: { dealerId }, select: AI_SETTINGS_SELECT }),
      getModuleControls().catch(() => ({}) as Record<string, boolean>),
      prisma.aIDealerLearningProfile.findUnique({
        where: { dealerId },
        select: { status: true, lastTrainedAt: true, trainingFeedbackCount: true, correctionsUsed: true },
      }),
      prisma.aIFeedbackCorrection.count({ where: { dealerId } }),
      prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null, aiProcessedAt: { not: null } } }),
      prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null, aiProcessedAt: { gte: since24 } } }),
      prisma.feedback.count({
        where: { qrCode: { dealerId }, deletedAt: null, aiProcessedAt: null, text: { not: null }, createdAt: { gte: since30 } },
      }),
      prisma.aIUsageLog.count({ where: { dealerId, createdAt: { gte: since7 } } }),
      prisma.$queryRaw<Array<{ d: string; c: bigint }>>(Prisma.sql`
        SELECT to_char(((f."aiProcessedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS d,
               COUNT(*)::bigint AS c
        FROM "Feedback" f
        INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId}
          AND f."deletedAt" IS NULL
          AND f."aiProcessedAt" IS NOT NULL
          AND f."aiProcessedAt" >= ${new Date(now.getTime() - 8 * DAY_MS)}
        GROUP BY 1
      `),
      getLearningRetrainSuggestion(dealerId).catch(() => null),
    ]);

  const counts = new Map(dailyRows.map((r) => [r.d, Number(r.c)]));
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(firstDay, i);
    return { date, count: counts.get(date) ?? 0 };
  });

  return {
    moduleEnabled: (controls as Record<string, boolean>).ai_features !== false,
    settings: toAiView(row),
    stats: {
      analyzedTotal,
      analyzedLast24h,
      pendingLast30d,
      usageLast7d,
      daily,
      learning:
        profile || correctionsTotal > 0 || retrain
          ? {
              status: learningStatus(profile?.status),
              lastTrainedAt: profile?.lastTrainedAt ? profile.lastTrainedAt.toISOString() : null,
              trainingFeedbackCount: profile?.trainingFeedbackCount ?? 0,
              correctionsUsed: profile?.correctionsUsed ?? 0,
              correctionsTotal,
              retrain: retrain
                ? {
                    shouldRetrain: retrain.shouldRetrain,
                    reason: retrain.reason,
                    newFeedbackCount: retrain.newFeedbackCount,
                    newCorrectionsCount: retrain.newCorrectionsCount,
                  }
                : null,
            }
          : null,
    },
  };
}

export async function loadDealerSettings(dealerId: string, ctx: LoadContext = {}): Promise<DealerSettingsSnapshot> {
  const now = ctx.now ?? new Date();

  const [user, ai, pushRows, lastPassword, lastRevoke, events, tokenUsage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dealerId },
      select: {
        ...BUSINESS_VERSION_SELECT,
        ...ACCOUNT_VERSION_SELECT,
        email: true,
        createdAt: true,
        businessLogo: true,
        password: true,
        twoFactorEnabled: true,
        twoFactorVerifiedAt: true,
        accounts: { select: { provider: true } },
      },
    }),
    loadAiSection(dealerId, now),
    prisma.pushSubscription.findMany({
      where: { userId: dealerId, isActive: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
      take: 20,
    }),
    prisma.auditLog.findFirst({
      where: { userId: dealerId, action: { in: PASSWORD_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.auditLog.findFirst({
      where: { userId: dealerId, action: REVOKE_SESSIONS_ACTION },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { userId: dealerId, action: { in: [...SECURITY_EVENT_ACTIONS] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, createdAt: true, userAgent: true },
    }),
    ctx.jti ? prisma.sessionTokenUsage.findUnique({ where: { jti: ctx.jti }, select: { createdAt: true } }) : Promise.resolve(null),
  ]);

  if (!user) throw new DealerSettingsNotFoundError();

  const remainingRecoveryCodes = user.twoFactorEnabled
    ? await prisma.twoFactorRecoveryCode.count({ where: { userId: dealerId, usedAt: null } })
    : 0;

  const stored = hoursFromStored(user.businessHours);
  const business: BusinessSettings = {
    businessName: user.businessName ?? '',
    businessDesc: user.businessDesc ?? null,
    address: user.address ?? null,
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    logo: user.businessLogo ?? null,
    hours: stored.hours,
    hoursLegacy: stored.legacy,
    holidayMode: user.holidayMode === true,
    defaultReplyTemplate: user.defaultReplyTemplate ?? null,
    version: businessVersionOf(user as unknown as Record<string, unknown>),
    logoUploadEnabled: isR2Configured(),
  };

  const account: AccountSettings = {
    name: user.name ?? '',
    email: user.email,
    phone: user.phone ?? null,
    image: user.image ?? null,
    preferredLanguage: user.preferredLanguage === 'en' ? 'en' : 'tr',
    memberSince: user.createdAt.toISOString(),
    version: accountVersionOf(user as unknown as Record<string, unknown>),
  };

  return {
    business,
    account,
    ai,
    pushDevices: pushRows.map((p) => ({
      id: p.id,
      label: deviceLabel(p.userAgent) ?? '',
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
    })),
    security: {
      hasPassword: !!user.password,
      providers: [...new Set(user.accounts.map((a) => a.provider).filter((p) => p !== 'credentials'))],
      twoFactor: {
        enabled: user.twoFactorEnabled,
        since: user.twoFactorVerifiedAt ? user.twoFactorVerifiedAt.toISOString() : null,
        remainingRecoveryCodes,
      },
      lastPasswordChangeAt: lastPassword?.createdAt.toISOString() ?? null,
      lastSessionsRevokedAt: lastRevoke?.createdAt.toISOString() ?? null,
      currentDevice: deviceLabel(ctx.userAgent),
      sessionStartedAt: tokenUsage?.createdAt.toISOString() ?? null,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        at: e.createdAt.toISOString(),
        device: deviceLabel(e.userAgent),
      })),
    },
  };
}
