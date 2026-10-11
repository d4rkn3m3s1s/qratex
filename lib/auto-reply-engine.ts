/**
 * Otomatik yanıt / olay motoru.
 *
 * P0-32 değişmezleri (idempotent, tek seferlik):
 *  - Yanıt `updateMany … WHERE dealerReply IS NULL AND dealerRepliedAt IS NULL AND deletedAt IS NULL`
 *    ile ATOMİK yazılır. Koşulu kazanamayan çağrı (bayi elle yanıtladı, başka koşu yazdı,
 *    kayıt silindi) müşteriye bildirim / e-posta GÖNDERMEZ. Bayinin yanıtı asla ezilmez.
 *  - Olay (incident) açma, geri bildirim başına advisory lock + mevcut kayıt kontrolüyle
 *    tek seferliktir (Inngest retry, ai-retry cron'u, inline yol aynı anda koşsa bile).
 *  - Toksik, silinmiş ya da güven işaretli geri bildirime otomatik YANIT yazılmaz
 *    (olay açma kuralları yine çalışır).
 *  - AI üsluplu yanıt yalnız bayinin AI ana anahtarı açıksa ve yorum enjeksiyon şüpheli DEĞİLSE
 *    üretilir; çıktı moderasyondan geçemezse (vaat, bağlantı, aşırı uzunluk) şablona düşülür.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getDealerAiPolicy, canUseAi } from '@/lib/ai-policy';
import { moderateAutoReply } from '@/lib/ai-prompt-safety';
import { matchReplyCondition, parseStoredCondition, renderReplyTemplate } from '@/lib/dealer-automation/reply-rules';

export interface AutoReplyRuleCondition {
  field: 'rating' | 'sentiment' | 'text';
  op: 'lte' | 'gte' | 'eq' | 'contains';
  value: string | number;
  keywords?: string[];
  wholeWord?: boolean;
}

/**
 * Kuralın eşleşip eşleşmediği — saf fonksiyon (test edilebilir). Saklanan koşul önce
 * `parseStoredCondition` ile doğrulanır: motorun eşleştiremeyeceği eski bozuk kombinasyonlar
 * (ör. `text` + `lte`) hiçbir zaman eşleşmez ve arayüzde "tetiklenemez" olarak işaretlenir.
 * Metin eşleşmesi Türkçe büyük/küçük harf + aksan katlamalı, çoklu anahtar kelimelidir.
 */
export function matchesAutoReplyCondition(
  condition: AutoReplyRuleCondition | Record<string, unknown> | null | undefined,
  feedback: { rating: number | null; sentiment: string | null; text: string | null }
): boolean {
  return matchReplyCondition(parseStoredCondition(condition), feedback);
}

/** Motorun her etkisi (yanıt yazıldı / olay açıldı) için kural geçmişi kaydı. */
export const AUTO_REPLY_FIRED_EVENT = 'auto_reply_fired';

async function recordFired(dealerId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await prisma.analyticsEvent.create({ data: { userId: dealerId, event: AUTO_REPLY_FIRED_EVENT, category: 'dealer', data: data as Prisma.InputJsonValue } });
  } catch (err) {
    console.error('[AUTO_REPLY] kural geçmişi yazılamadı:', err);
  }
}

/** Yanıt veren bayinin gösterim adını çözer (e-posta için). */
async function resolveDealerNameForEmail(dealerId: string): Promise<string> {
  const d = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { businessName: true, name: true },
  });
  return d?.businessName || d?.name || 'İşletme';
}

/** AI üsluplu yanıt: politika + moderasyon; uygun değilse null (çağıran şablona düşer). */
async function maybeGenerateAiReply(params: {
  dealerId: string;
  text: string;
  /** Puansız geri bildirimde 0 → istemde "-" (eskiden 5 sayılıyordu, denetim B6). */
  rating: number | null;
  tone: string;
}): Promise<string | null> {
  const policy = await getDealerAiPolicy(params.dealerId);
  if (!canUseAi(policy)) return null;
  try {
    const { generateAutoReply } = await import('@/lib/ai-engine');
    const aiReply = await generateAutoReply(params.text, params.rating ?? 0, params.tone, params.dealerId);
    const verdict = moderateAutoReply(aiReply);
    if (!verdict.ok) {
      if (aiReply) console.warn('[AUTO_REPLY] AI yanıtı moderasyondan geçmedi:', verdict.reason);
      return null;
    }
    return verdict.text;
  } catch (err) {
    console.error('[AUTO_REPLY] AI yanıtı üretilemedi, şablona düşülüyor:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Geri bildirim başına TEK olay: advisory lock (feedbackId) + mevcut olay kontrolü aynı
 * transaction içinde. Oluşturulduysa true.
 */
async function createIncidentOnce(params: {
  dealerId: string;
  feedbackId: string;
  ruleId: string;
  ruleName: string;
  template: string;
  rating: number | null;
  text: string | null;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auto-incident:${params.feedbackId}`}))`;
    const existing = await tx.incident.findFirst({
      where: {
        dealerId: params.dealerId,
        type: 'FEEDBACK',
        metadata: { path: ['feedbackId'], equals: params.feedbackId },
      },
      select: { id: true },
    });
    if (existing) return false;
    await tx.incident.create({
      data: {
        dealerId: params.dealerId,
        title: `Otomatik kural: ${params.ruleName}`,
        description: `[Sistem] Kural tetiklendi: ${params.template}\n\nMüşteri Puanı: ${params.rating ?? '-'}\nYorum: ${params.text || '-'}`,
        severity: params.rating !== null && params.rating <= 2 ? 'high' : 'medium',
        status: 'open',
        type: 'FEEDBACK',
        metadata: { feedbackId: params.feedbackId, ruleId: params.ruleId, source: 'auto-reply-rule' },
      },
    });
    return true;
  });
}

export type AutoReplyOutcome =
  | { action: 'none'; reason: string }
  | { action: 'reply'; written: boolean; ai: boolean }
  | { action: 'incident'; created: boolean };

export async function processAutoReplies(feedbackId: string): Promise<AutoReplyOutcome> {
  try {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: {
        id: true,
        userId: true,
        rating: true,
        sentiment: true,
        text: true,
        isToxic: true,
        trustFlagged: true,
        deletedAt: true,
        dealerReply: true,
        dealerRepliedAt: true,
        aiAnalysis: true,
        user: { select: { name: true, preferredLanguage: true } },
        qrCode: { select: { dealerId: true } },
      },
    });

    if (!feedback || !feedback.qrCode) return { action: 'none', reason: 'not-found' };
    if (feedback.deletedAt) return { action: 'none', reason: 'deleted' };

    const dealerId = feedback.qrCode.dealerId;

    const rules = await prisma.autoReplyRule.findMany({
      where: { dealerId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    if (rules.length === 0) return { action: 'none', reason: 'no-rules' };

    // Yalnız en yüksek öncelikli / ilk eşleşen kural çalışır.
    // Geçersiz (tetiklenemez) koşullu kural atlanır.
    const rule = rules.find((r) => matchReplyCondition(parseStoredCondition(r.condition), feedback));
    if (!rule) return { action: 'none', reason: 'no-match' };

    if (rule.action === 'reply') {
      if (feedback.dealerReply || feedback.dealerRepliedAt) return { action: 'none', reason: 'already-replied' };
      if (feedback.isToxic || feedback.trustFlagged) return { action: 'none', reason: 'unsafe-feedback' };

      const dealerName = await resolveDealerNameForEmail(dealerId);
      let finalReply = renderReplyTemplate(rule.template, {
        musteri: feedback.user?.name ?? null,
        isletme: dealerName,
        puan: feedback.rating,
      });
      let usedAi = false;
      // Enjeksiyon şüpheli yorumda müşteriye giden AI metni üretilmez (denetim O1): şablon kalır.
      const injectionSuspect =
        !!feedback.aiAnalysis &&
        typeof feedback.aiAnalysis === 'object' &&
        (feedback.aiAnalysis as { injectionSuspect?: unknown }).injectionSuspect === true;
      if (rule.tone && feedback.text && !injectionSuspect) {
        const aiReply = await maybeGenerateAiReply({
          dealerId,
          text: feedback.text,
          rating: feedback.rating,
          tone: rule.tone,
        });
        if (aiReply) {
          finalReply = aiReply;
          usedAi = true;
        }
      }

      // ATOMİK TEK SEFERLİK YAZIM: bayi elle yanıtladıysa / başka koşu yazdıysa count=0.
      const written = await prisma.feedback.updateMany({
        where: { id: feedback.id, dealerReply: null, dealerRepliedAt: null, deletedAt: null },
        data: { dealerReply: finalReply, dealerRepliedAt: new Date() },
      });
      if (written.count === 0) return { action: 'reply', written: false, ai: usedAi };
      await recordFired(dealerId, { ruleId: rule.id, feedbackId: feedback.id, action: 'reply', ai: usedAi });

      if (feedback.userId) {
        const en = feedback.user?.preferredLanguage === 'en';
        await prisma.notification.create({
          data: {
            userId: feedback.userId,
            title: en ? 'Your feedback got a reply' : 'Geri bildiriminize yanıt var',
            message: en ? `${dealerName} replied to your feedback.` : `${dealerName} geri bildiriminize yanıt verdi.`,
            type: 'info',
          },
        });
        // Transactional e-posta (opt-out kontrollü, ateşle-unut).
        const customerId = feedback.userId;
        import('@/lib/notify-email')
          .then(({ emailDealerReply }) => emailDealerReply({ customerId, dealerName, feedbackSnippet: feedback.text }))
          .catch((err) => console.error('[AUTO_REPLY_EMAIL]', err));
      }
      return { action: 'reply', written: true, ai: usedAi };
    }

    if (rule.action === 'incident') {
      const created = await createIncidentOnce({
        dealerId,
        feedbackId: feedback.id,
        ruleId: rule.id,
        ruleName: rule.name,
        template: rule.template,
        rating: feedback.rating,
        text: feedback.text,
      });
      if (created) await recordFired(dealerId, { ruleId: rule.id, feedbackId: feedback.id, action: 'incident', ai: false });
      return { action: 'incident', created };
    }

    return { action: 'none', reason: 'unknown-action' };
  } catch (error) {
    console.error('Error processing auto-replies:', error);
    return { action: 'none', reason: 'error' };
  }
}
