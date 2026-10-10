/**
 * P0-32 — "AI kapalı" politikası arka plan hattında ve tek seferlik yan etkiler.
 *
 * Saldırı/hata senaryoları:
 *  1. Bayi AI'ı kapattı → ai-retry/Inngest hattı müşteri metnini yine LLM'e gönderiyordu.
 *  2. Kalıcı "işlenmemiş" kayıt her koşuda yeniden analiz + bildirim + otomatik yanıt üretiyordu.
 *  3. Eşzamanlı iki koşu (Inngest + cron) aynı kaydı iki kez işliyordu.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));

const mockAnalyze = jest.fn();
const mockIsConfigured = jest.fn(() => true);
jest.mock('@/lib/ai-engine', () => ({
  analyzeWithFallback: (...a: unknown[]) => mockAnalyze(...a),
  isAIConfigured: () => mockIsConfigured(),
}));

const mockStoreEmbedding = jest.fn();
const mockAdaptive = jest.fn();
jest.mock('@/lib/ai-learning', () => ({
  formatAdaptiveProfile: () => '',
  getAdaptiveProfileForDealer: jest.fn(async () => null),
  maybeTriggerAdaptiveUpdate: (...a: unknown[]) => mockAdaptive(...a),
  storeFeedbackEmbedding: (...a: unknown[]) => mockStoreEmbedding(...a),
}));

const mockAutoReplies = jest.fn();
jest.mock('@/lib/auto-reply-engine', () => ({
  processAutoReplies: (...a: unknown[]) => mockAutoReplies(...a),
}));

const mockRemedy = jest.fn();
jest.mock('@/lib/remedy-automation-core', () => ({
  maybeCreateAutoRemedyForFeedback: (...a: unknown[]) => mockRemedy(...a),
}));

import { db, resetDb, $transaction } from '../helpers/prisma-proxy';
import {
  MAX_AI_ATTEMPTS,
  notifyDealerOnce,
  runFeedbackAnalyzePipeline,
  shouldAnalyzeFeedback,
} from '@/lib/inngest/feedback-analyze-pipeline';
import { __resetAiPolicyCacheForTests } from '@/lib/ai-policy';
import { AiCostLimitExceededError } from '@/lib/ai-cost-guard';

const FEEDBACK = {
  id: 'fb-1',
  text: 'Servis çok yavaştı, garson ilgisizdi.',
  rating: 2,
  userId: 'cust-1',
  qrCodeId: 'qr-1',
  deletedAt: null,
  aiProcessedAt: null,
  aiAttempts: 0,
  qrCode: { dealerId: 'dealer-1' },
};

const REAL_ANALYSIS = {
  sentiment: { label: 'negative', score: 0.1 },
  emotions: [],
  topics: ['servis'],
  toxicity: { isToxic: false, score: 0, categories: [] },
  intent: { label: 'complaint', score: 0.9 },
  urgency: 0.9,
  churnRisk: 0.2,
  modelUsed: 'groq/llama',
  version: '2.0/analysis.v3',
};

function aiSettings(row: Record<string, unknown> | null) {
  db.aISettings.findUnique.mockResolvedValue(row);
}

/** advisory lock'lu transaction için tx: aynı sahte modeller + $executeRaw. */
function wireTransactions() {
  $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ $executeRaw: jest.fn(async () => 1), notification: db.notification })
  );
}

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  __resetAiPolicyCacheForTests();
  mockIsConfigured.mockReturnValue(true);
  wireTransactions();
  db.feedback.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
    args?.select && 'aiAttempts' in args.select && !('text' in args.select) ? { aiAttempts: 1 } : { ...FEEDBACK }
  );
  db.feedback.updateMany.mockResolvedValue({ count: 1 });
  db.notification.findFirst.mockResolvedValue(null);
  db.notification.create.mockResolvedValue({ id: 'n1' });
  mockAnalyze.mockResolvedValue(REAL_ANALYSIS);
});

describe('shouldAnalyzeFeedback (saf kapı)', () => {
  const base = { text: 'yeterince uzun metin', deletedAt: null, aiProcessedAt: null, aiAttempts: 0 };
  const on = { aiEnabled: true, autoAnalyze: true, source: 'settings' as const };

  it('AI ana anahtarı kapalı → reddeder', () => {
    expect(shouldAnalyzeFeedback(base, { ...on, aiEnabled: false })).toEqual({ ok: false, reason: 'ai-disabled' });
  });
  it('otomatik analiz kapalı → reddeder', () => {
    expect(shouldAnalyzeFeedback(base, { ...on, autoAnalyze: false })).toEqual({ ok: false, reason: 'ai-disabled' });
  });
  it('ayar okunamadı → fail-closed', () => {
    expect(shouldAnalyzeFeedback(base, { ...on, source: 'unavailable' })).toEqual({ ok: false, reason: 'policy-unavailable' });
  });
  it('kısa metin, silinmiş, işlenmiş ve hakkı bitmiş kayıtları reddeder', () => {
    expect(shouldAnalyzeFeedback({ ...base, text: 'iyi' }).ok).toBe(false);
    expect(shouldAnalyzeFeedback({ ...base, deletedAt: new Date() }).ok).toBe(false);
    expect(shouldAnalyzeFeedback({ ...base, aiProcessedAt: new Date() }).ok).toBe(false);
    expect(shouldAnalyzeFeedback({ ...base, aiAttempts: MAX_AI_ATTEMPTS })).toEqual({ ok: false, reason: 'attempts-exhausted' });
  });
  it('uygun kayıt + açık politika → geçer', () => {
    expect(shouldAnalyzeFeedback(base, on)).toEqual({ ok: true });
  });
});

describe('runFeedbackAnalyzePipeline — AI kapalı bayi', () => {
  it.each([
    ['isEnabled=false', { isEnabled: false, autoAnalyze: true }],
    ['autoAnalyze=false', { isEnabled: true, autoAnalyze: false }],
  ])('%s → LLM çağrısı 0, deneme sayacı artmaz, yan etki yok', async (_label, row) => {
    aiSettings({ ...row, alertOnToxic: true, alertOnUrgent: true, alertOnChurnRisk: true, customPrompt: null });
    const res = await runFeedbackAnalyzePipeline('fb-1', { source: 'retry' });
    expect(res).toEqual({ skipped: true, reason: 'ai-disabled' });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(db.feedback.updateMany).not.toHaveBeenCalled();
    expect(mockAutoReplies).not.toHaveBeenCalled();
    expect(mockStoreEmbedding).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('ayar okunamazsa (DB hatası) fail-closed: LLM çağrısı 0', async () => {
    db.aISettings.findUnique.mockRejectedValue(new Error('db down'));
    const res = await runFeedbackAnalyzePipeline('fb-1');
    expect(res).toEqual({ skipped: true, reason: 'policy-unavailable' });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});

describe('runFeedbackAnalyzePipeline — deneme sayacı ve atomik talep', () => {
  it('talep koşullu artışla yapılır (aiAttempts < MAX, aiProcessedAt null, kira dolmuş)', async () => {
    aiSettings(null);
    await runFeedbackAnalyzePipeline('fb-1');
    const claim = db.feedback.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: 'fb-1', aiProcessedAt: null, deletedAt: null, aiAttempts: { lt: MAX_AI_ATTEMPTS } });
    expect(claim.where.OR).toBeDefined();
    expect(claim.data).toMatchObject({ aiAttempts: { increment: 1 } });
  });

  it('talebi kaybeden eşzamanlı koşu hiçbir şey yapmaz', async () => {
    aiSettings(null);
    db.feedback.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await runFeedbackAnalyzePipeline('fb-1');
    expect(res).toEqual({ skipped: true, reason: 'claim-lost' });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('deneme hakkı bitmiş kayıt hiç denenmez', async () => {
    aiSettings(null);
    db.feedback.findUnique.mockResolvedValue({ ...FEEDBACK, aiAttempts: MAX_AI_ATTEMPTS });
    const res = await runFeedbackAnalyzePipeline('fb-1', { source: 'retry' });
    expect(res).toEqual({ skipped: true, reason: 'attempts-exhausted' });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('cron yolunda sağlayıcı yoksa hak yakılmaz', async () => {
    aiSettings(null);
    mockIsConfigured.mockReturnValue(false);
    const res = await runFeedbackAnalyzePipeline('fb-1', { source: 'retry' });
    expect(res).toEqual({ skipped: true, reason: 'provider-unavailable' });
    expect(db.feedback.updateMany).not.toHaveBeenCalled();
  });

  it('kiracı bütçesi aşımı hattı düşürmez (budget olarak atlanır)', async () => {
    aiSettings(null);
    mockAnalyze.mockRejectedValueOnce(new AiCostLimitExceededError());
    const res = await runFeedbackAnalyzePipeline('fb-1');
    expect(res).toEqual({ skipped: true, reason: 'budget' });
    expect(mockAutoReplies).not.toHaveBeenCalled();
  });
});

describe('runFeedbackAnalyzePipeline — tek seferlik yan etkiler', () => {
  it('tamamlayan koşu: aiProcessedAt koşullu yazılır, yan etkiler bir kez', async () => {
    aiSettings(null);
    const res = await runFeedbackAnalyzePipeline('fb-1');
    expect(res).toMatchObject({ success: true, completed: true });
    const write = db.feedback.updateMany.mock.calls[1][0];
    expect(write.where).toEqual({ id: 'fb-1', aiProcessedAt: null, deletedAt: null });
    expect(write.data.aiProcessedAt).toBeInstanceOf(Date);
    expect(mockAutoReplies).toHaveBeenCalledTimes(1);
    expect(mockAdaptive).toHaveBeenCalledTimes(1);
    // urgency 0.9 → acil uyarısı (dedupeKey'li)
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create.mock.calls[0][0].data.data.dedupeKey).toBe('ai-alert:urgent:fb-1');
  });

  it('başka koşu önce tamamladıysa (yazım count=0) yan etki YOK', async () => {
    aiSettings(null);
    db.feedback.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const res = await runFeedbackAnalyzePipeline('fb-1');
    expect(res).toEqual({ skipped: true, reason: 'already-processed' });
    expect(mockAutoReplies).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(mockRemedy).not.toHaveBeenCalled();
  });

  it('cron tekrarında yerel (fallback) sonuç yan etki üretmez', async () => {
    aiSettings(null);
    db.feedback.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
      args?.select && !('text' in args.select) ? { aiAttempts: 2 } : { ...FEEDBACK, aiAttempts: 1 }
    );
    mockAnalyze.mockResolvedValue({ ...REAL_ANALYSIS, modelUsed: 'local-fallback', urgency: undefined, churnRisk: undefined });
    const res = await runFeedbackAnalyzePipeline('fb-1', { source: 'retry' });
    expect(res).toMatchObject({ success: true, completed: false, fallback: true, attempt: 2 });
    expect(mockAutoReplies).not.toHaveBeenCalled();
    expect(mockStoreEmbedding).not.toHaveBeenCalled();
  });

  it('bayi alertOnUrgent=false ise acil bildirimi gönderilmez', async () => {
    aiSettings({ isEnabled: true, autoAnalyze: true, alertOnToxic: true, alertOnUrgent: false, alertOnChurnRisk: true, customPrompt: null });
    await runFeedbackAnalyzePipeline('fb-1');
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('notifyDealerOnce', () => {
  it('aynı geri bildirim × tür için ikinci bildirim oluşturmaz', async () => {
    db.notification.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'n1' });
    await expect(notifyDealerOnce({ dealerId: 'd', feedbackId: 'f', kind: 'toxic' })).resolves.toBe(true);
    await expect(notifyDealerOnce({ dealerId: 'd', feedbackId: 'f', kind: 'toxic' })).resolves.toBe(false);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
});
