/**
 * P0-32 — ai-retry cron'u: AI'ı kapalı bayiyi sorgudan dışlar, deneme hakkı bitmiş ve kısa
 * metinli kayıtları kuyruğa almaz, sağlayıcı yoksa hiçbir şey denemez.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/cron-auth', () => ({ requireCronAuth: () => null }));

const mockConfigured = jest.fn(() => true);
jest.mock('@/lib/ai-engine', () => ({ isAIConfigured: () => mockConfigured() }));

const mockRun = jest.fn();
jest.mock('@/lib/inngest/feedback-analyze-pipeline', () => ({
  MAX_AI_ATTEMPTS: 3,
  MIN_ANALYZABLE_TEXT_LENGTH: 5,
  runFeedbackAnalyzePipeline: (...a: unknown[]) => mockRun(...a),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { GET } from '@/app/api/cron/ai-retry/route';
import { dealerAutoAnalyzeAllowedWhere } from '@/lib/ai-policy';

function req() {
  return new Request('https://internal/cron', { headers: { authorization: 'Bearer x' } });
}

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  db.feedback.updateMany.mockResolvedValue({ count: 1 });
  mockRun.mockResolvedValue({ success: true, sentiment: 'negative', completed: true, fallback: false, attempt: 1 });
});

it('aday sorgusu AI kapalı bayiyi ve hakkı bitmiş kayıtları dışlar', async () => {
  db.feedback.findMany.mockResolvedValue([]);
  await GET(req());
  const where = db.feedback.findMany.mock.calls[0][0].where;
  expect(where.qrCode).toEqual({ dealer: dealerAutoAnalyzeAllowedWhere() });
  expect(where.aiAttempts).toEqual({ lt: 3 });
  expect(where.aiProcessedAt).toBeNull();
  expect(where.deletedAt).toBeNull();
  // Politika filtresi: ayar satırı yok ya da (isEnabled && autoAnalyze).
  expect(JSON.stringify(dealerAutoAnalyzeAllowedWhere())).toContain('"isEnabled":true');
  expect(JSON.stringify(dealerAutoAnalyzeAllowedWhere())).toContain('"autoAnalyze":true');
});

it('kısa metinler analiz edilmez, deneme hakları kapatılır', async () => {
  db.feedback.findMany.mockResolvedValue([
    { id: 'short-1', text: 'iyi' },
    { id: 'long-1', text: 'Servis yavaştı ama yemek güzeldi.' },
  ]);
  const res = await GET(req());
  const body = await res.json();
  expect(mockRun).toHaveBeenCalledTimes(1);
  expect(mockRun).toHaveBeenCalledWith('long-1', { source: 'retry' });
  const mark = db.feedback.updateMany.mock.calls[0][0];
  expect(mark.where.id).toEqual({ in: ['short-1'] });
  expect(mark.data).toEqual({ aiAttempts: 3 });
  expect(body).toMatchObject({ shortExcluded: 1, processed: 1, upgraded: 1 });
});

it('sağlayıcı yapılandırılmamışsa sorgu bile yapılmaz', async () => {
  mockConfigured.mockReturnValue(false);
  const res = await GET(req());
  expect((await res.json()).skipped).toBe('provider-unavailable');
  expect(db.feedback.findMany).not.toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
});
