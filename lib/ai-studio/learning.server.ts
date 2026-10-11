/**
 * Öğrenme: sistem geneli anonim öğrenme ÖNERİSİ → diff → yönetici ONAYI (P0-33 akışının yönetim yüzü).
 *
 * Mevcut çekirdek `lib/ai-learning` (öneri üretimi, onay/red, iyimser kilit) aynen kullanılır;
 * burada eklenenler: atomik eğitim kilidi (status='training', 5 dk sonra bayat), sunucu veri eşiği,
 * gerekçeli red, geçmişteki onaylı sürümü YENİ ÖNERİ olarak geri yükleme ve her adımda denetim satırı.
 * GET'te LLM çağrısı yok; LLM yalnız `runSystemTraining` (POST) içinde, mevcut geçitlerden.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { AuditActor } from '@/lib/data-safety/audit';
import { isAIConfigured } from '@/lib/ai-engine';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import {
  approveSystemLearningProposal,
  diffLearnedPayload,
  getApprovedLearnedPayload,
  rejectSystemLearningProposal,
  sanitizeLearnedPayload,
  updateSystemLearningProfile,
  type SystemLearningProposal,
} from '@/lib/ai-learning';
import {
  MIN_SYSTEM_TRAINING_FEEDBACK,
  TRAINING_LOCK_STALE_MS,
  type ActorRef,
  type LearningHistoryEntry,
  type LearningState,
} from './contract';
import { auditData, iso, newId, type RequestLike } from './shared.server';

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

async function actorMap(ids: Array<string | null | undefined>): Promise<Map<string, ActorRef>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0)));
  if (!uniq.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name ?? null, email: u.email ?? null }]));
}

/** Eğitim kilidi bayat mı? (status training ama updatedAt eski → çökmüş istek) */
export function isTrainingLockActive(status: string | null | undefined, updatedAt: Date | null | undefined, now = Date.now()): boolean {
  if (status !== 'training' || !(updatedAt instanceof Date)) return false;
  return now - updatedAt.getTime() < TRAINING_LOCK_STALE_MS;
}

export async function getLearningState(): Promise<LearningState> {
  const [row, feedbackWithText, corrections, dealers, embeddings] = await Promise.all([
    prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.feedback.count({ where: { deletedAt: null, text: { not: null } } }),
    prisma.aIFeedbackCorrection.count(),
    prisma.user.count({ where: { role: 'DEALER' } }),
    prisma.aIEmbedding.count(),
  ]);
  const p = asObj(row?.profile);
  const approvalRaw = asObj(p.approval);
  const proposalRaw = p.pendingProposal && typeof p.pendingProposal === 'object' ? (p.pendingProposal as SystemLearningProposal & { source?: string }) : null;
  const active = getApprovedLearnedPayload(row?.profile);
  const historyRaw = Array.isArray(p.history) ? (p.history as unknown[]) : [];
  const rejectedRaw = asObj(p.lastRejected);

  const actors = await actorMap([
    approvalRaw.approvedBy as string,
    rejectedRaw.rejectedBy as string,
    ...historyRaw.map((h) => asObj(asObj(h).approval).approvedBy as string),
  ]);
  const ref = (id: unknown): ActorRef | null => (typeof id === 'string' ? actors.get(id) ?? { id, name: null, email: null } : null);

  const history: LearningHistoryEntry[] = historyRaw
    .map((h, index) => {
      const a = asObj(asObj(h).approval);
      return {
        index,
        approvedAt: typeof a.approvedAt === 'string' ? a.approvedAt : null,
        approvedBy: ref(a.approvedBy),
        proposalId: typeof a.proposalId === 'string' ? a.proposalId : null,
        payload: sanitizeLearnedPayload(h),
      };
    })
    .reverse();

  const trainingActive = isTrainingLockActive(row?.status, row?.updatedAt);
  return {
    status: trainingActive ? 'training' : row?.status === 'ready' || row?.status === 'idle' ? row.status : row ? 'unknown' : 'idle',
    trainingSince: trainingActive ? iso(row?.updatedAt) : null,
    version: row?.version ?? 0,
    lastTrainedAt: iso(row?.lastTrainedAt),
    approval:
      typeof approvalRaw.approvedAt === 'string'
        ? { approvedAt: approvalRaw.approvedAt, approvedBy: ref(approvalRaw.approvedBy), proposalId: typeof approvalRaw.proposalId === 'string' ? approvalRaw.proposalId : null }
        : null,
    active,
    proposal: proposalRaw
      ? {
          ...sanitizeLearnedPayload(proposalRaw),
          id: String(proposalRaw.id),
          createdAt: String(proposalRaw.createdAt ?? ''),
          model: String(proposalRaw.model ?? ''),
          promptVersion: String(proposalRaw.promptVersion ?? ''),
          source: proposalRaw.source === 'restore' ? 'restore' : 'training',
          trainingDataStats: asObj(proposalRaw.trainingDataStats),
        }
      : null,
    diff: proposalRaw ? diffLearnedPayload(active, sanitizeLearnedPayload(proposalRaw)) : null,
    lastRejected:
      typeof rejectedRaw.proposalId === 'string'
        ? {
            proposalId: rejectedRaw.proposalId,
            rejectedAt: String(rejectedRaw.rejectedAt ?? ''),
            rejectedBy: ref(rejectedRaw.rejectedBy),
            reason: typeof rejectedRaw.reason === 'string' ? rejectedRaw.reason : null,
          }
        : null,
    history,
    data: { feedbackWithText, corrections, dealers, embeddings },
    minFeedback: MIN_SYSTEM_TRAINING_FEEDBACK,
    aiConfigured: isAIConfigured(),
  };
}

/**
 * Eğitimi başlat: sunucu eşiği + atomik kilit (aynı anda iki pahalı eğitim koşmaz) → öneri üret.
 * Kilit her durumda (başarı/hata) bırakılır; çökmüş istek kilidi 5 dk sonra bayatlar.
 */
export async function runSystemTraining(actor: AuditActor, request?: RequestLike): Promise<LearningState> {
  if (!isAIConfigured()) throw new ApiError('SERVICE_UNAVAILABLE', 'AI sağlayıcısı yapılandırılmamış; eğitim çalıştırılamaz.', { status: 503 });
  const feedbackWithText = await prisma.feedback.count({ where: { deletedAt: null, text: { not: null } } });
  if (feedbackWithText < MIN_SYSTEM_TRAINING_FEEDBACK) {
    throw new ApiError('INSUFFICIENT_DATA', `Eğitim için en az ${MIN_SYSTEM_TRAINING_FEEDBACK} metinli geri bildirim gerekir (şu an ${feedbackWithText}).`, { status: 422 });
  }

  let row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!row) {
    row = await prisma.aISystemLearningProfile.create({ data: { status: 'idle', version: 0 } });
  }
  const previousStatus = row.status === 'training' ? 'idle' : row.status;
  const staleBefore = new Date(Date.now() - TRAINING_LOCK_STALE_MS);
  const claimed = await prisma.aISystemLearningProfile.updateMany({
    where: { id: row.id, OR: [{ status: { not: 'training' } }, { updatedAt: { lt: staleBefore } }] },
    data: { status: 'training' },
  });
  if (claimed.count === 0) throw new ApiError('CONFLICT', 'Başka bir eğitim sürüyor. Birkaç dakika sonra tekrar deneyin.');

  let outcome: 'ok' | 'empty' | 'error' = 'error';
  let errorMessage: string | null = null;
  try {
    const result = await updateSystemLearningProfile();
    outcome = result ? 'ok' : 'empty';
    if (!result) errorMessage = 'Model geçerli bir öneri döndürmedi.';
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    if (isAiGuardError(err)) {
      throw new ApiError('RATE_LIMITED', err.message, { status: 429, retryable: true });
    }
    throw new ApiError('SERVICE_UNAVAILABLE', 'Eğitim tamamlanamadı: AI sağlayıcısı yanıt vermedi.', { status: 503, retryable: true });
  } finally {
    await prisma.aISystemLearningProfile
      .updateMany({ where: { id: row.id, status: 'training' }, data: { status: previousStatus === 'ready' ? 'ready' : 'idle' } })
      .catch(() => undefined);
    await prisma.auditLog
      .create({ data: auditData(actor, { action: 'AI_SYSTEM_LEARNING_TRAIN', entity: 'AISystemLearning', entityId: row.id, newData: { outcome, error: errorMessage } }, request) })
      .catch(() => undefined);
  }
  if (outcome === 'empty') throw new ApiError('SERVICE_UNAVAILABLE', 'Model geçerli bir öneri döndürmedi; tekrar deneyin.', { status: 503, retryable: true });
  return getLearningState();
}

export async function decideProposal(
  input: { action: 'approve' | 'reject'; proposalId: string; reason?: string },
  actor: AuditActor,
  request?: RequestLike
): Promise<LearningState> {
  const adminId = actor.id ?? '';
  const before = await getLearningState();
  const result =
    input.action === 'approve'
      ? await approveSystemLearningProposal({ adminId, proposalId: input.proposalId })
      : await rejectSystemLearningProposal({ adminId, proposalId: input.proposalId });
  if (!result.ok) {
    const reason = 'reason' in result ? result.reason : undefined;
    if (reason === 'stale') throw new ApiError('CONFLICT', 'Öneri değişmiş; sayfayı yenileyip tekrar deneyin.');
    throw new ApiError('NOT_FOUND', 'Bekleyen öneri bulunamadı.');
  }
  if (input.action === 'reject' && input.reason) {
    // Gerekçeyi lastRejected'a ekle (çekirdek yalnız kim/ne zaman yazar).
    const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (row) {
      const p = asObj(row.profile);
      p.lastRejected = { ...asObj(p.lastRejected), reason: input.reason };
      await prisma.aISystemLearningProfile.updateMany({ where: { id: row.id, version: row.version }, data: { profile: p as Prisma.InputJsonValue } });
    }
  }
  await prisma.auditLog.create({
    data: auditData(
      actor,
      {
        action: input.action === 'approve' ? 'AI_SYSTEM_LEARNING_APPROVE' : 'AI_SYSTEM_LEARNING_REJECT',
        entity: 'AISystemLearning',
        entityId: input.proposalId,
        oldData: before.active,
        newData: input.action === 'approve' ? { proposal: before.proposal, diff: before.diff } : { reason: input.reason ?? null },
      },
      request
    ),
  });
  return getLearningState();
}

/**
 * Geçmişteki onaylı içeriği YENİ ÖNERİ olarak yükler (doğrudan yürürlüğe koymaz: diff + onay akışından geçer).
 * Bekleyen öneri varsa onu ezmez → 409.
 */
export async function restoreHistoryAsProposal(
  input: { index: number; expectedVersion: number },
  actor: AuditActor,
  request?: RequestLike
): Promise<LearningState> {
  const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!row) throw new ApiError('NOT_FOUND', 'Öğrenme profili yok.');
  if (row.version !== input.expectedVersion) throw new ApiError('CONFLICT', 'Profil değişmiş; sayfayı yenileyip tekrar deneyin.');
  const p = asObj(row.profile);
  if (p.pendingProposal) throw new ApiError('CONFLICT', 'Bekleyen bir öneri var; önce onu onaylayın ya da reddedin.');
  const history = Array.isArray(p.history) ? (p.history as unknown[]) : [];
  const entry = history[input.index];
  if (!entry) throw new ApiError('NOT_FOUND', 'Geçmiş sürüm bulunamadı.');
  const payload = sanitizeLearnedPayload(entry);
  const proposal = {
    ...payload,
    id: newId('slp'),
    createdAt: new Date().toISOString(),
    promptVersion: 'restore',
    model: 'geri-yükleme',
    source: 'restore',
    trainingDataStats: { restoredFromApprovedAt: asObj(asObj(entry).approval).approvedAt ?? null },
  };
  p.pendingProposal = proposal;
  const res = await prisma.aISystemLearningProfile.updateMany({ where: { id: row.id, version: row.version }, data: { profile: p as Prisma.InputJsonValue } });
  if (res.count === 0) throw new ApiError('CONFLICT', 'Profil değişmiş; sayfayı yenileyip tekrar deneyin.');
  await prisma.auditLog.create({
    data: auditData(actor, { action: 'AI_SYSTEM_LEARNING_RESTORE', entity: 'AISystemLearning', entityId: proposal.id, newData: { fromIndex: input.index, payload } }, request),
  });
  return getLearningState();
}
