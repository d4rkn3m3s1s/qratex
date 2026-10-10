/**
 * Kampanya olay kaydı — `AuditLog` (entity: 'Campaign').
 *
 * Şemada alıcı tablosu yok (şema dalgası bitti). Gönderimin kesin kanıtı ve ölçümün temeli
 * olan alıcı listesi, kanal kümeleri ve kontrol grubu gönderimle AYNI transaction'da tek bir
 * denetim satırına yazılır (`campaign.send`). Bu hem KVKK/ETK açısından "kime ne gitti" kaydı,
 * hem de performans hunisinin kesin alıcı kümesidir (başlıktan türetilen UTM eşlemesi yerine).
 *
 * Satırlar yalnız kimlik içerir (ad/e-posta yok). Ekle-yalnız: push sonucu ayrı satırdır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeSegment, type CampaignSegmentKey } from '../domain';

export const CAMPAIGN_ENTITY = 'Campaign';
export const ACTION_SEND = 'campaign.send';
export const ACTION_PUSH_RESULT = 'campaign.push_result';
export const ACTION_SCHEDULE = 'campaign.schedule';
export const ACTION_SCHEDULE_CANCEL = 'campaign.schedule_cancel';
export const ACTION_DISPATCH_FAILED = 'campaign.dispatch_failed';
export const ACTION_ARCHIVE = 'campaign.archive';

export interface SendSnapshot {
  v: 1;
  campaignId: string;
  dealerId: string;
  segment: CampaignSegmentKey | null;
  sentAt: string;
  trigger: 'manual' | 'schedule';
  recipients: string[];
  inApp: string[];
  push: string[];
  holdout: string[];
  holdoutPct: number;
  candidateCount: number;
  ineligibleCount: number;
  optedOutCount: number;
  frequencyCappedCount: number;
  truncatedCount: number;
}

export interface PushResult {
  attempted: number;
  delivered: number;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Savunmacı okuma: bozuk/eksik satır → null (ölçüm "veri yok" der, uydurmaz). */
export function parseSendSnapshot(raw: unknown): SendSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.campaignId !== 'string' || typeof o.dealerId !== 'string') return null;
  const recipients = strArray(o.recipients);
  return {
    v: 1,
    campaignId: o.campaignId,
    dealerId: o.dealerId,
    segment: normalizeSegment(o.segment),
    sentAt: typeof o.sentAt === 'string' ? o.sentAt : '',
    trigger: o.trigger === 'schedule' ? 'schedule' : 'manual',
    recipients,
    inApp: strArray(o.inApp),
    push: strArray(o.push),
    holdout: strArray(o.holdout),
    holdoutPct: num(o.holdoutPct),
    candidateCount: num(o.candidateCount),
    ineligibleCount: num(o.ineligibleCount),
    optedOutCount: num(o.optedOutCount),
    frequencyCappedCount: num(o.frequencyCappedCount),
    truncatedCount: num(o.truncatedCount),
  };
}

export function parsePushResult(raw: unknown): PushResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { attempted: num(o.attempted), delivered: num(o.delivered) };
}

export function snapshotJson(s: SendSnapshot): Prisma.InputJsonObject {
  return s as unknown as Prisma.InputJsonObject;
}

/** Tek kampanyanın gönderim kaydı + push sonucu. */
export async function readSendRecord(campaignId: string): Promise<{ snapshot: SendSnapshot | null; push: PushResult | null }> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: CAMPAIGN_ENTITY, entityId: campaignId, action: { in: [ACTION_SEND, ACTION_PUSH_RESULT] } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, newData: true },
    take: 10,
  });
  const send = rows.find((r) => r.action === ACTION_SEND);
  const push = rows.find((r) => r.action === ACTION_PUSH_RESULT);
  return {
    snapshot: send ? parseSendSnapshot(send.newData) : null,
    push: push ? parsePushResult(push.newData) : null,
  };
}

/** Birden çok kampanyanın gönderim kayıtları (frekans tavanı için). */
export async function readSendSnapshots(campaignIds: readonly string[]): Promise<Map<string, SendSnapshot>> {
  const out = new Map<string, SendSnapshot>();
  if (campaignIds.length === 0) return out;
  const rows = await prisma.auditLog.findMany({
    where: { entity: CAMPAIGN_ENTITY, action: ACTION_SEND, entityId: { in: [...campaignIds] } },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, newData: true },
  });
  for (const r of rows) {
    if (!r.entityId || out.has(r.entityId)) continue;
    const s = parseSendSnapshot(r.newData);
    if (s) out.set(r.entityId, s);
  }
  return out;
}

/** Planlı gönderimin kontrol grubu tercihi (en son `campaign.schedule` satırı). */
export async function readScheduledHoldout(campaignId: string): Promise<number> {
  const row = await prisma.auditLog.findFirst({
    where: { entity: CAMPAIGN_ENTITY, entityId: campaignId, action: ACTION_SCHEDULE },
    orderBy: { createdAt: 'desc' },
    select: { newData: true },
  });
  const data = row?.newData as Record<string, unknown> | null | undefined;
  return num(data?.holdoutPct);
}

/** Son başarısız planlı gönderimin nedeni (liste/editörde gösterilir). */
export async function readLastFailures(campaignIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (campaignIds.length === 0) return out;
  const rows = await prisma.auditLog.findMany({
    where: { entity: CAMPAIGN_ENTITY, action: ACTION_DISPATCH_FAILED, entityId: { in: [...campaignIds] } },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, newData: true },
  });
  for (const r of rows) {
    if (!r.entityId || out.has(r.entityId)) continue;
    const msg = (r.newData as Record<string, unknown> | null)?.message;
    if (typeof msg === 'string') out.set(r.entityId, msg);
  }
  return out;
}
