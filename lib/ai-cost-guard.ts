/**
 * AI cost guardrails (P2-20 item 15).
 * Dealer/tenant başına günlük token limiti; limit aşımında 429.
 */
import { prisma } from '@/lib/prisma';

const DEFAULT_DAILY_LIMIT = parseInt(process.env.AI_DAILY_TOKEN_LIMIT_PER_DEALER || '100000', 10);

export class AiCostLimitExceededError extends Error {
  readonly statusCode = 429;
  constructor(message = 'Günlük AI token limiti aşıldı. Lütfen yarın tekrar deneyin.') {
    super(message);
    this.name = 'AiCostLimitExceededError';
  }
}

/** Bugünün başlangıcı (UTC). */
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Dealer için bugünkü toplam token kullanımı. */
export async function getTodayUsage(dealerId: string): Promise<number> {
  const start = startOfTodayUtc();
  const rows = await prisma.aIUsageLog.aggregate({
    where: {
      dealerId,
      createdAt: { gte: start },
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    },
  });
  const in_ = rows._sum.inputTokens ?? 0;
  const out = rows._sum.outputTokens ?? 0;
  return in_ + out;
}

/** Limit aşıldıysa AiCostLimitExceededError fırlat. */
export async function checkAiCostGuard(dealerId: string, limit?: number): Promise<void> {
  const max = limit ?? DEFAULT_DAILY_LIMIT;
  const used = await getTodayUsage(dealerId);
  if (used >= max) {
    throw new AiCostLimitExceededError();
  }
}

/** Kullanımı kaydet. */
export async function recordAiCostUsage(
  dealerId: string,
  inputTokens: number,
  outputTokens: number,
  action: string,
  model: string,
  latencyMs = 0
): Promise<void> {
  await prisma.aIUsageLog.create({
    data: {
      dealerId,
      action,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      success: true,
    },
  });
}
