/**
 * Planlı gönderim.
 *
 * Mimari kural (yol haritası §4.4/12 "tek uyanış"): periyodik iş yalnız günlük orkestratörde
 * (`/api/cron/daily`, 03:00 UTC = 06:00 İstanbul). Bu yüzden planlama GÜN hassasiyetindedir:
 * bayi bir İstanbul günü seçer, kampanya o günün sabahki günlük turunda gönderilir. Arayüz bunu
 * açıkça söyler; saat seçtirip tutamayacağımız bir söz verilmez.
 *
 * Saklama (şema değişmeden): `status='scheduled'`, `sentAt` = seçilen günün İstanbul 00:00'ı.
 * Kontrol grubu tercihi `campaign.schedule` denetim satırında.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addDays, dayDiff, istanbulDay, istanbulDayStart, isValidDay } from '@/components/ds/page/date-range';
import {
  isHoldoutPct,
  normalizeSegment,
  normalizeStatus,
  SCHEDULE_MAX_DAYS_AHEAD,
  SCHEDULE_MIN_DAYS_AHEAD,
} from '../domain';
import { buildSendPlan } from './audience';
import { CampaignError, loadOwnedCampaign } from './common';
import { actorAuditFields, deliverCampaign, type DeliveryActor } from './delivery';
import {
  ACTION_DISPATCH_FAILED,
  ACTION_SCHEDULE,
  ACTION_SCHEDULE_CANCEL,
  CAMPAIGN_ENTITY,
  readScheduledHoldout,
} from './snapshot';

export function scheduleBounds(now: Date = new Date()): { min: string; max: string } {
  const today = istanbulDay(now);
  return { min: addDays(today, SCHEDULE_MIN_DAYS_AHEAD), max: addDays(today, SCHEDULE_MAX_DAYS_AHEAD) };
}

/** Seçilen gün geçerli mi? Geçerliyse planlanan an (İstanbul gününün başı). */
export function resolveScheduleDay(day: string, now: Date = new Date()): { ok: true; at: Date } | { ok: false; message: string } {
  if (!isValidDay(day)) return { ok: false, message: 'Geçerli bir gün seçin.' };
  const { min, max } = scheduleBounds(now);
  if (dayDiff(min, day) < 0) return { ok: false, message: 'Planlı gönderim en erken yarın için seçilebilir. Bugün göndermek için "Şimdi gönder"i kullanın.' };
  if (dayDiff(day, max) < 0) return { ok: false, message: `Planlı gönderim en fazla ${SCHEDULE_MAX_DAYS_AHEAD} gün sonrası için seçilebilir.` };
  return { ok: true, at: istanbulDayStart(day) };
}

export async function scheduleCampaign(input: {
  dealerId: string;
  campaignId: string;
  day: string;
  holdoutPct: number;
  actor: DeliveryActor;
  now?: Date;
}): Promise<{ scheduledFor: string; day: string; recipientEstimate: number }> {
  const now = input.now ?? new Date();
  const when = resolveScheduleDay(input.day, now);
  if (!when.ok) throw new CampaignError('SCHEDULE_INVALID', when.message);
  if (!isHoldoutPct(input.holdoutPct)) throw new CampaignError('SCHEDULE_INVALID', 'Geçersiz kontrol grubu oranı.');

  const campaign = await loadOwnedCampaign(input.dealerId, input.campaignId);
  const status = normalizeStatus(campaign.status);
  if (status !== 'draft' && status !== 'failed' && status !== 'scheduled') {
    throw new CampaignError('NOT_SENDABLE', 'Gönderilmiş kampanya yeniden planlanamaz. Çoğaltıp yeni bir kampanya olarak planlayın.');
  }
  const segment = normalizeSegment(campaign.targetSegment);
  if (!segment) throw new CampaignError('SEGMENT_INVALID', 'Kampanyanın hedef kitlesi tanınmıyor. Düzenleyip bir kitle seçin.');

  // Bugünkü tahmin (gönderim günü kitle değişebilir; o gün yeniden hesaplanır).
  const { plan } = await buildSendPlan({
    dealerId: input.dealerId,
    campaignId: campaign.id,
    segment,
    holdoutPct: input.holdoutPct,
    now,
  });
  if (plan.recipientIds.length === 0) {
    throw new CampaignError('NO_RECIPIENTS', 'Bu kitlede şu an ileti alabilecek müşteri yok; planlamak için başka bir kitle seçin.');
  }

  const actorFields = actorAuditFields(input.actor);
  const ok = await prisma.$transaction(async (tx) => {
    const n = await tx.campaign.updateMany({
      where: { id: campaign.id, dealerId: input.dealerId, status: { in: ['draft', 'failed', 'scheduled'] } },
      data: { status: 'scheduled', sentAt: when.at },
    });
    if (n.count === 0) return false;
    await tx.auditLog.create({
      data: {
        ...actorFields,
        action: ACTION_SCHEDULE,
        entity: CAMPAIGN_ENTITY,
        entityId: campaign.id,
        newData: { day: input.day, at: when.at.toISOString(), holdoutPct: input.holdoutPct } as Prisma.InputJsonObject,
      },
    });
    return true;
  });
  if (!ok) throw new CampaignError('STATE_CHANGED', 'Kampanyanın durumu az önce değişti. Sayfayı yenileyin.');
  return { scheduledFor: when.at.toISOString(), day: input.day, recipientEstimate: plan.recipientIds.length };
}

export async function cancelSchedule(input: { dealerId: string; campaignId: string; actor: DeliveryActor }): Promise<void> {
  const actorFields = actorAuditFields(input.actor);
  const ok = await prisma.$transaction(async (tx) => {
    const n = await tx.campaign.updateMany({
      where: { id: input.campaignId, dealerId: input.dealerId, status: 'scheduled' },
      data: { status: 'draft', sentAt: null },
    });
    if (n.count === 0) return false;
    await tx.auditLog.create({
      data: { ...actorFields, action: ACTION_SCHEDULE_CANCEL, entity: CAMPAIGN_ENTITY, entityId: input.campaignId },
    });
    return true;
  });
  if (!ok) throw new CampaignError('STATE_CHANGED', 'Bu kampanya planlı değil (gönderilmiş ya da iptal edilmiş olabilir).');
}

export interface DispatchSummary {
  due: number;
  sent: number;
  failed: number;
  /** Altyapı hatası (DB vb.) — kampanya planlı kalır, ertesi tur yeniden dener. */
  errored: number;
  skippedBudget: number;
}

const DISPATCH_LIMIT = 25;

/**
 * Günü gelmiş planlı kampanyaları gönderir (günlük iş). Alan hatası (kitle boş, segment geçersiz…)
 * → kampanya `failed` + bayiye bildirim; altyapı hatası → planlı kalır (yeniden denenir).
 */
export async function dispatchDueCampaigns(input: { now?: Date; deadlineAt?: number } = {}): Promise<DispatchSummary> {
  const now = input.now ?? new Date();
  const due = await prisma.campaign.findMany({
    where: { status: 'scheduled', sentAt: { lte: now } },
    orderBy: { sentAt: 'asc' },
    take: DISPATCH_LIMIT,
    select: { id: true, dealerId: true, title: true },
  });
  const summary: DispatchSummary = { due: due.length, sent: 0, failed: 0, errored: 0, skippedBudget: 0 };

  for (const c of due) {
    if (input.deadlineAt && Date.now() > input.deadlineAt) {
      summary.skippedBudget++;
      continue;
    }
    try {
      const holdoutPct = await readScheduledHoldout(c.id);
      const result = await deliverCampaign({
        dealerId: c.dealerId,
        campaignId: c.id,
        holdoutPct: isHoldoutPct(holdoutPct) ? holdoutPct : 0,
        trigger: 'schedule',
        actor: { type: 'cron' },
        now: new Date(),
      });
      summary.sent++;
      await notifyDealer(c.dealerId, c.id, {
        type: 'success',
        title: 'Planlı kampanyanız gönderildi',
        message: `“${c.title}” ${result.recipientCount} müşteriye ulaştı. Sonuçları kampanya performansında izleyebilirsiniz.`,
      });
    } catch (err) {
      if (err instanceof CampaignError && err.code !== 'STATE_CHANGED') {
        // Yalnız hâlâ planlıysa başarısız işaretlenir (arada elle gönderildiyse dokunulmaz).
        if (await markFailed(c.id, c.dealerId, err)) {
          summary.failed++;
          await notifyDealer(c.dealerId, c.id, {
            type: 'warning',
            title: 'Planlı kampanya gönderilemedi',
            message: `“${c.title}”: ${err.message}`,
          });
        }
      } else if (err instanceof CampaignError) {
        // Başka bir yoldan gönderilmiş/iptal edilmiş: dokunma.
      } else {
        summary.errored++;
        console.error('[campaign-dispatch] gönderim hatası; kampanya planlı kalıyor', c.id, err);
      }
    }
  }
  return summary;
}

async function markFailed(campaignId: string, dealerId: string, err: CampaignError): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const n = await tx.campaign.updateMany({
        where: { id: campaignId, dealerId, status: 'scheduled' },
        data: { status: 'failed' },
      });
      if (n.count === 0) return false;
      await tx.auditLog.create({
        data: {
          userId: null,
          actorType: 'cron',
          action: ACTION_DISPATCH_FAILED,
          entity: CAMPAIGN_ENTITY,
          entityId: campaignId,
          newData: { code: err.code, message: err.message, ...(err.details ?? {}) } as Prisma.InputJsonObject,
        },
      });
      return true;
    });
  } catch (e) {
    console.error('[campaign-dispatch] başarısız işaretlenemedi', campaignId, e);
    return false;
  }
}

/**
 * Bayiye işletim bildirimi. `data.kind` bilerek "campaign" İÇERMEZ: bu bir pazarlama iletisi
 * değil, bayinin kendi işinin sonucu (tercih grubuna düşüp susturulmamalı).
 */
async function notifyDealer(
  dealerId: string,
  campaignId: string,
  n: { type: 'success' | 'warning'; title: string; message: string }
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: dealerId,
        type: n.type,
        title: n.title,
        message: n.message,
        data: { kind: 'ops-dispatch-result', campaignRef: campaignId, href: `/dealer/campaigns/${campaignId}/performance` },
      },
    });
  } catch (e) {
    console.error('[campaign-dispatch] bayi bildirimi yazılamadı', campaignId, e);
  }
}
