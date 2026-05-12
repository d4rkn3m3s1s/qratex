import { prisma } from '@/lib/prisma';
import { runAutomationActions } from './engine';
import type { AutomationAction, AutomationCondition } from './types';

export async function enqueueAutomationJob(input: {
  ruleId?: string | null;
  runId?: string | null;
  idempotencyKey?: string;
  payload: { condition: AutomationCondition; actions: AutomationAction[]; limit?: number };
}) {
  const existing = input.idempotencyKey
    ? await prisma.automationJob.findFirst({
        where: { idempotencyKey: input.idempotencyKey, status: { in: ['queued', 'processing', 'completed'] } },
      })
    : null;
  if (existing) return existing;

  return prisma.automationJob.create({
    data: {
      ruleId: input.ruleId || null,
      runId: input.runId || null,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: 'queued',
      nextRunAt: new Date(),
    },
  });
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

  const payload = (job.payload || {}) as { condition?: AutomationCondition; actions?: AutomationAction[]; limit?: number };
  const condition = payload.condition || {};
  const actions = payload.actions || [];

  try {
    const result = await runAutomationActions({
      condition,
      actions,
      dryRun: false,
      limit: payload.limit || 500,
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
    const attempts = (job.attempts || 0) + 1;
    const willRetry = attempts < (job.maxAttempts || 3);
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
