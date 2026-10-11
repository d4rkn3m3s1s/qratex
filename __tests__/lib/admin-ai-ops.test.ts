/**
 * /admin/ai — AI Operasyon Merkezi: sözleşme + sunucu çekirdeği. Gerçek DB yok; prisma sahte.
 *
 * Kapsanan bulgular (docs/audit/2026-10-08/admin/admin_ai-dashboard.md, admin_ai-detailed.md):
 *  - dashboard B3: çağrı yokken sağlık "%100" uydurulmaz; %0 başarı "kesinti" olur.
 *  - detailed Bulgu 2: aciliyet kovaları çapaların ortasında (0.3→Düşük, 0.5→Orta, 0.7→Yüksek, 1.0→Kritik).
 *  - dashboard B1: sezgisel kayıt sinyallerden dışlanır; temizleme/yeniden kuyruk denetimli.
 *  - dashboard B6: askAI hata/kota metni yanıt sayılmaz.
 */
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/ai-cost-guard', () => ({
  AI_DAILY_TOKEN_LIMIT_PER_DEALER: 100_000,
  AI_GLOBAL_DAILY_TOKEN_LIMITS: { qra_chat: 150_000, system_learning: 60_000 },
  AI_UNSCOPED_DAILY_TOKEN_LIMIT: 300_000,
  getTodayUnscopedUsage: jest.fn(async () => 0),
  getTodayUsageByAction: jest.fn(async () => 0),
}));
const askAI = jest.fn();
const isAIConfigured = jest.fn(() => true);
jest.mock('@/lib/ai-engine', () => ({
  askAI: (...a: unknown[]) => askAI(...a),
  isAIConfigured: () => isAIConfigured(),
  getAIProviderStatus: () => ({ configured: true, provider: 'groq', model: 'm' }),
}));
const invalidate = jest.fn();
jest.mock('@/lib/ai-policy', () => ({
  dealerAutoAnalyzeAllowedWhere: () => ({ OR: [{ aiSettings: { is: null } }] }),
  invalidateDealerAiPolicy: (id: string) => invalidate(id),
}));
const pipeline = jest.fn();
jest.mock('@/lib/inngest/feedback-analyze-pipeline', () => ({
  MAX_AI_ATTEMPTS: 3,
  MIN_ANALYZABLE_TEXT_LENGTH: 5,
  runFeedbackAnalyzePipeline: (...a: unknown[]) => pipeline(...a),
}));

import {
  assistantSchema,
  backlogActionSchema,
  classifyHealth,
  csvCell,
  dealerAiPatchSchema,
  dealerRiskScore,
  deltaPct,
  isAskAiFailure,
  modelKind,
  pct,
  periodWindow,
  signalFeedbacksQuerySchema,
  urgencyBucket,
  churnBucket,
} from '@/lib/admin-ai-ops/contract';
import {
  askAssistant,
  bucketKeys,
  istanbulBucketKey,
  pendingWhere,
  processBacklog,
  retryOne,
  runBacklogAction,
  setDealerAi,
  signalWhere,
} from '@/lib/admin-ai-ops/server';
import { ApiError } from '@/lib/http/define-route';

const actor = { id: 'admin1', email: 'a@x.com', role: 'ADMIN', type: 'user' as const };

describe('sözleşme', () => {
  it('aciliyet kovaları prompt çapalarını doğru kovaya koyar', () => {
    expect(urgencyBucket(0.3)).toBe('low');
    expect(urgencyBucket(0.5)).toBe('medium');
    expect(urgencyBucket(0.7)).toBe('high');
    expect(urgencyBucket(1)).toBe('critical');
    expect(urgencyBucket(null)).toBeNull();
    expect(churnBucket(0.75)).toBe('high');
    expect(churnBucket(0.1)).toBe('safe');
  });

  it('sağlık: çağrı yoksa idle, tüm çağrılar başarısızsa kesinti, sağlayıcı yoksa unconfigured', () => {
    expect(classifyHealth({ configured: true, calls: 0, failures: 0, p95Ms: null })).toBe('idle');
    expect(classifyHealth({ configured: true, calls: 2, failures: 2, p95Ms: null })).toBe('down');
    expect(classifyHealth({ configured: true, calls: 100, failures: 10, p95Ms: 900 })).toBe('degraded');
    expect(classifyHealth({ configured: true, calls: 100, failures: 1, p95Ms: 9000 })).toBe('degraded');
    expect(classifyHealth({ configured: true, calls: 100, failures: 1, p95Ms: 900 })).toBe('ok');
    expect(classifyHealth({ configured: false, calls: 5, failures: 0, p95Ms: 1 })).toBe('unconfigured');
  });

  it('oranlar: payda 0 → null (varsayılan %100/0 yok)', () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(15, 10)).toBe(50);
  });

  it('model türü: sezgisel, yerel yedek, LLM', () => {
    expect(modelKind('bootstrap-heuristic')).toBe('synthetic');
    expect(modelKind('local-fallback')).toBe('fallback');
    expect(modelKind('groq/llama')).toBe('llm');
    expect(modelKind(null)).toBe('unknown');
  });

  it('askAI hata/kota metinleri yanıt sayılmaz', () => {
    expect(isAskAiFailure('Bir hata oluştu. Lütfen tekrar deneyin.')).toBe(true);
    expect(isAskAiFailure('Platformun günlük AI kotası doldu. Lütfen yarın tekrar deneyin.')).toBe(true);
    expect(isAskAiFailure('')).toBe(true);
    expect(isAskAiFailure('En çok şikâyet X bayisinde.')).toBe(false);
  });

  it('risk skoru: hacim güveniyle ölçeklenir, kayıt yoksa 0', () => {
    expect(dealerRiskScore({ feedbacks: 0, negative: 0, urgent: 0, churnHigh: 0, avgRating: null })).toBe(0);
    const small = dealerRiskScore({ feedbacks: 4, negative: 4, urgent: 4, churnHigh: 4, avgRating: 1 });
    const big = dealerRiskScore({ feedbacks: 40, negative: 40, urgent: 40, churnHigh: 40, avgRating: 1 });
    expect(big).toBe(100);
    expect(small).toBeLessThan(big);
  });

  it('şemalar: gerekçe zorunlu, değer gerektiren sinyal değersiz reddedilir, CSV formül kaçışı', () => {
    expect(dealerAiPatchSchema.safeParse({ dealerId: 'd', aiEnabled: false, reason: 'kısa' }).success).toBe(false);
    expect(dealerAiPatchSchema.safeParse({ dealerId: 'd', reason: 'yeterli gerekçe' }).success).toBe(false);
    expect(dealerAiPatchSchema.safeParse({ dealerId: 'd', aiEnabled: false, reason: 'yeterli gerekçe' }).success).toBe(true);
    expect(backlogActionSchema.safeParse({ action: 'clear_synthetic', reason: 'x' }).success).toBe(false);
    expect(signalFeedbacksQuerySchema.safeParse({ signal: 'theme' }).success).toBe(false);
    expect(signalFeedbacksQuerySchema.safeParse({ signal: 'urgent' }).success).toBe(true);
    expect(assistantSchema.parse({ question: 'Merhaba' }).period).toBe('30d');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('a;b')).toBe('"a;b"');
  });
});

describe('zaman kovaları (İstanbul)', () => {
  it('UTC 21:30 İstanbul ertesi günüdür', () => {
    expect(istanbulBucketKey(new Date('2026-10-08T21:30:00Z'), 'day')).toBe('2026-10-09');
    expect(istanbulBucketKey(new Date('2026-10-08T21:30:00Z'), 'hour')).toBe('2026-10-09T00:00');
  });
  it('7 günlük pencere 8 gün anahtarı üretir (uçlar dahil), tekrarsız', () => {
    const w = periodWindow('7d', new Date('2026-10-10T12:00:00Z'));
    const keys = bucketKeys(w);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('2026-10-03');
    expect(keys[keys.length - 1]).toBe('2026-10-10');
  });
});

describe('sorgu koşulları', () => {
  it('kuyruk durumları: deneme hakkı ve politika ayrımı', () => {
    const e = pendingWhere('eligible') as Record<string, any>;
    expect(e.aiAttempts).toEqual({ lt: 3 });
    expect(e.deletedAt).toBeNull();
    expect((pendingWhere('exhausted') as any).aiAttempts).toEqual({ gte: 3 });
    expect((pendingWhere('blocked') as any).qrCode.dealer.aiSettings.is.OR).toHaveLength(2);
    expect((pendingWhere('stale') as any).createdAt.lt).toBeInstanceOf(Date);
  });

  it('sinyal listesi sezgisel kayıtları dışlar, silinmişleri almaz, bayiye daraltır', () => {
    const w = periodWindow('7d');
    const urgent = signalWhere({ signal: 'urgent', period: '7d', page: 1, size: 20, dealerId: 'd1' }, w) as any;
    expect(urgent.deletedAt).toBeNull();
    expect(urgent.urgency).toEqual({ gte: 0.6 });
    expect(urgent.OR).toEqual([{ aiModelUsed: null }, { aiModelUsed: { not: 'bootstrap-heuristic' } }]);
    expect(urgent.qrCode).toEqual({ dealerId: 'd1' });
    const theme = signalWhere({ signal: 'theme', value: 'Hizmet', period: '7d', page: 1, size: 20 }, w) as any;
    expect(theme.themes).toEqual({ array_contains: [{ theme: 'Hizmet' }] });
    expect(() => signalWhere({ signal: 'rating', value: '9', period: '7d', page: 1, size: 20 }, w)).toThrow(ApiError);
  });
});

describe('kuyruk işlemleri', () => {
  beforeEach(() => {
    pipeline.mockReset();
    isAIConfigured.mockReturnValue(true);
  });

  it('sağlayıcı yoksa işlem 503, hiçbir şey denenmez', async () => {
    isAIConfigured.mockReturnValue(false);
    await expect(processBacklog({} as any, 5)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('process: kısa metni atlar, sonuçları sayar', async () => {
    const db = { feedback: { findMany: jest.fn(async () => [{ id: 'a', text: 'çok kötüydü' }, { id: 'b', text: 'ok' }, { id: 'c', text: 'fena değil' }]) } } as any;
    pipeline.mockResolvedValueOnce({ success: true, completed: true }).mockResolvedValueOnce({ skipped: true, reason: 'ai-disabled' });
    const r = await processBacklog(db, 10, { budgetMs: 60_000 });
    expect(pipeline).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ processed: 2, upgraded: 1, skipped: 1, failed: 0 });
  });

  it('retry_one: analizli kayıt 409, hakkı bitmişe tek hak verir', async () => {
    const db1 = { feedback: { findUnique: jest.fn(async () => ({ id: 'x', deletedAt: null, aiProcessedAt: new Date(), text: 'uzun metin', aiAttempts: 0 })) } } as any;
    await expect(retryOne(db1, 'x')).rejects.toMatchObject({ code: 'CONFLICT' });
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const db2 = { feedback: { findUnique: jest.fn(async () => ({ id: 'y', deletedAt: null, aiProcessedAt: null, text: 'uzun metin', aiAttempts: 3 })), updateMany } } as any;
    pipeline.mockResolvedValueOnce({ success: true, completed: false });
    const r = await retryOne(db2, 'y');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'y', aiProcessedAt: null }, data: { aiAttempts: 2 } });
    expect(r.outcome).toBe('fallback');
  });

  it('clear_synthetic: yalnız gerçek (demo olmayan) bayilerde, denetim kaydıyla tek transaction', async () => {
    const updateMany = jest.fn(async () => ({ count: 7 }));
    const auditCreate = jest.fn(async () => ({}));
    const tx = { feedback: { updateMany }, auditLog: { create: auditCreate } };
    const db = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as any;
    const r = await runBacklogAction(db, { action: 'clear_synthetic', reason: 'eski düğme temizliği' }, actor, null);
    expect(r).toEqual({ action: 'clear_synthetic', count: 7 });
    const arg = (updateMany.mock.calls[0] as any[])[0];
    expect(arg.where).toEqual({ aiModelUsed: 'bootstrap-heuristic', qrCode: { dealer: { isDemo: false } } });
    expect(arg.data.aiProcessedAt).toBeNull();
    expect((auditCreate.mock.calls[0] as any[])[0].data.action).toBe('ai_ops.backlog.clear_synthetic');
  });
});

describe('bayi AI ayarı', () => {
  it('bayi olmayan kimlik 404, yazma yok', async () => {
    const db = { user: { findUnique: jest.fn(async () => ({ id: 'u', role: 'CUSTOMER' })) }, $transaction: jest.fn() } as any;
    await expect(setDealerAi(db, { dealerId: 'u', aiEnabled: false, reason: 'yeterli gerekçe' }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('upsert + eski/yeni değerli denetim + politika önbelleği temizlenir', async () => {
    const upsert = jest.fn(async () => ({ isEnabled: false, autoAnalyze: true }));
    const auditCreate = jest.fn(async () => ({}));
    const tx = { aISettings: { findUnique: jest.fn(async () => null), upsert }, auditLog: { create: auditCreate } };
    const db = { user: { findUnique: jest.fn(async () => ({ id: 'd1', role: 'DEALER' })) }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as any;
    const r = await setDealerAi(db, { dealerId: 'd1', aiEnabled: false, reason: 'kota aşımı nedeniyle' }, actor);
    expect(r).toEqual({ dealerId: 'd1', aiEnabled: false, autoAnalyze: true });
    expect((upsert.mock.calls[0] as any[])[0]).toMatchObject({ create: { dealerId: 'd1', isEnabled: false }, update: { isEnabled: false } });
    const audit = (auditCreate.mock.calls[0] as any[])[0].data;
    expect(audit.oldData).toMatchObject({ isEnabled: true, _default: true });
    expect(audit.newData).toMatchObject({ isEnabled: false, reason: 'kota aşımı nedeniyle' });
    expect(invalidate).toHaveBeenCalledWith('d1');
  });
});

describe('asistan', () => {
  const db = {
    $queryRaw: jest.fn(async () => []),
    feedback: { findMany: jest.fn(async () => []) },
  } as any;

  it('askAI hata metni döndürürse 503/429 fırlatır (geçmişe yanıt olarak girmez)', async () => {
    askAI.mockResolvedValueOnce('Bir hata oluştu. Lütfen tekrar deneyin.');
    await expect(askAssistant(db, { question: 'Merhaba', period: '7d', history: [] }, 'admin:1')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    askAI.mockResolvedValueOnce('Platformun günlük AI kotası doldu. Lütfen yarın tekrar deneyin.');
    await expect(askAssistant(db, { question: 'Merhaba', period: '7d', history: [] }, 'admin:1')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('başarılı yanıtta bağlama bayi sıralaması ve kaynak çipleri eklenir', async () => {
    askAI.mockResolvedValueOnce('  Yanıt  ');
    const r = await askAssistant(db, { question: 'Hangi bayi?', period: '7d', history: [] }, 'admin:1');
    expect(r.answer).toBe('Yanıt');
    expect(r.sources.length).toBeGreaterThan(0);
    const [, ctx, opts] = askAI.mock.calls[askAI.mock.calls.length - 1];
    expect(Array.isArray(ctx.dealerRanking)).toBe(true);
    expect(opts).toEqual({ actorKey: 'admin:1' });
  });
});
