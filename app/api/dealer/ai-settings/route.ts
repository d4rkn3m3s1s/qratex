/**
 * Dealer AI ayarları: GET (ayarlar + istatistikler), PATCH (ayar güncelleme).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

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

  const [settings, learningProfile, embeddingsCount, correctionsCount, analyzedCount, analyzedLast24h, usageLogs7d, dailyAnalyzed] = await Promise.all([
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
      where: { dealerId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    // Son 7 gün günlük analiz sayısı (Feedback.aiProcessedAt bazlı)
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const feedbacks = await prisma.feedback.findMany({
        where: { qrCode: { dealerId }, deletedAt: null, aiProcessedAt: { gte: since, not: null } },
        select: { aiProcessedAt: true },
      });
      const dayCounts: Record<string, number> = {};
      for (const f of feedbacks) {
        const d = f.aiProcessedAt!;
        const key = new Date(d).toISOString().slice(0, 10);
        dayCounts[key] = (dayCounts[key] ?? 0) + 1;
      }
      const result: { date: string; label: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        result.push({
          date: dateStr,
          label: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(d),
          count: dayCounts[dateStr] ?? 0,
        });
      }
      return result;
    })(),
  ]);

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

  return NextResponse.json({
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
  });
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

  return NextResponse.json({ success: true, settings: updated });
}
