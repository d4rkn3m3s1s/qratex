/**
 * Yeni geri bildirim → AI analizi yönlendirmesi (P0-32, `/api/feedbacks` POST).
 *
 * Eskiden `/api/feedbacks` kendi satır içi analiz kopyasını çalıştırıyordu:
 *  - Bayi AI ayarı OKUNAMAZSA analiz yine başlıyordu (fail-open; "AI kapalı" ayarı geçici bir
 *    DB hatasında atlatılabiliyordu),
 *  - `aiAttempts` talebi / koşullu `aiProcessedAt` yazımı yoktu (cron ile yarışabilir),
 *  - toksik uyarısı bayinin `alertOnToxic` tercihine bakmadan ve tekilleştirilmeden yazılıyordu.
 *
 * Artık tek kural: karar `lib/ai-policy` ile TAZE ve fail-closed okunur; analiz yalnız
 * `runFeedbackAnalyzePipeline` üzerinden (Inngest ve `ai-retry` ile AYNI hat) yapılır.
 * Analiz yapılmayan her durumda yalnız kural tabanlı otomatik yanıt motoru çalışır
 * (atomik ve tek seferlik; AI üsluplu yanıt kendi içinde yine politikaya bakar).
 */
import { canAutoAnalyze, getDealerAiPolicy } from '@/lib/ai-policy';
import { processAutoReplies } from '@/lib/auto-reply-engine';
import {
  MIN_ANALYZABLE_TEXT_LENGTH,
  runFeedbackAnalyzePipeline,
} from '@/lib/inngest/feedback-analyze-pipeline';

/**
 * Bu geri bildirim için arka plan AI analizi başlatılmalı mı? Metin kısa/boşsa ya da bayinin
 * AI ana anahtarı veya otomatik analizi kapalıysa (ayar okunamazsa da) `false`.
 */
export async function shouldDispatchFeedbackAnalysis(
  dealerId: string,
  text: string | null | undefined
): Promise<boolean> {
  if (!text || text.trim().length < MIN_ANALYZABLE_TEXT_LENGTH) return false;
  try {
    const policy = await getDealerAiPolicy(dealerId, { fresh: true });
    return policy.source !== 'unavailable' && canAutoAnalyze(policy);
  } catch {
    return false; // fail-closed
  }
}

/** Analiz yok: yalnız kural tabanlı otomatik yanıt (asla fırlatmaz). */
export async function runAutoRepliesOnly(feedbackId: string): Promise<void> {
  try {
    await processAutoReplies(feedbackId);
  } catch (err) {
    console.error('[FEEDBACK_AI] otomatik yanıt motoru başarısız:', err);
  }
}

/**
 * Satır içi (Inngest kuyruğu kapalıyken) analiz: ortak hattı çalıştırır. Hat kayıt atlarsa
 * (AI bu arada kapatıldı, bütçe, eşzamanlı koşu) otomatik yanıt kuralları yine çalışır;
 * hat başarılıysa yanıt motorunu zaten kendisi çağırmıştır. Asla fırlatmaz.
 */
export async function runInlineFeedbackAnalysis(feedbackId: string): Promise<void> {
  try {
    const result = await runFeedbackAnalyzePipeline(feedbackId, { source: 'event' });
    if ('skipped' in result) await runAutoRepliesOnly(feedbackId);
  } catch (err) {
    console.error('[FEEDBACK_AI] analiz hattı başarısız:', err instanceof Error ? err.message : err);
    // Yanıt yazımı koşullu/atomik olduğundan tekrar çağrı güvenli.
    await runAutoRepliesOnly(feedbackId);
  }
}
