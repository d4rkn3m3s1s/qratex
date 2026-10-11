/**
 * Dealer AI ayarları (ESKİ uç; yeni yüzey `/api/dealer/settings/ai`): GET (ayarlar + istatistikler),
 * PATCH (ayar güncelleme).
 *
 * Güvenlik (guvenlik-bayi-api Y6/D5): PATCH eskiden gövdeyi tipsiz yazıyordu — `customPrompt`
 * uzunluk sınırı ve enjeksiyon denetimi olmadan kaydedilebiliyor (yeni uçtaki 1000 karakter +
 * `detectPromptInjection` kuralı bu uçtan dolanılıyordu), yanlış tip 500 veriyordu ve ADMIN kendi
 * kimliğine anlamsız bir ayar satırı açabiliyordu. Artık: yalnız DEALER, katı zod şeması (bilinmeyen
 * alan 400), yeni uçla aynı bağlam sınırı/enjeksiyon kuralı, `ai_features` modül kapısı, oran
 * sınırı ve yazımdan sonra AI politika önbelleği bayatlatılır.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { detectPromptInjection } from '@/lib/prompt-injection';
import { AI_CONTEXT_MAX } from '@/lib/dealer-settings/contract';
import {
  NO_VERSION,
  VersionConflictError,
  baseVersionRequiredResponse,
  isVersionConflictError,
  lockResource,
  nextUpdatedAt,
  readBaseVersion,
  versionConflictResponse,
  versionFromDate,
} from '@/lib/settings-version';

export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  isEnabled: true,
  autoAnalyze: true,
  analysisLanguage: 'tr',
  sentimentEnabled: true,
  emotionEnabled: true,
  topicEnabled: true,
  intentEnabled: true,
  urgencyEnabled: true,
  entityEnabled: true,
  toxicityEnabled: true,
  churnEnabled: true,
  themeClusterEnabled: true,
  weeklyReportEnabled: true,
  monthlyReportEnabled: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  customPrompt: null as string | null,
};

const legacyAiPatchSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    autoAnalyze: z.boolean().optional(),
    analysisLanguage: z.enum(['tr', 'en']).optional(),
    sentimentEnabled: z.boolean().optional(),
    emotionEnabled: z.boolean().optional(),
    topicEnabled: z.boolean().optional(),
    intentEnabled: z.boolean().optional(),
    urgencyEnabled: z.boolean().optional(),
    entityEnabled: z.boolean().optional(),
    toxicityEnabled: z.boolean().optional(),
    churnEnabled: z.boolean().optional(),
    themeClusterEnabled: z.boolean().optional(),
    weeklyReportEnabled: z.boolean().optional(),
    monthlyReportEnabled: z.boolean().optional(),
    alertOnToxic: z.boolean().optional(),
    alertOnUrgent: z.boolean().optional(),
    alertOnChurnRisk: z.boolean().optional(),
    customPrompt: z
      .string()
      .trim()
      .max(AI_CONTEXT_MAX, `İşletme bağlamı en çok ${AI_CONTEXT_MAX} karakter olabilir`)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    baseVersion: z.string().min(1).max(128).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.id;
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let useSoftDelete = true;
  try {
    await prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null }, take: 1 });
  } catch {
    useSoftDelete = false;
  }

  const dailySql = useSoftDelete
    ? Prisma.sql`
        SELECT (date_trunc('day', f."aiProcessedAt"))::date AS d, COUNT(*)::bigint AS c
        FROM "Feedback" f
        INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId}
          AND f."deletedAt" IS NULL
          AND f."aiProcessedAt" IS NOT NULL
          AND f."aiProcessedAt" >= ${since7}
        GROUP BY 1
        ORDER BY 1
      `
    : Prisma.sql`
        SELECT (date_trunc('day', f."aiProcessedAt"))::date AS d, COUNT(*)::bigint AS c
        FROM "Feedback" f
        INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId}
          AND f."aiProcessedAt" IS NOT NULL
          AND f."aiProcessedAt" >= ${since7}
        GROUP BY 1
        ORDER BY 1
      `;

  const [
    settings,
    learningProfile,
    embeddingsCount,
    correctionsCount,
    analyzedCount,
    analyzedLast24h,
    usageLogs7d,
    dailyRows,
  ] = await Promise.all([
    prisma.aISettings.findUnique({ where: { dealerId } }),
    prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } }),
    prisma.aIEmbedding.count({ where: { dealerId } }),
    prisma.aIFeedbackCorrection.count({ where: { dealerId } }),
    prisma.feedback.count({
      where: { qrCode: { dealerId }, deletedAt: null, aiProcessedAt: { not: null } },
    }),
    prisma.feedback.count({
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        aiProcessedAt: { not: null, gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.aIUsageLog.count({
      where: { dealerId, createdAt: { gte: since7 } },
    }),
    prisma.$queryRaw<Array<{ d: Date; c: bigint }>>(dailySql),
  ]);

  const dayCounts: Record<string, number> = {};
  for (const row of dailyRows) {
    dayCounts[row.d.toISOString().slice(0, 10)] = Number(row.c);
  }
  const dailyAnalyzed: { date: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dailyAnalyzed.push({
      date: dateStr,
      label: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(d),
      count: dayCounts[dateStr] ?? 0,
    });
  }

  const merged = settings
    ? {
        isEnabled: settings.isEnabled,
        autoAnalyze: settings.autoAnalyze,
        analysisLanguage: settings.analysisLanguage,
        sentimentEnabled: settings.sentimentEnabled,
        emotionEnabled: settings.emotionEnabled,
        topicEnabled: settings.topicEnabled,
        intentEnabled: settings.intentEnabled,
        urgencyEnabled: settings.urgencyEnabled,
        entityEnabled: settings.entityEnabled,
        toxicityEnabled: settings.toxicityEnabled,
        churnEnabled: settings.churnEnabled,
        themeClusterEnabled: settings.themeClusterEnabled,
        weeklyReportEnabled: settings.weeklyReportEnabled,
        monthlyReportEnabled: settings.monthlyReportEnabled,
        alertOnToxic: settings.alertOnToxic,
        alertOnUrgent: settings.alertOnUrgent,
        alertOnChurnRisk: settings.alertOnChurnRisk,
        customPrompt: settings.customPrompt,
      }
    : DEFAULT_SETTINGS;

  return NextResponse.json(
    {
      settings: merged,
      // İyimser kilit (P0-28): PATCH bunu `baseVersion` olarak geri ister. Kayıt yoksa 'none'.
      version: settings ? versionFromDate(settings.updatedAt) : NO_VERSION,
      isDefault: !settings,
      stats: {
        analyzedFeedbackCount: analyzedCount,
        analyzedLast24h,
        usageLogsLast7d: usageLogs7d,
        embeddingsCount,
        correctionsCount,
        learningProfile: learningProfile
          ? {
              status: learningProfile.status,
              trainingFeedbackCount: learningProfile.trainingFeedbackCount,
              correctionsUsed: learningProfile.correctionsUsed,
              lastTrainedAt: learningProfile.lastTrainedAt,
            }
          : null,
      },
      dailyAnalyzed,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const dealerId = session.user.id;

  const limited = await enforceRouteRateLimit('dealer.ai-settings.legacy', dealerId, 'mutation');
  if (limited) return limited;
  // Yeni uçla aynı modül kapısı (admin `ai_features`'ı kapattıysa ayar yazılamaz).
  const moduleGate = await import('@/lib/module-gate')
    .then(({ assertModuleEnabled }) => assertModuleEnabled('ai_features', { role: 'dealer' }))
    .catch(() => null);
  if (moduleGate) return moduleGate;

  const rawBody: unknown = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const baseVersion = readBaseVersion(rawBody);
  if (!baseVersion) return baseVersionRequiredResponse();

  const parsed = legacyAiPatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Geçersiz istek', code: 'VALIDATION' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const { baseVersion: _baseVersion, ...body } = parsed.data;
  void _baseVersion;
  if (typeof body.customPrompt === 'string' && detectPromptInjection(body.customPrompt)) {
    return NextResponse.json(
      {
        success: false,
        error: 'İşletme bağlamında izin verilmeyen bir ifade var. Yalnız işletmenizi anlatan düz metin yazın; talimat, kod ya da bağlantı eklemeyin.',
        code: 'VALIDATION',
      },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const updateData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) updateData[k] = v;
  }

  try {
    // Kilit → güncel sürümü oku → baseVersion ile karşılaştır → yaz (tek transaction).
    // Yükleme hatası sonrası "varsayılanlarla Kaydet" ya da iki sekmenin birbirini ezmesi
    // artık 409 ile durur; istemci yalnız değişen alanları gönderir.
    const updated = await prisma.$transaction(async (tx) => {
      await lockResource(tx, `ai-settings:${dealerId}`);
      const current = await tx.aISettings.findUnique({ where: { dealerId }, select: { updatedAt: true } });
      const currentVersion = current ? versionFromDate(current.updatedAt) : NO_VERSION;
      if (baseVersion !== currentVersion) {
        throw new VersionConflictError(currentVersion, [{ key: 'aiSettings', currentVersion }]);
      }
      if (current) {
        return tx.aISettings.update({
          where: { dealerId },
          data: { ...updateData, updatedAt: nextUpdatedAt(current.updatedAt) },
        });
      }
      return tx.aISettings.create({
        data: {
          dealerId,
          isEnabled: body.isEnabled ?? true,
          autoAnalyze: body.autoAnalyze ?? true,
          analysisLanguage: body.analysisLanguage ?? 'tr',
          sentimentEnabled: body.sentimentEnabled ?? true,
          emotionEnabled: body.emotionEnabled ?? true,
          topicEnabled: body.topicEnabled ?? true,
          intentEnabled: body.intentEnabled ?? true,
          urgencyEnabled: body.urgencyEnabled ?? true,
          entityEnabled: body.entityEnabled ?? true,
          toxicityEnabled: body.toxicityEnabled ?? true,
          churnEnabled: body.churnEnabled ?? true,
          themeClusterEnabled: body.themeClusterEnabled ?? true,
          weeklyReportEnabled: body.weeklyReportEnabled ?? true,
          monthlyReportEnabled: body.monthlyReportEnabled ?? true,
          alertOnToxic: body.alertOnToxic ?? true,
          alertOnUrgent: body.alertOnUrgent ?? true,
          alertOnChurnRisk: body.alertOnChurnRisk ?? true,
          customPrompt: body.customPrompt ?? null,
        },
      });
    });

    // Analiz hattı / sohbet ayarı en geç bir sonraki çağrıda görsün (yeni uçla aynı davranış).
    await import('@/lib/ai-policy')
      .then(({ invalidateDealerAiPolicy }) => invalidateDealerAiPolicy(dealerId))
      .catch(() => {});

    return NextResponse.json(
      { success: true, settings: updated, version: versionFromDate(updated.updatedAt) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Dealer AI settings update error:', error);
    return NextResponse.json(
      { success: false, error: 'AI ayarları kaydedilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
