/**
 * Otomasyon sunucu katmanı — 20 kural sınırı kilit altında, sıralama bütünlüğü, telafi ayarı
 * kırpma/tetik/ay başı, tarama kuru çalıştırma sınıflaması, katalog tekilliği ve etkin set.
 * Prisma bellek içi sahte (gerçek veritabanına ASLA gidilmez).
 */
jest.mock('@/lib/prisma', () => {
  const base = require('../../helpers/prisma-proxy');
  const execRaw = jest.fn().mockResolvedValue(0);
  const prisma = new Proxy(base.prisma, {
    get(t: Record<string, unknown>, k: string) {
      if (k === '$executeRaw') return execRaw;
      return t[k];
    },
  });
  return { ...base, prisma, __execRaw: execRaw };
});
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/ai-policy', () => ({
  getDealerAiPolicy: jest.fn().mockResolvedValue({ source: 'db' }),
  canUseAi: () => true,
  canAutoAnalyze: () => true,
}));

import { db, resetDb, $transaction } from '../../helpers/prisma-proxy';
import { prisma } from '@/lib/prisma';
import { createReplyRule, reorderReplyRules, previewReplyCondition } from '@/lib/dealer-automation/replies.server';
import { cleanTemplateValues, createRemedyTemplate, effectiveFor, scanRemedy } from '@/lib/dealer-automation/remedy.server';
import {
  istanbulMonthStart,
  parseRemedyAutomationConfig,
  remedyTrigger,
  renderRemedyMessage,
} from '@/lib/dealer-automation/remedy-config';
import { ApiError } from '@/lib/http/define-route';
import { maybeCreateAutoRemedyForFeedback } from '@/lib/remedy-automation-core';

const actor = { dealerId: 'd1', actorId: 'd1' };

beforeEach(() => {
  resetDb();
  $transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  db.auditLog.create.mockResolvedValue({});
});

describe('otomatik yanıt yazma', () => {
  const body = {
    name: 'Düşük puan',
    condition: { field: 'rating' as const, op: 'lte' as const, value: 2 },
    action: 'reply' as const,
    template: 'Üzgünüz, {{musteri}}.',
    tone: null,
    isActive: true,
  };

  it('20 kural doluysa LIMIT_REACHED (409) — sayım kilit altında', async () => {
    db.autoReplyRule.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `r${i}` })));
    await expect(createReplyRule(actor, body)).rejects.toMatchObject({ code: 'LIMIT_REACHED', status: 409 });
    expect(db.autoReplyRule.create).not.toHaveBeenCalled();
  });

  it('yeni kural listenin sonuna eklenir ve öncelikler sıradan türetilir', async () => {
    db.autoReplyRule.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    db.autoReplyRule.create.mockResolvedValue({ id: 'c' });
    db.autoReplyRule.updateMany.mockResolvedValue({ count: 1 });
    await createReplyRule(actor, body);
    const calls = db.autoReplyRule.updateMany.mock.calls.map((c) => [c[0].where.id, c[0].data.priority]);
    expect(calls).toEqual([
      ['a', 3],
      ['b', 2],
      ['c', 1],
    ]);
    const stored = db.autoReplyRule.create.mock.calls[0][0].data;
    expect(stored.condition).toEqual({ field: 'rating', op: 'lte', value: 2 });
    expect(stored.dealerId).toBe('d1');
  });

  it('sıralama mevcut kural kümesiyle birebir eşleşmezse CONFLICT', async () => {
    db.autoReplyRule.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await expect(reorderReplyRules(actor, ['a'])).rejects.toBeInstanceOf(ApiError);
    await expect(reorderReplyRules(actor, ['a', 'x'])).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(reorderReplyRules(actor, ['a', 'a'])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('önizleme motorla aynı eşleştiriciyi kullanır ve kiracıya kapsar', async () => {
    db.feedback.findMany.mockResolvedValue([
      { id: 'f1', rating: 2, sentiment: null, text: 'PARAMI İADE edin', createdAt: new Date(), isToxic: false, trustFlagged: false, dealerReply: null, dealerRepliedAt: null },
      { id: 'f2', rating: 4, sentiment: null, text: 'güzeldi', createdAt: new Date(), isToxic: false, trustFlagged: false, dealerReply: null, dealerRepliedAt: null },
      { id: 'f3', rating: 1, sentiment: null, text: 'iade istiyorum', createdAt: new Date(), isToxic: true, trustFlagged: false, dealerReply: 'x', dealerRepliedAt: new Date() },
    ]);
    const r = await previewReplyCondition('d1', { field: 'text', op: 'contains', keywords: ['iade'], wholeWord: false });
    expect(r.matched).toBe(2);
    expect(r.alreadyReplied).toBe(1);
    expect(r.unsafe).toBe(1);
    expect(r.samples[0]?.href).toBe('/dealer/inbox?id=qr-f1');
    expect(db.feedback.findMany.mock.calls[0][0].where.qrCode).toEqual({ dealerId: 'd1' });
  });
});

describe('telafi ayarı', () => {
  it('ondalık/aralık dışı eski kayıtlar tam sayıya kırpılır (bulgu 2/6)', () => {
    const c = parseRemedyAutomationConfig({ enabled: true, minRating: 5, maxPerRun: 2.5, maxMonthlyAuto: 9999, messageTemplate: 'kısa' });
    expect(c.minRating).toBe(3);
    expect(c.maxPerRun).toBe(2);
    expect(c.maxMonthlyAuto).toBe(500);
    expect(c.messageTemplate.length).toBeGreaterThanOrEqual(10);
    expect(c.churnThreshold).toBe(0.7);
  });

  it('tetik: düşük puan ya da (açıksa) yüksek risk', () => {
    const c = parseRemedyAutomationConfig({ minRating: 2, churnEnabled: true, churnThreshold: 0.8 });
    expect(remedyTrigger(c, 2, null)).toBe('low_rating');
    expect(remedyTrigger(c, 4, 0.85)).toBe('high_churn');
    expect(remedyTrigger(c, 4, 0.75)).toBeNull();
    expect(remedyTrigger({ ...c, churnEnabled: false }, 4, 0.99)).toBeNull();
  });

  it('ay başı İstanbul saatiyle', () => {
    // 1 Kasım 00:30 İstanbul = 31 Ekim 21:30 UTC → ay başı 1 Kasım 00:00 İstanbul.
    expect(istanbulMonthStart(new Date('2026-10-31T21:30:00Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(istanbulMonthStart(new Date('2026-10-15T10:00:00Z')).toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('mesaj değişkenleri', () => {
    expect(renderRemedyMessage('Merhaba {{musteri}}, {{isletme}} olarak üzgünüz.', { musteri: 'Can Öz', isletme: 'Kafe' })).toBe('Merhaba Can, Kafe olarak üzgünüz.');
  });
});

describe('geriye dönük tarama', () => {
  it('kapalıyken 409 AUTOMATION_DISABLED', async () => {
    db.user.findUnique.mockResolvedValue({ dealerRemedyAutomation: { enabled: false } });
    await expect(scanRemedy(actor, true)).rejects.toMatchObject({ code: 'AUTOMATION_DISABLED', status: 409 });
  });

  it('kuru çalıştırma sınıflar ve hiçbir şey yazmaz', async () => {
    db.user.findUnique.mockResolvedValue({ dealerRemedyAutomation: { enabled: true, minRating: 2, maxPerRun: 2, maxMonthlyAuto: 10, cooldownDays: 30 } });
    db.feedback.findMany.mockResolvedValue([
      { id: 'f1', userId: null, rating: 1, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 0 } },
      { id: 'f2', userId: 'u1', rating: 1, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 1 } },
      { id: 'f3', userId: 'u2', rating: 2, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 0 } },
      { id: 'f4', userId: 'u3', rating: 1, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 0 } },
      { id: 'f5', userId: 'u3', rating: 2, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 0 } },
      { id: 'f6', userId: 'u4', rating: 2, churnRisk: null, qrCodeId: 'q', _count: { remedyOffers: 0 } },
    ]);
    db.remedyOffer.findMany.mockResolvedValue([{ userId: 'u2' }]);
    db.analyticsEvent.count.mockResolvedValue(9);
    const r = await scanRemedy(actor, true);
    expect(r).toMatchObject({ dryRun: true, found: 6, anonymous: 1, alreadyOffered: 1, cooldown: 2, eligible: 2, capRemaining: 1, queued: 1 });
    expect(db.remedyOffer.create).not.toHaveBeenCalled();
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });

  it('aday sorgusu çekirdek tetiğiyle aynı (puan YA DA açıksa kayıp riski) ve güven işaretlileri dışlar', async () => {
    db.user.findUnique.mockResolvedValue({
      dealerRemedyAutomation: { enabled: true, minRating: 2, churnEnabled: true, churnThreshold: 0.8, maxPerRun: 2, maxMonthlyAuto: 10, cooldownDays: 0 },
    });
    db.feedback.findMany.mockResolvedValue([]);
    db.analyticsEvent.count.mockResolvedValue(0);
    await scanRemedy(actor, true);
    const where = db.feedback.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ deletedAt: null, trustFlagged: false, qrCode: { dealerId: 'd1' } });
    expect(where.OR).toEqual([{ rating: { lte: 2 } }, { churnRisk: { gte: 0.8 } }]);
    expect(where.rating).toBeUndefined();
  });

  it('çekirdek: güven işaretli yorum (personel/sahip/şüpheli) için taslak üretilmez', async () => {
    const config = parseRemedyAutomationConfig({ enabled: true, minRating: 2 });
    db.feedback.findUnique.mockResolvedValue({ trustFlagged: true });
    const r = await maybeCreateAutoRemedyForFeedback({ feedbackId: 'f1', dealerId: 'd1', userId: 'u1', rating: 1, config });
    expect(r).toEqual({ created: false, reason: 'not_eligible' });
    expect(db.feedback.findUnique).toHaveBeenCalledWith({ where: { id: 'f1' }, select: { trustFlagged: true } });
    expect(db.remedyOffer.create).not.toHaveBeenCalled();
    expect(db.analyticsEvent.count).not.toHaveBeenCalled();
  });

  it('kayıp riski tetiği kapalıysa yalnız puan eşiği aranır', async () => {
    db.user.findUnique.mockResolvedValue({ dealerRemedyAutomation: { enabled: true, minRating: 1, churnEnabled: false } });
    db.feedback.findMany.mockResolvedValue([]);
    db.analyticsEvent.count.mockResolvedValue(0);
    await scanRemedy(actor, true);
    expect(db.feedback.findMany.mock.calls[0][0].where.OR).toEqual([{ rating: { lte: 1 } }]);
  });
});

describe('teklif kataloğu', () => {
  it('değerler türe göre doğrulanır, tekilleşir, sıralanır', () => {
    expect(cleanTemplateValues('discount', [20, 10, 10])).toEqual([10, 20]);
    expect(() => cleanTemplateValues('discount', [150])).toThrow(ApiError);
    expect(() => cleanTemplateValues('free_item', [1.5])).toThrow(/tam sayı/);
    expect(() => cleanTemplateValues('points', [])).toThrow(/En az bir/);
  });

  it('kapsam + tür başına tek şablon (409 DUPLICATE_TEMPLATE)', async () => {
    db.remedyTemplate.findFirst.mockResolvedValueOnce({ id: 'old' });
    await expect(createRemedyTemplate(actor, { locationId: null, type: 'discount', values: [10], isActive: true })).rejects.toMatchObject({
      code: 'DUPLICATE_TEMPLATE',
      status: 409,
    });
  });

  it('başka bayinin şubesine şablon eklenemez', async () => {
    db.dealerLocation.findFirst.mockResolvedValue(null);
    await expect(createRemedyTemplate(actor, { locationId: 'loc-x', type: 'points', values: [50], isActive: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.dealerLocation.findFirst.mock.calls[0][0].where).toEqual({ id: 'loc-x', dealerId: 'd1' });
  });

  it('etkin set: şube > işletme > sistem (birleşmez)', () => {
    const t = (id: string, locationId: string | null, type: string, values: number[], isActive = true) => ({
      id,
      locationId,
      type,
      label: type,
      unit: 'x',
      values,
      isActive,
      order: 0,
      createdAt: new Date(0),
    });
    const rows = [t('1', null, 'discount', [10]), t('2', 'L1', 'points', [50]), t('3', 'L2', 'points', [100], false)];
    expect(effectiveFor(rows, 'L1')).toMatchObject({ source: 'location', options: [{ type: 'points', values: [50] }] });
    expect(effectiveFor(rows, 'L2')).toMatchObject({ source: 'dealer', options: [{ type: 'discount', values: [10] }] });
    expect(effectiveFor([], null).source).toBe('system');
  });
});
