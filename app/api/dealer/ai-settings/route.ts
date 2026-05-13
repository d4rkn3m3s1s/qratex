/**
 * Dealer AI ayarları: GET (ayarlar + istatistikler), PATCH (ayar güncelleme).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

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

export async function GET() {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
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
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'DEALER' ? session.user.id : session.user.id;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  const keys = [
    'isEnabled', 'autoAnalyze', 'analysisLanguage', 'sentimentEnabled', 'emotionEnabled',
    'topicEnabled', 'intentEnabled', 'urgencyEnabled', 'entityEnabled', 'toxicityEnabled',
    'churnEnabled', 'themeClusterEnabled', 'weeklyReportEnabled', 'monthlyReportEnabled',
    'alertOnToxic', 'alertOnUrgent', 'alertOnChurnRisk', 'customPrompt',
  ] as const;
  for (const k of keys) {
    if (body[k] !== undefined) updateData[k] = body[k];
  }

  const updated = await prisma.aISettings.upsert({
    where: { dealerId },
    update: updateData,
    create: {
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

  return NextResponse.json({ success: true, settings: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}
