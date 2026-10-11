/** Stüdyo genel bakış KPI'ları + birleşik denetim geçmişi (yalnız sunucudan, platform geneli). */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { STUDIO_AUDIT_ENTITIES, type StudioAuditEntry, type StudioAuditPage, type StudioOverview } from './contract';
import { currentAiProvider } from './model-routing';
import { actorFromSnapshot } from './shared.server';

export async function getStudioOverview(): Promise<StudioOverview> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [dealers, aiOff, customPrompts, profiles, systemRow, activeTones, calls7d, failures7d] = await Promise.all([
    prisma.user.count({ where: { role: 'DEALER' } }),
    prisma.aISettings.count({ where: { isEnabled: false, dealer: { role: 'DEALER' } } }),
    prisma.aISettings.count({ where: { customPrompt: { not: null }, dealer: { role: 'DEALER' } } }),
    prisma.aIDealerLearningProfile.count(),
    prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' }, select: { profile: true } }),
    prisma.aITone.count({ where: { isActive: true } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: since } } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: since }, success: false } }),
  ]);
  const p = (systemRow?.profile && typeof systemRow.profile === 'object' ? systemRow.profile : {}) as Record<string, unknown>;
  return {
    dealers,
    aiOff,
    customPrompts,
    profiles,
    pendingProposal: !!p.pendingProposal,
    activeTones,
    calls7d,
    failures7d,
    provider: currentAiProvider(),
  };
}

const ACTION_LABELS: Record<string, string> = {
  AI_PROMPT_NOTE_DRAFT: 'Prompt notu taslağı oluşturuldu',
  AI_PROMPT_NOTE_PUBLISH: 'Prompt notu yayınlandı',
  AI_PROMPT_NOTE_DISCARD: 'Prompt notu taslağı silindi',
  AI_SYSTEM_LEARNING_TRAIN: 'Sistem öğrenmesi çalıştırıldı',
  AI_SYSTEM_LEARNING_APPROVE: 'Öğrenilen kurallar onaylandı',
  AI_SYSTEM_LEARNING_REJECT: 'Öğrenme önerisi reddedildi',
  AI_SYSTEM_LEARNING_RESTORE: 'Eski kurallar öneri olarak geri yüklendi',
  AI_TONE_CREATE: 'Üslup oluşturuldu',
  AI_TONE_UPDATE: 'Üslup güncellendi',
  AI_TONE_ARCHIVE: 'Üslup arşivlendi',
  AI_TONE_RESTORE: 'Üslup yeniden etkinleştirildi',
  ADMIN_UPDATE_AI_SETTINGS: 'Bayi AI ayarı yönetici tarafından değişti',
  UPDATE_AI_SETTINGS: 'Bayi AI ayarını kendisi değiştirdi',
  AI_MODEL_ROUTING_UPDATE: 'Model seçimi değişti',
  AI_DEALER_PROFILE_REFRESH: 'Bayi öğrenme profili yenilendi',
};

export function auditSummary(action: string, newData: unknown): string {
  const label = ACTION_LABELS[action] ?? action;
  const nd = (newData && typeof newData === 'object' ? newData : {}) as Record<string, unknown>;
  const reason = typeof nd.reason === 'string' ? nd.reason : typeof nd.note === 'string' ? nd.note : null;
  const outcome = typeof nd.outcome === 'string' ? (nd.outcome === 'ok' ? 'öneri üretildi' : nd.outcome === 'empty' ? 'öneri üretilemedi' : 'hata') : null;
  return [label, outcome, reason ? `“${reason}”` : null].filter(Boolean).join(' · ');
}

const PAGE = 30;

export async function listStudioAudit(q: { entity?: (typeof STUDIO_AUDIT_ENTITIES)[number]; cursor?: string }): Promise<StudioAuditPage> {
  const where: Prisma.AuditLogWhereInput = { entity: q.entity ? q.entity : { in: [...STUDIO_AUDIT_ENTITIES] } };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: { id: true, createdAt: true, action: true, entity: true, entityId: true, userId: true, actorSnapshot: true, newData: true, user: { select: { name: true, email: true } } },
  });
  const items: StudioAuditEntry[] = rows.slice(0, PAGE).map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actor: actorFromSnapshot(r.userId, r.actorSnapshot, r.user),
    summary: auditSummary(r.action, r.newData),
  }));
  return { items, nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null };
}
