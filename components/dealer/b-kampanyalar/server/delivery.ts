/**
 * Kampanya teslimi — elle "Şimdi gönder" ve planlı gönderimin (günlük iş) ORTAK yolu.
 *
 *  1. Kampanya bu bayinin, durumu gönderilebilir, kanalı gerçek (sahte e-posta yok), segmenti geçerli.
 *  2. Plan: kitle → izin (fail-closed) → frekans tavanı → en fazla 1000 kişi → kontrol grubu.
 *  3. TEK transaction: durum kilidi (`draft|failed|scheduled → sent`, çift gönderim yok) +
 *     uygulama içi bildirimler (`data.kind='campaign'`, `campaignId`, `dealerId`) + gönderim kaydı
 *     (alıcı listesi, kanal kümeleri, kontrol grubu). Biri başarısızsa hiçbiri yazılmaz;
 *     kampanya gönderilmemiş durumda kalır ve yeniden denenebilir (denetim Bulgu 4).
 *  4. Push transaction DIŞINDA, sınırlı eşzamanlılıkla (Bulgu 5); bağlantı izlenen yönlendirme
 *     (`/api/campaigns/:id/open`) — açılma huniye girer. Sonuç ayrı denetim satırı.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildMarketingNotificationRows, isSupportedCampaignChannel, sendMarketingPush } from '@/lib/marketing-delivery';
import { normalizeSegment, normalizeStatus, SENDABLE_STATUSES, type CampaignStatus } from '../domain';
import { buildSendPlan } from './audience';
import { CampaignError, loadOwnedCampaign } from './common';
import {
  ACTION_PUSH_RESULT,
  ACTION_SEND,
  CAMPAIGN_ENTITY,
  snapshotJson,
  type SendSnapshot,
} from './snapshot';

export type DeliveryActor =
  | { type: 'user'; userId: string; snapshot?: { email?: string | null; role?: string | null; name?: string | null } }
  | { type: 'cron' };

export interface DeliveryResult {
  campaignId: string;
  sentAt: string;
  recipientCount: number;
  inAppCount: number;
  pushAttempted: number;
  pushDelivered: number;
  holdoutCount: number;
  optedOutCount: number;
  frequencyCappedCount: number;
  truncatedCount: number;
  ineligibleCount: number;
}

/** Push bildirimi tıklanınca açılma kaydedilip mekân sayfasına gidilir. */
export function campaignOpenPath(campaignId: string): string {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/open`;
}

export async function deliverCampaign(input: {
  dealerId: string;
  campaignId: string;
  holdoutPct: number;
  trigger: 'manual' | 'schedule';
  actor: DeliveryActor;
  now?: Date;
}): Promise<DeliveryResult> {
  const now = input.now ?? new Date();
  // Yabancı ya da olmayan kampanya → 404 (varlık sızdırılmaz).
  const campaign = await loadOwnedCampaign(input.dealerId, input.campaignId);

  const status = normalizeStatus(campaign.status);
  if (!SENDABLE_STATUSES.includes(status)) {
    throw new CampaignError(
      'NOT_SENDABLE',
      status === 'sent' || status === 'archived' ? 'Bu kampanya zaten gönderildi.' : 'Bu kampanya şu an gönderilemez.'
    );
  }
  if (!isSupportedCampaignChannel(campaign.channel)) {
    throw new CampaignError(
      'CHANNEL_UNSUPPORTED',
      'Bu kampanyanın kanalı (e-posta) desteklenmiyor. Kampanyayı düzenleyip uygulama içi bildirim ve push ile gönderin.'
    );
  }
  const segment = normalizeSegment(campaign.targetSegment);
  if (!segment) {
    throw new CampaignError('SEGMENT_INVALID', 'Kampanyanın hedef kitlesi tanınmıyor. Düzenleyip bir kitle seçin.');
  }

  const { plan } = await buildSendPlan({
    dealerId: input.dealerId,
    campaignId: campaign.id,
    segment,
    holdoutPct: input.holdoutPct,
    now,
  });

  if (plan.recipientIds.length === 0) {
    throw new CampaignError('NO_RECIPIENTS', noRecipientMessage(plan), {
      candidateCount: plan.candidateCount,
      optedOutCount: plan.optedOutCount,
      frequencyCappedCount: plan.frequencyCappedCount,
      ineligibleCount: plan.ineligibleCount,
    });
  }

  const snapshot: SendSnapshot = {
    v: 1,
    campaignId: campaign.id,
    dealerId: input.dealerId,
    segment,
    sentAt: now.toISOString(),
    trigger: input.trigger,
    recipients: plan.recipientIds,
    inApp: plan.appUserIds,
    push: plan.pushUserIds,
    holdout: plan.holdoutIds,
    holdoutPct: plan.holdoutPct,
    candidateCount: plan.candidateCount,
    ineligibleCount: plan.ineligibleCount,
    optedOutCount: plan.optedOutCount,
    frequencyCappedCount: plan.frequencyCappedCount,
    truncatedCount: plan.truncatedCount,
  };

  const actorFields = actorAuditFields(input.actor);
  const fromStatuses: CampaignStatus[] = [...SENDABLE_STATUSES];

  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.campaign.updateMany({
      where: { id: campaign.id, dealerId: input.dealerId, status: { in: fromStatuses } },
      data: { status: 'sent', sentAt: now, sentCount: plan.recipientIds.length },
    });
    if (claim.count === 0) return false;
    if (plan.appUserIds.length > 0) {
      await tx.notification.createMany({
        data: buildMarketingNotificationRows(plan.appUserIds, {
          title: campaign.title,
          message: campaign.message,
          type: 'campaign',
          data: { campaignId: campaign.id, dealerId: input.dealerId },
        }),
      });
    }
    await tx.auditLog.create({
      data: {
        ...actorFields,
        action: ACTION_SEND,
        entity: CAMPAIGN_ENTITY,
        entityId: campaign.id,
        newData: snapshotJson(snapshot),
      },
    });
    return true;
  });
  if (!claimed) {
    throw new CampaignError('STATE_CHANGED', 'Kampanyanın durumu az önce değişti (başka bir sekmeden gönderilmiş olabilir). Sayfayı yenileyin.');
  }

  let pushDelivered = 0;
  if (plan.pushUserIds.length > 0) {
    pushDelivered = await sendMarketingPush(plan.pushUserIds, {
      title: campaign.title,
      message: campaign.message,
      url: campaignOpenPath(campaign.id),
    });
    try {
      await prisma.auditLog.create({
        data: {
          ...actorFields,
          action: ACTION_PUSH_RESULT,
          entity: CAMPAIGN_ENTITY,
          entityId: campaign.id,
          newData: { attempted: plan.pushUserIds.length, delivered: pushDelivered } as Prisma.InputJsonObject,
        },
      });
    } catch (err) {
      // Teslim gerçekleşti; yalnız sayım satırı yazılamadı → performans ekranı "bilinmiyor" der.
      console.error('[campaigns] push sonucu kaydedilemedi', campaign.id, err);
    }
  }

  return {
    campaignId: campaign.id,
    sentAt: now.toISOString(),
    recipientCount: plan.recipientIds.length,
    inAppCount: plan.appUserIds.length,
    pushAttempted: plan.pushUserIds.length,
    pushDelivered,
    holdoutCount: plan.holdoutIds.length,
    optedOutCount: plan.optedOutCount,
    frequencyCappedCount: plan.frequencyCappedCount,
    truncatedCount: plan.truncatedCount,
    ineligibleCount: plan.ineligibleCount,
  };
}

function noRecipientMessage(plan: { candidateCount: number; optedOutCount: number; frequencyCappedCount: number }): string {
  if (plan.candidateCount === 0) return 'Bu kitlede henüz müşteri yok. Başka bir kitle seçin.';
  if (plan.frequencyCappedCount > 0 && plan.optedOutCount < plan.candidateCount) {
    return 'Bu kitledeki izinli müşteriler son 7 günde işletmenizden yeterince ileti aldı (haftada en fazla 2). Birkaç gün sonra tekrar deneyin.';
  }
  return 'Bu kitledeki müşterilerin tümü kampanya bildirimlerini kapatmış; gönderilecek kimse yok.';
}

export function actorAuditFields(actor: DeliveryActor): Pick<Prisma.AuditLogUncheckedCreateInput, 'userId' | 'actorType' | 'actorSnapshot'> {
  if (actor.type === 'cron') return { userId: null, actorType: 'cron' };
  return {
    userId: actor.userId,
    actorType: 'user',
    ...(actor.snapshot ? { actorSnapshot: actor.snapshot as Prisma.InputJsonObject } : {}),
  };
}

