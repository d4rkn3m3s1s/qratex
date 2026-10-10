/**
 * Kampanya kaydı: oluştur / düzenle / sil (yalnız hiç gönderilmemiş) / çoğalt / arşivle.
 * Gönderilmiş kampanya SİLİNMEZ (denetim izi; yol haritası §4.4/5) — arşivlenir.
 */
import type { Campaign, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DELETABLE_STATUSES, EDITABLE_STATUSES, normalizeStatus, TITLE_MAX, type CampaignSegmentKey } from '../domain';
import { CampaignError, loadOwnedCampaign } from './common';
import { actorAuditFields, type DeliveryActor } from './delivery';
import { ACTION_ARCHIVE, CAMPAIGN_ENTITY } from './snapshot';

export interface CampaignInput {
  title: string;
  message: string;
  segment: CampaignSegmentKey;
}

export async function createCampaign(dealerId: string, input: CampaignInput): Promise<Campaign> {
  return prisma.campaign.create({
    data: {
      dealerId,
      title: input.title,
      message: input.message,
      targetSegment: input.segment,
      channel: 'notification',
      status: 'draft',
    },
  });
}

export async function updateCampaign(dealerId: string, id: string, patch: Partial<CampaignInput>): Promise<Campaign> {
  const existing = await loadOwnedCampaign(dealerId, id);
  if (!EDITABLE_STATUSES.includes(normalizeStatus(existing.status))) {
    throw new CampaignError('NOT_EDITABLE', 'Gönderilmiş kampanya düzenlenemez. Çoğaltıp yeni bir kampanya oluşturun.');
  }
  const data: Prisma.CampaignUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.message !== undefined) data.message = patch.message;
  if (patch.segment !== undefined) data.targetSegment = patch.segment;
  // Eski sahte "email" kanallı taslak düzenlenince gerçek kanala geçer.
  if (existing.channel !== 'notification') data.channel = 'notification';
  if (Object.keys(data).length === 0) return existing;

  const n = await prisma.campaign.updateMany({
    where: { id, dealerId, status: { in: [...EDITABLE_STATUSES] } },
    data,
  });
  if (n.count === 0) throw new CampaignError('STATE_CHANGED', 'Kampanya az önce gönderildi; düzenleme kaydedilmedi.');
  return loadOwnedCampaign(dealerId, id);
}

export async function deleteCampaign(dealerId: string, id: string): Promise<void> {
  const existing = await loadOwnedCampaign(dealerId, id);
  if (!DELETABLE_STATUSES.includes(normalizeStatus(existing.status))) {
    throw new CampaignError(
      'NOT_DELETABLE',
      normalizeStatus(existing.status) === 'scheduled'
        ? 'Planlı kampanyayı silmeden önce planı iptal edin.'
        : 'Gönderilmiş kampanya silinmez; arşivleyebilirsiniz.'
    );
  }
  const n = await prisma.campaign.deleteMany({ where: { id, dealerId, status: { in: [...DELETABLE_STATUSES] } } });
  if (n.count === 0) throw new CampaignError('STATE_CHANGED', 'Kampanyanın durumu değişti; silinmedi.');
}

export async function duplicateCampaign(dealerId: string, id: string, copySuffix: string): Promise<Campaign> {
  const src = await loadOwnedCampaign(dealerId, id);
  const suffix = ` ${copySuffix}`;
  const title = src.title.length + suffix.length > TITLE_MAX ? src.title.slice(0, TITLE_MAX - suffix.length) + suffix : src.title + suffix;
  return prisma.campaign.create({
    data: {
      dealerId,
      title,
      message: src.message,
      targetSegment: src.targetSegment,
      channel: 'notification',
      status: 'draft',
    },
  });
}

/** Gönderilmiş kampanyayı arşive al / arşivden çıkar (durum `sent` ↔ `archived`). */
export async function setArchived(input: { dealerId: string; id: string; archived: boolean; actor: DeliveryActor }): Promise<Campaign> {
  const existing = await loadOwnedCampaign(input.dealerId, input.id);
  const status = normalizeStatus(existing.status);
  if (input.archived && status !== 'sent') {
    throw new CampaignError('NOT_EDITABLE', 'Yalnız gönderilmiş kampanyalar arşivlenir. Taslakları silebilirsiniz.');
  }
  if (!input.archived && (status !== 'archived' || !existing.sentAt)) {
    throw new CampaignError('NOT_EDITABLE', 'Bu kampanya arşivde değil.');
  }
  const from = input.archived ? 'sent' : 'archived';
  const to = input.archived ? 'archived' : 'sent';
  const ok = await prisma.$transaction(async (tx) => {
    const n = await tx.campaign.updateMany({ where: { id: input.id, dealerId: input.dealerId, status: from }, data: { status: to } });
    if (n.count === 0) return false;
    await tx.auditLog.create({
      data: {
        ...actorAuditFields(input.actor),
        action: ACTION_ARCHIVE,
        entity: CAMPAIGN_ENTITY,
        entityId: input.id,
        newData: { archived: input.archived } as Prisma.InputJsonObject,
      },
    });
    return true;
  });
  if (!ok) throw new CampaignError('STATE_CHANGED', 'Kampanyanın durumu değişti. Sayfayı yenileyin.');
  return loadOwnedCampaign(input.dealerId, input.id);
}
