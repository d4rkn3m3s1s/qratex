/**
 * Inngest functions (P2-20).
 * feedback/analyze: AI analysis for feedback; retries and DLQ via Inngest.
 */
import { inngest } from './client';
import { prisma } from '@/lib/prisma';
import { processOutbox } from '@/lib/outbox';
import { analyzeWithFallback } from '@/lib/ai-engine';
import { getTenantHealth } from '@/lib/tenant-health';
import {
  deleteAnalyticsEventsOlderThan,
  DEFAULT_RETENTION_DAYS,
} from '@/lib/analytics-event-retention';
import {
  formatAdaptiveProfile,
  getAdaptiveProfileForDealer,
  maybeTriggerAdaptiveUpdate,
  storeFeedbackEmbedding,
} from '@/lib/ai-learning';
import { processAutoReplies } from '@/lib/auto-reply-engine';
import { runCustomerReminderNudges } from '@/lib/customer-reminders';
import { createHmac } from 'crypto';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';

export const analyzeFeedbackFn = inngest.createFunction(
  {
    id: 'feedback-analyze',
    retries: 3,
    concurrency: { key: 'event.data.dealerId', limit: 1 },
  },
  { event: 'feedback/created' },
  async ({ event, step }) => {
    const { feedbackId } = event.data;

    const feedback = await step.run('fetch-feedback', async () => {
      const f = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: { qrCode: { select: { dealerId: true } } },
      });
      if (!f || !f.text || f.text.trim().length < 5) return null;
      return { id: f.id, text: f.text, dealerId: f.qrCode.dealerId };
    });

    if (!feedback) return { skipped: true, reason: 'no-text' };

    let aiSettings: { customPrompt: string | null } | null = null;
    try {
      aiSettings = await prisma.aISettings.findUnique({
        where: { dealerId: feedback.dealerId },
        select: { customPrompt: true },
      });
    } catch {
      /* ignore */
    }

    let adaptiveProfileText: string | undefined;
    try {
      const adaptiveProfile = await getAdaptiveProfileForDealer(feedback.dealerId);
      adaptiveProfileText = adaptiveProfile?.profile ? formatAdaptiveProfile(adaptiveProfile.profile) : undefined;
    } catch {
      adaptiveProfileText = undefined;
    }

    const analysis = await step.run('run-ai-analysis', async () => {
      return analyzeWithFallback(feedback.text, {
        customPrompt: aiSettings?.customPrompt || undefined,
        adaptiveProfile: adaptiveProfileText,
        dealerId: feedback.dealerId,
      });
    });

    await step.run('save-analysis', async () => {
      await prisma.feedback.update({
        where: { id: feedbackId },
        data: {
          sentiment: analysis.sentiment.label,
          emotions: analysis.emotions.map((e) => e.label),
          topics: analysis.topics,
          isToxic: analysis.toxicity.isToxic,
          aiAnalysis: JSON.parse(JSON.stringify(analysis)),
          intent: analysis.intent?.label || null,
          intentScore: analysis.intent?.score || null,
          urgency: analysis.urgency || null,
          effortScore: analysis.effortScore || null,
          churnRisk: analysis.churnRisk || null,
          entities: analysis.entities ? JSON.parse(JSON.stringify(analysis.entities)) : null,
          themes: analysis.themes ? JSON.parse(JSON.stringify(analysis.themes)) : null,
          statementSentiments: analysis.statementSentiments ? JSON.parse(JSON.stringify(analysis.statementSentiments)) : null,
          actionSuggestions: analysis.actionSuggestions ? JSON.parse(JSON.stringify(analysis.actionSuggestions)) : null,
          aiProcessedAt: new Date(),
          aiModelUsed: analysis.modelUsed || null,
          aiVersion: analysis.version || null,
        },
      });
    });

    await step.run('notifications', async () => {
      if (analysis.toxicity.isToxic) {
        await prisma.notification.create({
          data: {
            userId: feedback.dealerId,
            title: '⚠️ Toksik İçerik Tespit Edildi',
            message: 'Bir geri bildirimde uygunsuz içerik tespit edildi. Lütfen inceleyin.',
            type: 'warning',
          },
        });
      }
      if (analysis.urgency && analysis.urgency > 0.7) {
        await prisma.notification.create({
          data: {
            userId: feedback.dealerId,
            title: '🔴 Acil Geri Bildirim',
            message: 'Yüksek aciliyetli bir geri bildirim alındı. Hemen aksiyon gerekebilir.',
            type: 'warning',
          },
        });
      }
      if (analysis.churnRisk && analysis.churnRisk > 0.7) {
        await prisma.notification.create({
          data: {
            userId: feedback.dealerId,
            title: '⚡ Müşteri Kaybı Riski',
            message: 'Bir müşterinin kaybedilme riski yüksek. Geri bildirimi inceleyin.',
            type: 'warning',
          },
        });
      }
    });

    await step.run('post-analysis', async () => {
      await storeFeedbackEmbedding({ feedbackId, dealerId: feedback.dealerId, text: feedback.text });
      await maybeTriggerAdaptiveUpdate(feedback.dealerId);
    });

    await step.run('auto-replies', async () => {
      await processAutoReplies(feedbackId);
    });

    return { success: true, sentiment: analysis.sentiment.label };
  }
);

/** Outbox worker: işlenmemiş event'leri Inngest'e gönder. */
export const outboxProcessFn = inngest.createFunction(
  { id: 'outbox-process', retries: 2 },
  { cron: '*/2 * * * *' },
  async () => {
    const count = await processOutbox();
    return { processed: count };
  }
);

/** Synthetic monitoring: hedef endpoint'leri periyodik kontrol et (P2-20 item 13). */
export const syntheticMonitorFn = inngest.createFunction(
  { id: 'synthetic-monitor', retries: 1 },
  { cron: '*/15 * * * *' },
  async () => {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL || 'localhost:3000'}`
      : 'http://localhost:3000';
    const results: Array<{ name: string; ok: boolean }> = [];
    try {
      const auth = await fetch(`${baseUrl}/api/auth/providers`, { signal: AbortSignal.timeout(10000) });
      results.push({ name: 'auth/providers', ok: auth.status === 200 });
    } catch {
      results.push({ name: 'auth/providers', ok: false });
    }
    try {
      const qr = await fetch(`${baseUrl}/api/qr-codes/public/__synthetic_nonexistent__`, { signal: AbortSignal.timeout(10000) });
      results.push({ name: 'qr-codes/public', ok: qr.status === 404 });
    } catch {
      results.push({ name: 'qr-codes/public', ok: false });
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      // Sentry/ops alert could be triggered here
      return { ok: false, failed: failed.map((f) => f.name), results };
    }
    return { ok: true, results };
  }
);

/** Negatif feedback SLA: cevapsız negatif kayıtları otomatik escalete et (P0 item 4). */
const NEGATIVE_FEEDBACK_SLA_HOURS = parseInt(process.env.NEGATIVE_FEEDBACK_SLA_HOURS || '24', 10);

export const negativeFeedbackSLAFn = inngest.createFunction(
  { id: 'negative-feedback-sla', retries: 2 },
  { cron: '0 * * * *' },
  async () => {
    const cutoff = new Date(Date.now() - NEGATIVE_FEEDBACK_SLA_HOURS * 60 * 60 * 1000);
    const negatives = await prisma.feedback.findMany({
      where: {
        deletedAt: null,
        dealerRepliedAt: null,
        createdAt: { lte: cutoff },
        OR: [
          { rating: { lte: 2 } },
          { sentiment: 'negative' },
        ],
      },
      include: { qrCode: { select: { dealerId: true } } },
    });

    let created = 0;
    for (const fb of negatives) {
      const dealerId = fb.qrCode?.dealerId;
      if (!dealerId) continue;
      const existing = await prisma.incident.findFirst({
        where: {
          dealerId,
          type: 'negative_feedback_sla_breach',
          status: { in: ['open', 'assigned', 'in_progress'] },
          metadata: { path: ['feedbackId'], equals: fb.id },
        },
      });
      if (existing) continue;
      await prisma.incident.create({
        data: {
          dealerId,
          type: 'negative_feedback_sla_breach',
          severity: 'high',
          status: 'open',
          title: `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan negatif geri bildirim`,
          description: `Geri bildirim ID: ${fb.id}. SLA aşıldı, lütfen yanıtlayın.`,
          metadata: { feedbackId: fb.id },
        },
      });
      await prisma.notification.create({
        data: {
          userId: dealerId,
          title: '⏰ SLA Aşımı',
          message: `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan negatif geri bildirim var. Lütfen yanıtlayın.`,
          type: 'warning',
        },
      });
      created++;
    }
    return { checked: negatives.length, incidentsCreated: created };
  }
);

/** P2 Churn playbook: Düşük tenant health dealer'lar için CSMTask oluştur ve bildirim gönder. */
const CHURN_HEALTH_THRESHOLD = parseInt(process.env.CHURN_HEALTH_THRESHOLD || '50', 10);

export const churnPlaybookFn = inngest.createFunction(
  { id: 'churn-playbook', retries: 2 },
  { cron: '0 6 * * *' },
  async () => {
    const healthList = await getTenantHealth();
    const atRisk = healthList.filter((h) => h.healthScore < CHURN_HEALTH_THRESHOLD);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let created = 0;
    for (const h of atRisk) {
      const existing = await prisma.cSMTask.findFirst({
        where: { dealerId: h.dealerId, type: 'churn_risk', createdAt: { gte: weekAgo } },
      });
      if (existing) continue;
      const suggestedActions = [
        { action: 'Geribildirim trendlerini inceleyin', priority: 'high' },
        { action: 'Negatif yanıtları tamamlayın', priority: 'high' },
        { action: 'Müşteri ile iletişime geçin', priority: 'medium' },
      ];
      const telafiDraft =
        'Değerli müşterimiz, yaşadığınız deneyimden dolayı üzgünüz. Sizi tekrar ağırlamak istiyoruz. Size özel bir teklif hazırladık.';
      await prisma.cSMTask.create({
        data: {
          dealerId: h.dealerId,
          type: 'churn_risk',
          status: 'open',
          priority: h.healthScore < 30 ? 'high' : 'medium',
          healthScore: h.healthScore,
          suggestedActions,
          telafiDraft,
          metadata: { negativeRate: h.negativeRate, usageTrend: h.usageTrend },
        },
      });
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: '⚠️ Churn Riski',
            message: `${h.dealerName || h.dealerId} işletmesi risk altında (skor: ${h.healthScore}). CSM görevi oluşturuldu.`,
            type: 'warning',
          },
        });
      }
      created++;
    }
    return { atRiskCount: atRisk.length, tasksCreated: created };
  }
);

/** P3 AI quality review: haftalık 100 rastgele feedback örneği manuel inceleme kuyruğuna ekle. */
const AI_QUALITY_SAMPLE_SIZE = parseInt(process.env.AI_QUALITY_SAMPLE_SIZE || '100', 10);

export const aiQualitySampleFn = inngest.createFunction(
  { id: 'ai-quality-sample', retries: 2 },
  { cron: '0 3 * * 0' },
  async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const feedbacks = await prisma.feedback.findMany({
      where: {
        deletedAt: null,
        aiProcessedAt: { not: null },
        text: { not: null },
        createdAt: { gte: weekAgo },
      },
      select: { id: true },
      take: AI_QUALITY_SAMPLE_SIZE * 2,
      orderBy: { createdAt: 'desc' },
    });

    const existing = await prisma.aIQualitySample.findMany({
      where: { feedbackId: { in: feedbacks.map((f) => f.id) } },
      select: { feedbackId: true },
    });
    const existingIds = new Set(existing.map((e) => e.feedbackId));
    const toAdd = feedbacks.filter((f) => !existingIds.has(f.id)).slice(0, AI_QUALITY_SAMPLE_SIZE);

    const result = await prisma.aIQualitySample.createMany({
      data: toAdd.map((f) => ({ feedbackId: f.id, status: 'pending' })),
      skipDuplicates: true,
    });
    return { checked: feedbacks.length, samplesCreated: result.count };
  }
);

/** Feature flag cleanup: süresi dolan flag'leri disable et. */
export const featureFlagCleanupFn = inngest.createFunction(
  { id: 'feature-flag-cleanup', retries: 2 },
  { cron: '0 * * * *' },
  async () => {
    const result = await prisma.featureFlag.updateMany({
      where: {
        isEnabled: true,
        expiresAt: { lt: new Date(), not: null },
      },
      data: { isEnabled: false },
    });
    return { disabled: result.count };
  }
);

/** AnalyticsEvent retention: 90 günden eski kayıtları günlük siler (P3). */
export const analyticsEventCleanupFn = inngest.createFunction(
  { id: 'analytics-event-cleanup', retries: 2 },
  { cron: '0 3 * * *' },
  async () => {
    const deleted = await deleteAnalyticsEventsOlderThan(DEFAULT_RETENTION_DAYS);
    return { deletedCount: deleted, olderThanDays: DEFAULT_RETENTION_DAYS };
  }
);

/** Customer nudge reminders: geri bildirim yok / puan var yorum yok durumları. */
export const customerReminderNudgeFn = inngest.createFunction(
  { id: 'customer-reminder-nudges', retries: 1 },
  { cron: '0 */6 * * *' },
  async () => {
    return runCustomerReminderNudges();
  }
);

/** Partner POS: 24s NPS özeti webhook (ayar: innovationPlatform.partnerDigest). */
export const partnerDigestWebhookFn = inngest.createFunction(
  { id: 'partner-digest-webhook', retries: 2 },
  { cron: '15 * * * *' },
  async () => {
    const cfg = await getInnovationPlatformConfig();
    const url = cfg.partnerDigest?.webhookUrl?.trim();
    if (!url || !cfg.partnerDigest?.webhookEnabled) {
      return { skipped: true, reason: 'disabled-or-no-url' };
    }
    const payload = await buildPartnerDigestPayload(null);
    const body = JSON.stringify(payload);
    const secret = (cfg.partnerDigest?.webhookSecret || '').trim();
    const sig = secret ? createHmac('sha256', secret).update(body).digest('hex') : '';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Qratex-Event': 'partner.digest.24h',
        ...(sig ? { 'X-Qratex-Signature': `sha256=${sig}` } : {}),
      },
      body,
    });
    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, responsePreview: text.slice(0, 200) };
  }
);
