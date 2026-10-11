/**
 * "Geri bildirim oluşturuldu" yan etkileri — OTURUMDAN BAĞIMSIZ (rapor Bulgu 1, kritik).
 *
 * Eskiden analytics, webhook, ısı haritası, cache bayatlatma, AI analizi ve otomatik yanıt
 * tek bir `if (session)` bloğunun içindeydi: QR'ın doğal kullanıcısı olan ANONİM müşterinin
 * yorumu bayiye webhook'la ulaşmıyor, ısı haritasını artırmıyor, AI analizi ertesi gün
 * cron'a (koşu başına 15 kayıt) kalıyordu.
 *
 * Artık her gönderim (anonim, üye, işletme içi) aynı hattan geçer. Ağ/IO işleri `after()`
 * ile yanıt sonrası ama fonksiyon canlıyken çalışır (serverless'ta yarıda kesilmez).
 * Üyeye özel işler (sürpriz/davranışsal rozet, davet nitelendirmesi) yalnız gerçek, işletme
 * dışı üyede.
 */
import { after } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ADMIN_DASHBOARD_TAG, LEADERBOARD_RANKING_TAG } from '@/lib/cache-tags';

export type FeedbackCreatedEvent = {
  feedbackId: string;
  dealerId: string;
  qrCodeId: string;
  rating: number;
  /** Saklanan metin (kullanıcı metni + etiket satırı). */
  text: string | null;
  hasOwnText: boolean;
  tags: string[];
  hasMedia: boolean;
  npsScore: number | null;
  staffSelected: boolean;
  userId: string | null;
  insider: boolean;
  attributionSource: string | null;
  createdAt: Date;
};

/** Yanıt yolunda senkron yapılması gerekenler + `after()` kuyruğu. Asla fırlatmaz. */
export function scheduleFeedbackSideEffects(ev: FeedbackCreatedEvent): void {
  // Admin dashboard + leaderboard sıralama cache'i (istek bağlamında çağrılmalı).
  try {
    revalidateTag(ADMIN_DASHBOARD_TAG, 'max');
    revalidateTag(LEADERBOARD_RANKING_TAG, 'max');
  } catch (err) {
    console.error('[feedback-funnel] cache bayatlatılamadı', err);
  }

  after(async () => {
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: ev.userId,
          event: 'feedback_submitted',
          category: 'feedback',
          data: {
            feedbackId: ev.feedbackId,
            qrCodeId: ev.qrCodeId,
            dealerId: ev.dealerId,
            rating: ev.rating,
            hasText: ev.hasOwnText,
            tags: ev.tags,
            hasMedia: ev.hasMedia,
            hasNps: ev.npsScore != null,
            staffSelected: ev.staffSelected,
            anonymous: ev.userId == null,
            insider: ev.insider,
            attributionSource: ev.attributionSource,
          },
        },
      });
    } catch (err) {
      console.error('[feedback-funnel] feedback_submitted yazılamadı', err);
    }
  });

  after(async () => {
    try {
      const { dispatchWebhookEvent } = await import('@/lib/webhook-dispatch');
      await dispatchWebhookEvent('feedback.created', {
        feedbackId: ev.feedbackId,
        dealerId: ev.dealerId,
        rating: ev.rating,
        hasText: !!ev.text,
        createdAt: ev.createdAt,
      });
    } catch (err) {
      console.error('[feedback-funnel] webhook feedback.created gönderilemedi', err);
    }
  });

  // AI analizi (bayi politikası taze + fail-closed) ya da yalnız otomatik yanıt — P0-32 hattı.
  after(async () => {
    try {
      const dispatch = await import('@/lib/feedback-ai-dispatch');
      if (await dispatch.shouldDispatchFeedbackAnalysis(ev.dealerId, ev.text ?? undefined)) {
        const { inngestQueueEnabled, sendFeedbackAnalyze } = await import('@/lib/inngest/send');
        if (inngestQueueEnabled()) await sendFeedbackAnalyze(ev.feedbackId, ev.dealerId);
        else await dispatch.runInlineFeedbackAnalysis(ev.feedbackId);
      } else {
        await dispatch.runAutoRepliesOnly(ev.feedbackId);
      }
    } catch (err) {
      console.error('[feedback-funnel] AI/otomatik yanıt yönlendirmesi başarısız', err);
    }
  });

  if (ev.userId && !ev.insider) {
    const uid = ev.userId;
    // Hepsi idempotent ([[points-economy-invariants]]): tekrar çağrı puan çoğaltmaz.
    after(() => import('@/lib/surprise-badges').then((m) => m.awardEligibleSurpriseBadges(uid)).catch(() => {}));
    after(() => import('@/lib/activity-badges').then((m) => m.awardActivityBadges(uid)).catch(() => {}));
    after(() => import('@/lib/referral').then((m) => m.maybeQualifyReferral(uid)).catch(() => {}));
  }
}

/** Sonradan hesaba bağlanan yorumda üyeye özel işler (rozet, davet). */
export function scheduleClaimSideEffects(userId: string): void {
  after(() => import('@/lib/surprise-badges').then((m) => m.awardEligibleSurpriseBadges(userId)).catch(() => {}));
  after(() => import('@/lib/activity-badges').then((m) => m.awardActivityBadges(userId)).catch(() => {}));
  after(() => import('@/lib/referral').then((m) => m.maybeQualifyReferral(userId)).catch(() => {}));
}
