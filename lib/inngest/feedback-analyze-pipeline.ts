/**
 * Geri bildirim AI analizi — Inngest lambda boyutu için burada tutulur;
 * `/api/inngest` sadece bu pipeline'ı HTTP ile tetikler (Vercel 250MB sınırı).
 */
import { prisma } from '@/lib/prisma';
import { analyzeWithFallback } from '@/lib/ai-engine';
import {
  formatAdaptiveProfile,
  getAdaptiveProfileForDealer,
  maybeTriggerAdaptiveUpdate,
  storeFeedbackEmbedding,
} from '@/lib/ai-learning';
import { processAutoReplies } from '@/lib/auto-reply-engine';

export type FeedbackAnalyzePipelineResult =
  | { skipped: true; reason: string }
  | { success: true; sentiment: string };

export async function runFeedbackAnalyzePipeline(feedbackId: string): Promise<FeedbackAnalyzePipelineResult> {
  const f = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: { qrCode: { select: { dealerId: true } } },
  });
  if (!f || !f.text || f.text.trim().length < 5) {
    return { skipped: true, reason: 'no-text' };
  }
  const feedback = { id: f.id, text: f.text, dealerId: f.qrCode.dealerId };

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

  const analysis = await analyzeWithFallback(feedback.text, {
    customPrompt: aiSettings?.customPrompt || undefined,
    adaptiveProfile: adaptiveProfileText,
    dealerId: feedback.dealerId,
  });

  // Gerçek LLM yoksa (local-fallback) zayıf keyword sentiment'i gerçek AI gibi
  // yazmayız — sadece kaba isToxic + etiket, aiProcessedAt NULL.
  const isFallback = analysis.modelUsed === 'local-fallback';
  await prisma.feedback.update({
    where: { id: feedbackId },
    data: isFallback
      ? {
          isToxic: analysis.toxicity.isToxic,
          aiModelUsed: 'local-fallback',
        }
      : {
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
          statementSentiments: analysis.statementSentiments
            ? JSON.parse(JSON.stringify(analysis.statementSentiments))
            : null,
          actionSuggestions: analysis.actionSuggestions ? JSON.parse(JSON.stringify(analysis.actionSuggestions)) : null,
          aiProcessedAt: new Date(),
          aiModelUsed: analysis.modelUsed || null,
          aiVersion: analysis.version || null,
        },
  });

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

  await storeFeedbackEmbedding({ feedbackId, dealerId: feedback.dealerId, text: feedback.text });
  await maybeTriggerAdaptiveUpdate(feedback.dealerId);
  await processAutoReplies(feedbackId);

  return { success: true, sentiment: analysis.sentiment.label };
}
