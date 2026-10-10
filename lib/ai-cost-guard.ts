/**
 * AI maliyet ve hız korumaları (P2-20 item 15 → P0-32/F0.7 genişletmesi).
 *
 *  - Bayi (kiracı) başına günlük token tavanı → `checkAiCostGuard` (429).
 *  - Platform düzeyi (bayisiz: QRA sohbeti, sistem öğrenmesi) eylem bazlı günlük tavan →
 *    `checkAiGlobalBudget` (429).
 *  - Kiracı/aktör × görev başına dakika limiti → `checkAiRateLimit` (429). DB/Redis destekli
 *    `checkRateLimitDb` kullanır; serverless örnekleri arasında paylaşılır. Böylece bütçe
 *    kontrolünün check-then-act yarışı da dakikalık tavanla sınırlanır.
 *  - Kullanım kaydı başarısız çağrıları da tutar (`success:false`, `error`), kayıt hatası
 *    AI yanıtını asla düşürmez.
 *
 *  - Kapsamsız (bayisiz, aktörsüz) çağrılar da korumasız kalmaz: görev başına platform
 *    dakikalık tavanı + platform günlük token tavanı (`unscoped`).
 *  - QRA sohbeti: kademe başına (anonim/müşteri/bayi/admin) GÜNLÜK mesaj tavanı →
 *    `checkQraDailyCap` (dakikalık limit `lib/rate-limit` `checkQraChatRateLimit`'te).
 *
 * Bütün LLM yolları: önce `guardAiCall`, sonra çağrı, sonra `recordAiCostUsage`.
 */
import { prisma } from '@/lib/prisma';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';
import { checkRateLimitDb } from '@/lib/rate-limit';

const DEFAULT_DAILY_LIMIT = parsePositiveIntEnv(
  process.env.AI_DAILY_TOKEN_LIMIT_PER_DEALER,
  100_000
);

/** Görev kimlikleri — AIUsageLog.action ile aynı sözlük. */
export type AiTask =
  | 'analyze'
  | 'chat_completion'
  | 'ask_ai'
  | 'insights'
  | 'theme_cluster'
  | 'suggest_reply'
  | 'auto_reply'
  | 'embedding'
  | 'dealer_learning'
  | 'system_learning'
  | 'qra_chat';

/** Kapsamsız çağrıda (bayi ve aktör yok) görev başına PLATFORM dakikalık tavanı. */
export const AI_TASK_GLOBAL_RATE_PER_MINUTE: Partial<Record<AiTask, number>> = {
  analyze: 60,
  chat_completion: 60,
  ask_ai: 60,
  insights: 20,
  theme_cluster: 20,
  suggest_reply: 60,
  auto_reply: 60,
  embedding: 120,
  dealer_learning: 10,
  system_learning: 2,
  qra_chat: 120,
};

/**
 * Kiracı/aktör başına dakikalık çağrı tavanı. `analyze` ve `embedding` burada yok:
 * hacimleri geri bildirim hacmine bağlı ve günlük token tavanıyla korunuyorlar.
 */
export const AI_TASK_RATE_PER_MINUTE: Partial<Record<AiTask, number>> = {
  chat_completion: 30,
  ask_ai: 20,
  insights: 6,
  theme_cluster: 6,
  suggest_reply: 20,
  auto_reply: 30,
  dealer_learning: 4,
  system_learning: 2,
};

/** Platform düzeyi günlük token tavanları (bayisiz yollar). */
export const AI_GLOBAL_DAILY_TOKEN_LIMITS = {
  qra_chat: parsePositiveIntEnv(process.env.AI_DAILY_TOKEN_LIMIT_QRA, 150_000),
  system_learning: parsePositiveIntEnv(process.env.AI_DAILY_TOKEN_LIMIT_SYSTEM_LEARNING, 60_000),
} as const;

/** Bayisiz ve QRA/sistem öğrenmesi dışındaki (müşteri sohbeti, admin, konsey…) çağrıların günlük tavanı. */
export const AI_UNSCOPED_DAILY_TOKEN_LIMIT = parsePositiveIntEnv(
  process.env.AI_DAILY_TOKEN_LIMIT_UNSCOPED,
  300_000
);

/** Platform tavanına sahip görevler (kendi eylem adıyla sayılır). */
const GLOBAL_BUDGET_TASKS = new Set<string>(Object.keys(AI_GLOBAL_DAILY_TOKEN_LIMITS));

/**
 * QRA sohbet botu — kademe başına GÜNLÜK mesaj tavanı (denetim Y3: anonim limit dakikada 8
 * idi; tek IP günde ~11.5K istek atabiliyordu, ücretsiz kotanın 11 katı).
 */
export const QRA_DAILY_MESSAGE_CAP = {
  anonymous: parsePositiveIntEnv(process.env.QRA_DAILY_CAP_ANONYMOUS, 20),
  customer: parsePositiveIntEnv(process.env.QRA_DAILY_CAP_CUSTOMER, 60),
  dealer_staff: parsePositiveIntEnv(process.env.QRA_DAILY_CAP_DEALER, 200),
  admin: parsePositiveIntEnv(process.env.QRA_DAILY_CAP_ADMIN, 500),
} as const;
export type QraDailyTier = keyof typeof QRA_DAILY_MESSAGE_CAP;

export class AiCostLimitExceededError extends Error {
  readonly statusCode = 429;
  readonly code: string = 'AI_BUDGET_EXCEEDED';
  constructor(message = 'Günlük AI token limiti aşıldı. Lütfen yarın tekrar deneyin.') {
    super(message);
    this.name = 'AiCostLimitExceededError';
  }
}

export class AiRateLimitExceededError extends Error {
  readonly statusCode = 429;
  readonly code = 'AI_RATE_LIMIT';
  constructor(
    readonly retryAfterMs: number = 60_000,
    message = 'Çok sık AI isteği gönderildi. Lütfen biraz sonra tekrar deneyin.'
  ) {
    super(message);
    this.name = 'AiRateLimitExceededError';
  }
}

/**
 * Route'ların catch bloğunda kullanması için: AI koruma hatası mı? (429/403 eşlemesi)
 * `AiDisabledError` (lib/ai-policy) da `statusCode`/`code` taşıdığı için kapsanır.
 */
export function isAiGuardError(err: unknown): err is Error & { statusCode: number; code: string; retryAfterMs?: number } {
  if (!err || typeof err !== 'object') return false;
  const e = err as { statusCode?: unknown; code?: unknown };
  return (
    typeof e.statusCode === 'number' &&
    typeof e.code === 'string' &&
    ['AI_BUDGET_EXCEEDED', 'AI_RATE_LIMIT', 'AI_DISABLED'].includes(e.code)
  );
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

/** Platform düzeyi: verilen eylem(ler) için bugünkü toplam token (bayi fark etmeksizin). */
export async function getTodayUsageByAction(actions: string[]): Promise<number> {
  const rows = await prisma.aIUsageLog.aggregate({
    where: { action: { in: actions }, createdAt: { gte: startOfTodayUtc() } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (rows._sum.inputTokens ?? 0) + (rows._sum.outputTokens ?? 0);
}

/** Limit aşıldıysa AiCostLimitExceededError fırlat. */
export async function checkAiCostGuard(dealerId: string, limit?: number): Promise<void> {
  const max = limit ?? DEFAULT_DAILY_LIMIT;
  const used = await getTodayUsage(dealerId);
  if (used >= max) {
    throw new AiCostLimitExceededError();
  }
}

/** Platform düzeyi günlük tavan (QRA, sistem öğrenmesi). Aşılırsa 429. */
export async function checkAiGlobalBudget(action: keyof typeof AI_GLOBAL_DAILY_TOKEN_LIMITS): Promise<void> {
  const used = await getTodayUsageByAction([action]);
  if (used >= AI_GLOBAL_DAILY_TOKEN_LIMITS[action]) {
    throw new AiCostLimitExceededError('Platformun günlük AI kotası doldu. Lütfen yarın tekrar deneyin.');
  }
}

/**
 * Kiracı/aktör × görev dakikalık limiti. Sınırlayıcı altyapısı hata verirse açık kalır
 * (günlük token tavanı yine uygulanır); limit aşımında AiRateLimitExceededError.
 */
export async function checkAiRateLimit(scopeKey: string, task: AiTask): Promise<void> {
  const max = AI_TASK_RATE_PER_MINUTE[task];
  if (!max || !scopeKey) return;
  let rl: { ok: boolean; retryAfterMs?: number };
  try {
    rl = await checkRateLimitDb(`ai:${task}:${scopeKey}`, max, 60_000);
  } catch (err) {
    console.error('[AI_GUARD] rate limit altyapısı hata verdi:', err instanceof Error ? err.message : err);
    return;
  }
  if (!rl.ok) throw new AiRateLimitExceededError(rl.retryAfterMs ?? 60_000);
}

/** Bayisiz, QRA/sistem öğrenmesi dışı çağrıların bugünkü toplam tokenı. */
export async function getTodayUnscopedUsage(): Promise<number> {
  const rows = await prisma.aIUsageLog.aggregate({
    where: {
      dealerId: null,
      action: { notIn: Array.from(GLOBAL_BUDGET_TASKS) },
      createdAt: { gte: startOfTodayUtc() },
    },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (rows._sum.inputTokens ?? 0) + (rows._sum.outputTokens ?? 0);
}

/** Kapsamsız çağrılar için platform günlük tavanı. Aşılırsa 429. */
export async function checkAiUnscopedBudget(): Promise<void> {
  const used = await getTodayUnscopedUsage();
  if (used >= AI_UNSCOPED_DAILY_TOKEN_LIMIT) {
    throw new AiCostLimitExceededError('Platformun günlük AI kotası doldu. Lütfen yarın tekrar deneyin.');
  }
}

/** Platform dakikalık tavanı (kapsamsız çağrılar). Altyapı hatasında açık kalır. */
async function checkAiGlobalRateLimit(task: AiTask): Promise<void> {
  const max = AI_TASK_GLOBAL_RATE_PER_MINUTE[task];
  if (!max) return;
  let rl: { ok: boolean; retryAfterMs?: number };
  try {
    rl = await checkRateLimitDb(`ai:${task}:global`, max, 60_000);
  } catch (err) {
    console.error('[AI_GUARD] global rate limit altyapısı hata verdi:', err instanceof Error ? err.message : err);
    return;
  }
  if (!rl.ok) throw new AiRateLimitExceededError(rl.retryAfterMs ?? 60_000);
}

/**
 * Tek giriş noktası: bir LLM çağrısından ÖNCE çağrılır.
 *  - `dealerId` varsa: kiracı dakikalık limiti + kiracı günlük token tavanı.
 *  - `dealerId` yoksa `actorKey` (kullanıcı id / IP parmak izi) ile dakikalık limit.
 *  - İkisi de yoksa görev başına PLATFORM dakikalık limiti.
 *  - Bayisiz her çağrı platform günlük tavanına tabidir: QRA ve sistem öğrenmesi kendi
 *    eylem tavanına, diğerleri ortak `unscoped` tavanına.
 */
export async function guardAiCall(params: { task: AiTask; dealerId?: string | null; actorKey?: string | null }): Promise<void> {
  if (params.dealerId) {
    await checkAiRateLimit(params.dealerId, params.task);
    await checkAiCostGuard(params.dealerId);
    return;
  }
  if (params.actorKey) await checkAiRateLimit(params.actorKey, params.task);
  else await checkAiGlobalRateLimit(params.task);

  if (GLOBAL_BUDGET_TASKS.has(params.task)) {
    await checkAiGlobalBudget(params.task as keyof typeof AI_GLOBAL_DAILY_TOKEN_LIMITS);
  } else {
    await checkAiUnscopedBudget();
  }
}

/**
 * QRA günlük mesaj tavanı (kademe × kimlik; anonimde IP parmak izi). Altyapı hatasında
 * anonim kademe KAPALI kalır (fail-closed: herkese açık uç maliyet açığı olmasın), girişli
 * kademeler açık kalır (dakikalık limit + platform token tavanı yine geçerli).
 */
export async function checkQraDailyCap(
  identifier: string,
  tier: QraDailyTier
): Promise<{ ok: boolean; remaining?: number; retryAfterMs?: number }> {
  const max = QRA_DAILY_MESSAGE_CAP[tier];
  try {
    return await checkRateLimitDb(`qra_chat_daily:${tier}:${identifier}`, max, 24 * 60 * 60 * 1000);
  } catch (err) {
    console.error('[AI_GUARD] QRA günlük tavan altyapısı hata verdi:', err instanceof Error ? err.message : err);
    return tier === 'anonymous' ? { ok: false, retryAfterMs: 60 * 60 * 1000 } : { ok: true };
  }
}

/**
 * Kullanımı kaydet. `dealerId` null olabilir (platform düzeyi çağrılar). Başarısız
 * çağrılar `outcome.success=false` ile kaydedilir. DB hatası yutulur (AI yanıtını düşürmez).
 */
export async function recordAiCostUsage(
  dealerId: string | null,
  inputTokens: number,
  outputTokens: number,
  action: string,
  model: string,
  latencyMs = 0,
  outcome: { success?: boolean; error?: string } = {}
): Promise<void> {
  try {
    await prisma.aIUsageLog.create({
      data: {
        dealerId: dealerId ?? null,
        action,
        model,
        inputTokens: Math.max(0, Math.round(inputTokens || 0)),
        outputTokens: Math.max(0, Math.round(outputTokens || 0)),
        latencyMs: Math.max(0, Math.round(latencyMs || 0)),
        success: outcome.success !== false,
        error: outcome.error ? outcome.error.slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.error('[AI_GUARD] kullanım kaydı yazılamadı:', err instanceof Error ? err.message : err);
  }
}
