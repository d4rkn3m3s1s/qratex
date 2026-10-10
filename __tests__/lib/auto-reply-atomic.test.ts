/**
 * P0-32 — otomatik yanıt idempotent: bayinin elle yazdığı yanıt ezilmez, müşteri ikinci
 * bildirim/e-posta almaz; AI'ı kapalı bayi için LLM yanıtı üretilmez.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));

const mockGenerate = jest.fn();
jest.mock('@/lib/ai-engine', () => ({ generateAutoReply: (...a: unknown[]) => mockGenerate(...a) }));
const mockEmail = jest.fn();
jest.mock('@/lib/notify-email', () => ({ emailDealerReply: (...a: unknown[]) => mockEmail(...a) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { processAutoReplies } from '@/lib/auto-reply-engine';
import { __resetAiPolicyCacheForTests } from '@/lib/ai-policy';

const FB = {
  id: 'fb-1',
  userId: 'cust-1',
  rating: 1,
  sentiment: 'negative',
  text: 'Çok kötüydü',
  isToxic: false,
  trustFlagged: false,
  deletedAt: null,
  dealerReply: null,
  dealerRepliedAt: null,
  qrCode: { dealerId: 'dealer-1' },
};
const RULE = {
  id: 'r1',
  name: 'Düşük puan',
  action: 'reply',
  template: 'Yaşadığınız sorun için üzgünüz.',
  tone: 'professional',
  condition: { field: 'rating', op: 'lte', value: 2 },
};

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  __resetAiPolicyCacheForTests();
  db.feedback.findUnique.mockResolvedValue({ ...FB });
  db.autoReplyRule.findMany.mockResolvedValue([RULE]);
  db.aISettings.findUnique.mockResolvedValue(null);
  db.notification.create.mockResolvedValue({ id: 'n1' });
  db.user.findUnique.mockResolvedValue({ businessName: 'Kafe' });
  mockGenerate.mockResolvedValue('Geri bildiriminiz için teşekkür ederiz, ekibimizle konuşacağız.');
});

it('yazım dealerReply/dealerRepliedAt IS NULL koşullu; kaybedilirse bildirim/e-posta YOK', async () => {
  // Bayi, otomatik yanıt üretilirken elle yanıtladı → koşullu yazım 0 satır.
  db.feedback.updateMany.mockResolvedValue({ count: 0 });
  const out = await processAutoReplies('fb-1');
  expect(out).toEqual({ action: 'reply', written: false, ai: true });
  const where = db.feedback.updateMany.mock.calls[0][0].where;
  expect(where).toEqual({ id: 'fb-1', dealerReply: null, dealerRepliedAt: null, deletedAt: null });
  expect(db.notification.create).not.toHaveBeenCalled();
  expect(mockEmail).not.toHaveBeenCalled();
});

it('zaten yanıtlanmış geri bildirime hiç dokunmaz (LLM çağrısı da yok)', async () => {
  db.feedback.findUnique.mockResolvedValue({ ...FB, dealerReply: 'Elle yanıt', dealerRepliedAt: new Date() });
  const out = await processAutoReplies('fb-1');
  expect(out).toEqual({ action: 'none', reason: 'already-replied' });
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(db.feedback.updateMany).not.toHaveBeenCalled();
});

it('AI ana anahtarı kapalı bayi: LLM yanıtı üretilmez, şablon kullanılır', async () => {
  db.aISettings.findUnique.mockResolvedValue({
    isEnabled: false, autoAnalyze: true, alertOnToxic: true, alertOnUrgent: true, alertOnChurnRisk: true, customPrompt: null,
  });
  db.feedback.updateMany.mockResolvedValue({ count: 1 });
  const out = await processAutoReplies('fb-1');
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(out).toEqual({ action: 'reply', written: true, ai: false });
  expect(db.feedback.updateMany.mock.calls[0][0].data.dealerReply).toBe(RULE.template);
  expect(db.notification.create).toHaveBeenCalledTimes(1);
});
