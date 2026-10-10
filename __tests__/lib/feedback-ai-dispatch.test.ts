/**
 * P0-32 — yeni geri bildirimin AI analizine yönlendirilmesi (`/api/feedbacks` POST).
 *
 * Hata senaryoları (eski satır içi kopya):
 *  1. Bayi AI ayarı okunamazsa ("defaulting to analyze") müşteri metni yine LLM'e gidiyordu.
 *  2. Satır içi yol ortak hattı (deneme talebi, koşullu tamamlama, tercihe uyan tekil uyarı)
 *     atlıyordu.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

const mockPolicy = jest.fn();
jest.mock('@/lib/ai-policy', () => {
  const actual = jest.requireActual('@/lib/ai-policy');
  return {
    ...actual,
    getDealerAiPolicy: (...a: unknown[]) => mockPolicy(...a),
  };
});

const mockPipeline = jest.fn();
jest.mock('@/lib/inngest/feedback-analyze-pipeline', () => ({
  MIN_ANALYZABLE_TEXT_LENGTH: 5,
  runFeedbackAnalyzePipeline: (...a: unknown[]) => mockPipeline(...a),
}));

const mockAutoReplies = jest.fn();
jest.mock('@/lib/auto-reply-engine', () => ({
  processAutoReplies: (...a: unknown[]) => mockAutoReplies(...a),
}));

import fs from 'fs';
import path from 'path';
import {
  runAutoRepliesOnly,
  runInlineFeedbackAnalysis,
  shouldDispatchFeedbackAnalysis,
} from '@/lib/feedback-ai-dispatch';

const policy = (over: Record<string, unknown> = {}) => ({
  dealerId: 'dealer-1',
  aiEnabled: true,
  autoAnalyze: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  customPrompt: null,
  source: 'settings',
  ...over,
});

const TEXT = 'Servis çok yavaştı, garson ilgisizdi.';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockAutoReplies.mockResolvedValue({ action: 'none', reason: 'no-rules' });
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('shouldDispatchFeedbackAnalysis', () => {
  it('ayar açıkken analiz başlatır ve politikayı TAZE okur', async () => {
    mockPolicy.mockResolvedValue(policy());
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', TEXT)).resolves.toBe(true);
    expect(mockPolicy).toHaveBeenCalledWith('dealer-1', { fresh: true });
  });

  it('AI ana anahtarı kapalıysa analiz YOK', async () => {
    mockPolicy.mockResolvedValue(policy({ aiEnabled: false }));
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', TEXT)).resolves.toBe(false);
  });

  it('otomatik analiz kapalıysa analiz YOK', async () => {
    mockPolicy.mockResolvedValue(policy({ autoAnalyze: false }));
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', TEXT)).resolves.toBe(false);
  });

  it('ayar okunamazsa (unavailable) fail-closed', async () => {
    mockPolicy.mockResolvedValue(policy({ source: 'unavailable', aiEnabled: false, autoAnalyze: false }));
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', TEXT)).resolves.toBe(false);
  });

  it('politika okuma fırlatırsa da fail-closed', async () => {
    mockPolicy.mockRejectedValue(new Error('neon down'));
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', TEXT)).resolves.toBe(false);
  });

  it('boş/kısa metinde politika sorulmadan false', async () => {
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', null)).resolves.toBe(false);
    await expect(shouldDispatchFeedbackAnalysis('dealer-1', '  iyi ')).resolves.toBe(false);
    expect(mockPolicy).not.toHaveBeenCalled();
  });
});

describe('runInlineFeedbackAnalysis', () => {
  it('ortak hattı olay kaynağıyla çalıştırır; başarılıysa yanıt motorunu tekrar çağırmaz', async () => {
    mockPipeline.mockResolvedValue({ success: true, sentiment: 'negative', completed: true, fallback: false, attempt: 1 });
    await runInlineFeedbackAnalysis('fb-1');
    expect(mockPipeline).toHaveBeenCalledWith('fb-1', { source: 'event' });
    expect(mockAutoReplies).not.toHaveBeenCalled();
  });

  it('hat atlarsa (ör. AI bu arada kapatıldı) yalnız kural tabanlı yanıt çalışır', async () => {
    mockPipeline.mockResolvedValue({ skipped: true, reason: 'ai-disabled' });
    await runInlineFeedbackAnalysis('fb-1');
    expect(mockAutoReplies).toHaveBeenCalledWith('fb-1');
  });

  it('hat fırlatırsa yutar ve yanıt motorunu çalıştırır', async () => {
    mockPipeline.mockRejectedValue(new Error('boom'));
    await expect(runInlineFeedbackAnalysis('fb-1')).resolves.toBeUndefined();
    expect(mockAutoReplies).toHaveBeenCalledWith('fb-1');
  });

  it('runAutoRepliesOnly asla fırlatmaz', async () => {
    mockAutoReplies.mockRejectedValue(new Error('db'));
    await expect(runAutoRepliesOnly('fb-1')).resolves.toBeUndefined();
  });
});

describe('/api/feedbacks satır içi analiz kopyası kaldırıldı (regresyon kalkanı)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'app/api/feedbacks/route.ts'), 'utf8');

  it('LLM analizi doğrudan çağrılmaz; ortak yönlendirici kullanılır', () => {
    expect(src).not.toMatch(/analyzeWithFallback/);
    expect(src).not.toMatch(/aISettings\.findUnique/);
    expect(src).toMatch(/shouldDispatchFeedbackAnalysis\(/);
    expect(src).toMatch(/runInlineFeedbackAnalysis\(/);
  });
});
