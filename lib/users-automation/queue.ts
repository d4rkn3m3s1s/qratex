import { prisma } from '@/lib/prisma';
import { AutomationActionError, runAutomationActions } from './engine';
import { automationFingerprint, executionBlocker } from './schema';
import type { AutomationAction, AutomationCondition } from './types';

/**
 * Otomasyon iş kuyruğu (P0-19).
 *
 * İşlenirken kural YENİDEN doğrulanır: kayıtlı kural yoksa, pasifse, onayı kaldırıldıysa ya da
 * kuyruğa alındıktan sonra içeriği değiştiyse iş çalışmaz ('cancelled'). Kuralsız (ad-hoc)
 * işler artık çalıştırılmaz. Tek-kez anahtarlarının kökü iş id'sidir → yeniden denemede çift
 * kredi yok.
 */

export type AutomationJobPayload = {
  condition: AutomationCondition;
  actions: AutomationAction[];
  limit?: number;
  /** Çalıştırmayı başlatan admin (defter aktörü, hedeften hariç). */
  actorId?: string | null;
};

export async function enqueueAutomationJob(input: {
  ruleId?: string | null;
  runId?: string | null;
  idempotencyKey?: string;
  payload: AutomationJobPayload;
}) {
  const data = {
    ruleId: input.ruleId || null,
    runId: input.runId || null,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    status: 'queued',
    nextRunAt: new Date(),
  };
  const key = input.idempotencyKey;
  if (!key) return prisma.automationJob.create({ data });

  // Veri modeli B14: `idempotencyKey` DB'de unique değil; bul-sonra-oluştur yarışında aynı
  // anahtarla İKİ iş oluşabiliyordu → iki ayrı iş kimliği = iki ayrı tek-kez kökü = çift puan.
  // Anahtar başına işlem kilidi bul+oluştur'u tekilleştirir (şema isteği: kısmi unique index).
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`automation-job:${key}`}))`;
    const existing = await tx.automationJob.findFirst({
      where: { idempotencyKey: key, status: { in: ['queued', 'processing', 'completed'] } },
    });
    if (existing) return existing;
    return tx.automationJob.create({ data });
  });
}

async function cancelJob(job: { id: string; runId: string | null }, reason: string) {
  await prisma.automationJob.update({
    where: { id: job.id },
    data: { status: 'cancelled', lastError: reason },
  });
  if (job.runId) {
    await prisma.userAutomationRun.update({
      where: { id: job.runId },
      data: { status: 'cancelled', completedAt: new Date(), error: reason },
    });
  }
  return { jobId: job.id, status: 'cancelled' as const, error: reason };
}

export async function processNextAutomationJob(worker = 'api') {
  const now = new Date();
  const job = await prisma.automationJob.findFirst({
    where: { status: 'queued', nextRunAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) return null;

  const locked = await prisma.automationJob.updateMany({
    where: { id: job.id, status: 'queued' },
    data: { status: 'processing', lockedAt: new Date(), lockedBy: worker, attempts: { increment: 1 } },
  });
  if (locked.count === 0) return null;

  const payload = (job.payload || {}) as Partial<AutomationJobPayload>;
  const condition = payload.condition || {};
  const actions = payload.actions || [];

  // ── Yalnız kayıtlı + onaylı + içeriği değişmemiş kural ──
  if (!job.ruleId) {
    return cancelJob(job, 'Kayıtlı kurala bağlı olmayan otomasyon işi çalıştırılmaz.');
  }
  const rule = await prisma.userAutomationRule.findUnique({ where: { id: job.ruleId } });
  if (!rule) return cancelJob(job, 'Kural silinmiş; iş iptal edildi.');
  const blocker = executionBlocker(rule);
  if (blocker) return cancelJob(job, blocker);
  if (automationFingerprint(rule.condition, rule.actions) !== automationFingerprint(condition, actions)) {
    return cancelJob(job, 'Kural kuyruğa alındıktan sonra değişti; yeniden onay ve çalıştırma gerekli.');
  }

  try {
    const result = await runAutomationActions({
      condition,
      actions,
      dryRun: false,
      limit: payload.limit || 500,
      runKey: job.id,
      actorId: payload.actorId ?? null,
    });

    await prisma.automationJob.update({
      where: { id: job.id },
      data: { status: 'completed', lastError: null, updatedAt: new Date() },
    });

    if (job.runId) {
      await prisma.userAutomationRun.update({
        where: { id: job.runId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          affectedCount: result.affectedCount,
          successCount: result.successCount,
          failedCount: result.failedCount,
          summary: {
            sampleUserIds: result.sampleUserIds,
            failures: result.failures.slice(0, 50),
          },
        },
      });
    }
    return { jobId: job.id, status: 'completed', result };
  } catch (error) {
    // Doğrulama hatası tekrar denenmez (aynı veriyle yine düşer).
    const permanent = error instanceof AutomationActionError;
    const attempts = (job.attempts || 0) + 1;
    const willRetry = !permanent && attempts < (job.maxAttempts || 3);
    const nextRunAt = new Date(Date.now() + attempts * 60_000);

    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        status: willRetry ? 'queued' : 'failed',
        nextRunAt: willRetry ? nextRunAt : job.nextRunAt,
        lastError: error instanceof Error ? error.message : 'Bilinmeyen hata',
      },
    });
    if (job.runId && !willRetry) {
      await prisma.userAutomationRun.update({
        where: { id: job.runId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Bilinmeyen hata',
        },
      });
    }
    throw error;
  }
}
