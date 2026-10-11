/**
 * AI Kalite (/admin/ai/quality) sunucu mantığı.
 *  - PII maskesi, katmanlı örnekleme, alan kararlarından skor, sohbet sonucu türetme (saf).
 *  - Karar: iyimser kilit 409, skor sunucuda türetilir, denetim kaydı yazılır.
 *  - Örnekleme: LLM dışı analiz + demo bayi + silinmiş yorum havuz dışı; denetim kaydı.
 *  - Sohbet: detay okuması denetime düşer, maskeli döner; reveal ham metin + gerekçe kaydı; CSV maskeli.
 * Prisma mock'lanır; gerçek DB'ye gidilmez.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn(),
  MAX_QRA_CHAT_PER_MINUTE: { admin: 120, dealer_staff: 80, customer: 12, anonymous: 8 },
}));
jest.mock('@/lib/groq', () => ({
  QRA_MESSAGES: {
    unavailable: '🔧 AI asistanı şu anda bakımda. Lütfen daha sonra tekrar deneyin.',
    blocked: 'Bu mesaj güvenlik nedeniyle işlenemiyor. Lütfen farklı bir soru deneyin.',
    error: '❌ Bir hata oluştu. Lütfen tekrar deneyin.',
  },
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { maskPii, previewText, PII_TOKENS } from '@/lib/ai-quality/pii-mask';
import { stratifiedSample } from '@/lib/ai-quality/sampler';
import {
  chatQsFromUrl,
  sampleActionSchema,
  sampleListQuerySchema,
  sampleQsFromUrl,
  scoreFromVerdicts,
} from '@/lib/ai-quality/contract';
import { AUDIT, applySampleAction, buildSampleWhere, runSampling } from '@/lib/ai-quality/quality.server';
import { CHAT_AUDIT, buildChatWhere, classifyChatOutcome, csvCell, exportChatsCsv, getChatDetail, revealChat } from '@/lib/ai-quality/chats.server';
import { istanbulWeekStart, lastWeekStarts } from '@/lib/ai-quality/time';

const actor = { id: 'admin-1', email: 'a@x.com', role: 'ADMIN', name: 'Ayşe', type: 'user' as const };

beforeEach(() => resetDb());

describe('maskPii', () => {
  it('e-posta, telefon, IBAN, kart ve TC kimlik maskelenir; sıradan sayılar kalır', () => {
    const t = maskPii('Ben Ayşe, ayse.yilmaz@mail.com, 0532 123 45 67, TR33 0006 1005 1978 6457 8413 26, kart 4111 1111 1111 1111, TC 12345678901, masa 12, 3 kişi');
    expect(t).toContain(PII_TOKENS.email);
    expect(t).toContain(PII_TOKENS.phone);
    expect(t).toContain(PII_TOKENS.iban);
    expect(t).toContain(PII_TOKENS.card);
    expect(t).toContain(PII_TOKENS.tckn);
    expect(t).not.toMatch(/ayse\.yilmaz|0532|4111|12345678901/);
    expect(t).toContain('masa 12, 3 kişi');
  });
  it('+90 biçimli telefon da maskelenir', () => {
    expect(maskPii('ara +90 (532) 123-45-67')).toContain(PII_TOKENS.phone);
  });
  it('önizleme markdown işaretlerini sadeleştirir ve kısaltır', () => {
    const p = previewText('**Merhaba** [link](https://x.y) ' + 'a'.repeat(300), 50);
    expect(p.startsWith('Merhaba link')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(50);
    expect(p.endsWith('…')).toBe(true);
  });
});

describe('stratifiedSample', () => {
  const seq = () => {
    let i = 0;
    return () => ((i = (i * 9301 + 49297) % 233280) / 233280);
  };
  it('nadir katman da temsil edilir ve boyut aşılmaz', () => {
    const cands = [
      ...Array.from({ length: 95 }, (_, i) => ({ id: `p${i}`, sentiment: 'positive', intent: 'praise' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, sentiment: 'negative', intent: 'complaint' })),
    ];
    const { ids, strata } = stratifiedSample(cands, 10, seq());
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(strata).toBe(2);
    expect(ids.some((x) => x.startsWith('c'))).toBe(true);
  });
  it('aday sayısı boyuttan azsa hepsi döner', () => {
    expect(stratifiedSample([{ id: 'a', sentiment: null, intent: null }], 5, seq()).ids).toEqual(['a']);
  });
  it('katman sayısı boyuttan fazlaysa yine tam boyut', () => {
    const cands = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, sentiment: `s${i % 10}`, intent: `i${i % 3}` }));
    expect(stratifiedSample(cands, 4, seq()).ids).toHaveLength(4);
  });
});

describe('scoreFromVerdicts', () => {
  it('doğru=1, kısmen=0,5, yanlış=0; değerlendirilemez paydaya girmez', () => {
    expect(scoreFromVerdicts({ sentiment: 'correct', intent: 'partial', themes: 'wrong', urgency: 'na', action: 'na' })).toBe(50);
    expect(scoreFromVerdicts({ sentiment: 'na', intent: 'na', themes: 'na', urgency: 'na', action: 'na' })).toBeNull();
  });
});

describe('sorgu şemaları', () => {
  it('geçersiz sayfa/boyut 500 yerine varsayılana düşer', () => {
    const q = sampleListQuerySchema.parse({ page: 'abc', size: '9999', status: 'xyz' });
    expect(q).toMatchObject({ page: 1, status: 'pending' });
    expect(q.size).toBe(20);
  });
  it('istemci ve sunucu aynı sorgu dizesini üretir', () => {
    const url = new URLSearchParams('status=reviewed&q=a&model=m1&page=2');
    expect(sampleQsFromUrl((k) => url.get(k))).toBe('status=reviewed&model=m1&page=2');
    const curl = new URLSearchParams('cq=hata&period=30d&slow=1&cpage=3');
    expect(chatQsFromUrl((k) => curl.get(k))).toBe('q=hata&period=30d&slow=1&page=3');
  });
  it('bekleyen görünümünde silinmiş yorum dışlanır, geçersiz görünümünde dışlanmaz', () => {
    expect(buildSampleWhere(sampleListQuerySchema.parse({}))).toMatchObject({ status: 'pending', feedback: { deletedAt: null } });
    expect((buildSampleWhere(sampleListQuerySchema.parse({ status: 'void' })).feedback as Record<string, unknown>).deletedAt).toBeUndefined();
  });
});

describe('applySampleAction', () => {
  const verdicts = { sentiment: 'correct', intent: 'wrong', themes: 'partial', urgency: 'correct', action: 'na' } as const;
  const reviewInput = sampleActionSchema.parse({
    action: 'review',
    verdicts,
    corrections: { intent: 'complaint', sentiment: 'yok sayılmalı' },
    notes: '  ironi kaçmış ',
    expectedStatus: 'pending',
    expectedReviewedAt: null,
  });

  function primeDetail() {
    db.aIQualitySample.findUnique
      .mockResolvedValueOnce({ id: 's1', status: 'pending', reviewedAt: null, accuracyScore: null, notes: '[bootstrap-demo]', feedback: { deletedAt: null } })
      .mockResolvedValueOnce({
        id: 's1',
        status: 'reviewed',
        createdAt: new Date('2026-10-05T10:00:00Z'),
        reviewedAt: new Date('2026-10-06T10:00:00Z'),
        reviewerId: 'admin-1',
        accuracyScore: 62.5,
        notes: 'ironi kaçmış',
        feedback: {
          id: 'f1', text: 'Garson kaba, beni 0532 123 45 67 arayın', rating: 2, sentiment: 'negative', intent: 'praise',
          aiModelUsed: 'openai/gpt-oss-120b', aiVersion: 'v3', createdAt: new Date(), deletedAt: null,
          qrCode: { name: 'Masa 3', dealer: { name: 'Kafe', isDemo: false } },
          intentScore: 0.4, urgency: 0.7, churnRisk: 0.5, effortScore: null, topics: ['servis'], themes: [], actionSuggestions: [], emotions: [], aiAnalysis: null, aiProcessedAt: new Date(),
        },
      });
    db.auditLog.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([{ id: 'admin-1', name: 'Ayşe', email: 'a@x.com' }]);
  }

  it('skor sunucuda kararlardan türetilir; doğru alanın düzeltmesi atılır; denetim kaydı yazılır', async () => {
    primeDetail();
    db.aIQualitySample.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.create.mockResolvedValue({});
    const d = await applySampleAction('s1', reviewInput, actor);
    const upd = db.aIQualitySample.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 's1', status: 'pending', reviewedAt: null });
    expect(upd.data).toMatchObject({ status: 'reviewed', accuracyScore: 62.5, notes: 'ironi kaçmış', reviewerId: 'admin-1' });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe(AUDIT.review);
    expect(audit.newData.corrections).toEqual({ intent: 'complaint' });
    expect(audit.oldData.notes).toBeNull(); // iç demo işareti sızmaz
    expect(d.feedbackDetail.text).not.toContain('0532');
  });

  it('başkası önce güncellediyse 409', async () => {
    db.aIQualitySample.findUnique.mockResolvedValueOnce({ id: 's1', status: 'pending', reviewedAt: null, accuracyScore: null, notes: null, feedback: { deletedAt: null } });
    db.aIQualitySample.updateMany.mockResolvedValue({ count: 0 });
    await expect(applySampleAction('s1', reviewInput, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('silinmiş yorum değerlendirilemez', async () => {
    db.aIQualitySample.findUnique.mockResolvedValueOnce({ id: 's1', status: 'pending', reviewedAt: null, accuracyScore: null, notes: null, feedback: { deletedAt: new Date() } });
    await expect(applySampleAction('s1', reviewInput, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('tüm alanlar değerlendirilemez ise doğrulama hatası', async () => {
    db.aIQualitySample.findUnique.mockResolvedValueOnce({ id: 's1', status: 'pending', reviewedAt: null, accuracyScore: null, notes: null, feedback: { deletedAt: null } });
    const input = sampleActionSchema.parse({
      action: 'review',
      verdicts: { sentiment: 'na', intent: 'na', themes: 'na', urgency: 'na', action: 'na' },
      expectedStatus: 'pending',
      expectedReviewedAt: null,
    });
    await expect(applySampleAction('s1', input, actor)).rejects.toMatchObject({ status: 400 });
  });

  it('geçersiz sayma gerekçe ister (şema)', () => {
    expect(sampleActionSchema.safeParse({ action: 'void', reason: '', expectedStatus: 'pending', expectedReviewedAt: null }).success).toBe(false);
  });
});

describe('runSampling', () => {
  it('LLM dışı, demo ve örneklenmiş yorumları dışlar; silinmiş yoruma ait bekleyenleri geçersiz sayar', async () => {
    db.aIQualitySample.updateMany.mockResolvedValue({ count: 2 });
    db.feedback.findMany.mockResolvedValue([
      { id: 'f1', sentiment: 'positive', intent: 'praise' },
      { id: 'f2', sentiment: 'negative', intent: 'complaint' },
    ]);
    db.aIQualitySample.createMany.mockResolvedValue({ count: 2 });
    db.auditLog.create.mockResolvedValue({});
    const r = await runSampling({ size: 50, days: 7 }, { id: null, type: 'cron' }, { rng: () => 0.5, now: new Date('2026-10-11T00:00:00Z') });
    expect(r).toEqual({ candidates: 2, created: 2, voided: 2, strata: 2 });
    const where = db.feedback.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ deletedAt: null, aiProcessedAt: { not: null }, qrCode: { dealer: { isDemo: false } }, aiQualitySamples: { none: {} } });
    expect(where.OR[1].aiModelUsed.notIn).toEqual(expect.arrayContaining(['bootstrap-heuristic', 'local-fallback']));
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: AUDIT.run, actorType: 'cron' });
  });
});

describe('QRA sohbet denetimi', () => {
  it('sonuç yanıt metninden türetilir', () => {
    expect(classifyChatOutcome('Bu mesaj güvenlik nedeniyle işlenemiyor. Lütfen farklı bir soru deneyin.')).toBe('blocked');
    expect(classifyChatOutcome('🔧 AI asistanı şu anda bakımda. Lütfen daha sonra tekrar deneyin.')).toBe('maintenance');
    expect(classifyChatOutcome('Yanıt oluşturulamadı.')).toBe('error');
    expect(classifyChatOutcome('Merhaba!')).toBe('ok');
  });

  it('filtreler where koşuluna çevrilir', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    const w = buildChatWhere({ q: 'fiyat', role: 'ANON', outcome: 'blocked', slow: false, period: '24h', user: undefined, fp: undefined, page: 1, size: 25 }, now);
    const and = w.AND as Record<string, unknown>[];
    expect(and[0]).toEqual({ createdAt: { gte: new Date('2026-10-10T12:00:00Z') } });
    expect(and).toContainEqual({ userRoleSnapshot: 'ANON' });
    expect(and).toContainEqual({ assistantMessage: { in: ['Bu mesaj güvenlik nedeniyle işlenemiyor. Lütfen farklı bir soru deneyin.'] } });
  });

  const row = {
    id: 'c1',
    userId: 'u1',
    ipFingerprint: null,
    userRoleSnapshot: 'CUSTOMER',
    userMessage: 'mailim ali@x.com',
    assistantMessage: 'Tamam',
    model: 'openai/gpt-oss-120b',
    latencyMs: 900,
    createdAt: new Date('2026-10-10T10:00:00Z'),
    user: { id: 'u1', email: 'ali@x.com', name: 'Ali', role: 'DEALER' },
  };

  it('detay maskeli döner ve okuma denetime yazılır', async () => {
    db.qraChatLog.findUnique.mockResolvedValue(row);
    db.qraChatLog.findMany.mockResolvedValue([row]);
    db.auditLog.create.mockResolvedValue({});
    const d = await getChatDetail('c1', actor);
    expect(d.userMessage).toBe(`mailim ${PII_TOKENS.email}`);
    expect(d.actor.email).not.toBe('ali@x.com');
    expect(d.actor.currentRole).toBe('DEALER');
    expect(d.roleSnapshot).toBe('CUSTOMER');
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: CHAT_AUDIT.view, entity: 'QraChatLog', entityId: 'c1' });
  });

  it('maskesiz görünüm gerekçeyle denetime yazılır', async () => {
    db.qraChatLog.findUnique.mockResolvedValue(row);
    db.auditLog.create.mockResolvedValue({});
    const r = await revealChat('c1', 'kötüye kullanım incelemesi', actor);
    expect(r.userMessage).toBe('mailim ali@x.com');
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: CHAT_AUDIT.reveal, newData: { reason: 'kötüye kullanım incelemesi' } });
  });

  it('bulunamayan kayıt 404', async () => {
    db.qraChatLog.findUnique.mockResolvedValue(null);
    await expect(getChatDetail('yok', actor)).rejects.toMatchObject({ status: 404 });
  });

  it('CSV maskeli, BOM\'lu, formül enjeksiyonuna kapalı ve denetimli', async () => {
    db.qraChatLog.findMany.mockResolvedValue([{ ...row, userMessage: '=HYPERLINK("x") ali@x.com' }]);
    db.auditLog.create.mockResolvedValue({});
    const { csv, count } = await exportChatsCsv({ q: undefined, role: undefined, outcome: undefined, slow: false, period: '7d', user: undefined, fp: undefined, page: 1, size: 25 }, actor);
    expect(count).toBe(1);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).not.toContain('ali@x.com');
    expect(csv).toContain(`"'=HYPERLINK(""x"") ${PII_TOKENS.email}"`);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe(CHAT_AUDIT.export);
    expect(csvCell('a;b')).toBe('"a;b"');
  });
});

describe('İstanbul haftası', () => {
  it('Pazar gecesi 23:30 (UTC 20:30) aynı haftanın Pazartesi’sine düşer; Pazartesi 00:30 yeni haftadır', () => {
    expect(istanbulWeekStart(new Date('2026-10-11T20:30:00Z'))).toBe('2026-10-05');
    expect(istanbulWeekStart(new Date('2026-10-11T21:30:00Z'))).toBe('2026-10-12');
    expect(lastWeekStarts(new Date('2026-10-11T12:00:00Z'), 3)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
  });
});
