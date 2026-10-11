/**
 * Denetim Y3 — arka plan analizi ile etkileşimli AI ayrı havuzda: sohbet/anlatı/yanıt taslağı
 * bayinin günlük tavanının yalnız `AI_INTERACTIVE_BUDGET_SHARE` kadarını kullanabilir; kalan pay
 * geri bildirim analizine ayrılır (yoğun asistan kullanımı analiz hattını durduramaz).
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import {
  AI_DAILY_TOKEN_LIMIT_PER_DEALER,
  AI_INTERACTIVE_BUDGET_SHARE,
  AiCostLimitExceededError,
  dealerDailyLimitFor,
  guardAiCall,
} from '@/lib/ai-cost-guard';

const interactiveCap = Math.floor(AI_DAILY_TOKEN_LIMIT_PER_DEALER * AI_INTERACTIVE_BUDGET_SHARE);

function usedToday(tokens: number) {
  db.aIUsageLog.aggregate.mockResolvedValue({ _sum: { inputTokens: tokens, outputTokens: 0 } });
}

beforeEach(() => resetDb());

it('görev sınıfına göre tavan: arka plan tam, etkileşimli pay', () => {
  expect(dealerDailyLimitFor('analyze')).toBe(AI_DAILY_TOKEN_LIMIT_PER_DEALER);
  expect(dealerDailyLimitFor('embedding')).toBe(AI_DAILY_TOKEN_LIMIT_PER_DEALER);
  expect(dealerDailyLimitFor('auto_reply')).toBe(AI_DAILY_TOKEN_LIMIT_PER_DEALER);
  expect(dealerDailyLimitFor('ask_ai')).toBe(interactiveCap);
  expect(dealerDailyLimitFor('insights')).toBe(interactiveCap);
  expect(dealerDailyLimitFor('suggest_reply')).toBe(interactiveCap);
  expect(dealerDailyLimitFor(undefined)).toBe(AI_DAILY_TOKEN_LIMIT_PER_DEALER);
});

it('etkileşimli pay dolunca sohbet 429, geri bildirim analizi hâlâ çalışır', async () => {
  usedToday(interactiveCap);
  await expect(guardAiCall({ task: 'ask_ai', dealerId: 'd1' })).rejects.toBeInstanceOf(AiCostLimitExceededError);
  await expect(guardAiCall({ task: 'ask_ai', dealerId: 'd1' })).rejects.toThrow(/etkileşimli/);
  await expect(guardAiCall({ task: 'analyze', dealerId: 'd1' })).resolves.toBeUndefined();
});

it('tam tavan dolunca analiz de durur', async () => {
  usedToday(AI_DAILY_TOKEN_LIMIT_PER_DEALER);
  await expect(guardAiCall({ task: 'analyze', dealerId: 'd1' })).rejects.toBeInstanceOf(AiCostLimitExceededError);
});
