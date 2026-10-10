/**
 * Bayi Gelen Kutusu (/dealer/inbox) — saf çekirdek + sunucu servisi.
 *
 *  - Anahtar/filtre/eski derin link normalizasyonu; QR'a özgü filtre tüketim kaynağını eler.
 *  - Tek duygu tanımı (AI > puan eşiği; metinli+analizsiz → "bekliyor", nötrle karışmaz).
 *  - SLA durumları; vaka dizini (açık vaka kapanmışı ezer) ve liste kümeleri.
 *  - İki kaynaklı imleç: yeni→eski ve eski→yeni sayfalamada kayıpsız/tekrarsız.
 *  - CSV formül enjeksiyonu korunur; şablon değişkenleri; bilinmeyen boyut gizlenir.
 *  - Liste her sorguda bayi kapsamlı; e-posta/ham müşteri kimliği taşımaz; "Yeni" çözülmüşleri dışlar.
 *  - Yanıt: ilk yanıtta tek bildirim, düzenleme sessiz; otomatik yanıt araya girerse 409 (ezme yok).
 *  - İşlemler: kapatma açık vakaları kapatır ya da kilitli tek vaka açar; atama yalnız geçerli kişiye.
 *  - AI taslağı: yapılandırılmamış/kapalıysa dürüst "kullanılamıyor"; metinsiz yorumda bağlam uydurmaz.
 *  - Özet: yorum yokken ortalama null (sıfır değil), dönem karşılaştırması.
 */
const mockFeedbackFindMany = jest.fn();
const mockFeedbackFindFirst = jest.fn();
const mockFeedbackUpdateMany = jest.fn();
const mockFeedbackAggregate = jest.fn();
const mockFeedbackCount = jest.fn();
const mockFeedbackGroupBy = jest.fn();
const mockReviewFindMany = jest.fn();
const mockReviewFindFirst = jest.fn();
const mockReviewUpdateMany = jest.fn();
const mockReviewAggregate = jest.fn();
const mockReviewCount = jest.fn();
const mockReviewGroupBy = jest.fn();
const mockIncidentFindMany = jest.fn();
const mockIncidentUpdateMany = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockNotificationCreate = jest.fn();
const mockTxIncidentFindFirst = jest.fn();
const mockTxIncidentCreate = jest.fn();
const mockTxIncidentUpdate = jest.fn();
const mockTxExecuteRaw = jest.fn(async () => 1);
const mockValidateAssignee = jest.fn();
const mockSuggest = jest.fn();
const mockAiConfigured = jest.fn(() => true);
const mockDealerAi = jest.fn(async () => true);
const mockEmail = jest.fn(async () => undefined);
const mockRedisGet = jest.fn(async () => null);
const mockRedisSet = jest.fn(async () => undefined);

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => unknown) =>
      fn({
        $executeRaw: (...a: unknown[]) => (mockTxExecuteRaw as (...x: unknown[]) => unknown)(...a),
        incident: {
          findFirst: (...a: unknown[]) => mockTxIncidentFindFirst(...a),
          create: (...a: unknown[]) => mockTxIncidentCreate(...a),
          update: (...a: unknown[]) => mockTxIncidentUpdate(...a),
        },
      }),
    feedback: {
      findMany: (...a: unknown[]) => mockFeedbackFindMany(...a),
      findFirst: (...a: unknown[]) => mockFeedbackFindFirst(...a),
      updateMany: (...a: unknown[]) => mockFeedbackUpdateMany(...a),
      aggregate: (...a: unknown[]) => mockFeedbackAggregate(...a),
      count: (...a: unknown[]) => mockFeedbackCount(...a),
      groupBy: (...a: unknown[]) => mockFeedbackGroupBy(...a),
    },
    consumptionReview: {
      findMany: (...a: unknown[]) => mockReviewFindMany(...a),
      findFirst: (...a: unknown[]) => mockReviewFindFirst(...a),
      updateMany: (...a: unknown[]) => mockReviewUpdateMany(...a),
      aggregate: (...a: unknown[]) => mockReviewAggregate(...a),
      count: (...a: unknown[]) => mockReviewCount(...a),
      groupBy: (...a: unknown[]) => mockReviewGroupBy(...a),
    },
    incident: {
      findMany: (...a: unknown[]) => mockIncidentFindMany(...a),
      updateMany: (...a: unknown[]) => mockIncidentUpdateMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
    },
    notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
  },
}));
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...a: unknown[]) => (mockRedisGet as (...x: unknown[]) => unknown)(...a),
  redisSetJson: (...a: unknown[]) => (mockRedisSet as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('@/lib/dealer/assignee', () => ({
  validateAssignee: (...a: unknown[]) => mockValidateAssignee(...a),
}));
jest.mock('@/lib/remedy-offer-service', () => ({
  REMEDY_BLOCKING_STATUSES: ['pending', 'awaiting_dealer_approval', 'accepted'],
  describeRemedyOffer: () => ({ options: [], selection: null, selectionLabel: null }),
}));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: async () => ({}) }));
jest.mock('@/lib/ai-engine', () => ({ isAIConfigured: () => mockAiConfigured() }));
jest.mock('@/lib/ai-policy', () => ({ isDealerAiEnabled: (...a: unknown[]) => (mockDealerAi as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/lib/groq', () => ({ suggestResponseWithGroq: (...a: unknown[]) => mockSuggest(...a) }));
jest.mock('@/lib/notify-email', () => ({ emailDealerReply: (...a: unknown[]) => (mockEmail as (...x: unknown[]) => unknown)(...a) }));

import {
  buildCaseIndex,
  caseSets,
  computeSla,
  csvCell,
  decodeInboxCursor,
  encodeInboxCursor,
  fillReplyTemplate,
  inboxCursorWhere,
  inboxKey,
  legacyInboxParams,
  mergeInboxPages,
  normalizeDimensions,
  normalizeInboxFilters,
  normalizeMedia,
  parseInboxKey,
  sourcesFor,
  toCsv,
  unifiedSentiment,
} from '@/lib/dealer-inbox/core';
import {
  applyInboxAction,
  getInboxSummary,
  listInbox,
  replyToInboxItem,
  suggestInboxReplies,
  InboxError,
} from '@/lib/dealer-inbox/server';

const DEALER = 'dealer_1';
const NOW = new Date('2026-10-10T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockIncidentFindMany.mockResolvedValue([]);
  mockUserFindMany.mockResolvedValue([]);
  mockFeedbackFindMany.mockResolvedValue([]);
  mockReviewFindMany.mockResolvedValue([]);
  mockAiConfigured.mockReturnValue(true);
  mockDealerAi.mockResolvedValue(true);
});

/* ───────────────────────── Çekirdek ───────────────────────── */

describe('anahtar ve filtreler', () => {
  it('anahtar gidiş-dönüş; geçersiz anahtar reddedilir', () => {
    expect(inboxKey('qr', 'abc')).toBe('qr-abc');
    expect(inboxKey('consumption', 'x1')).toBe('cr-x1');
    expect(parseInboxKey('cr-x1')).toEqual({ source: 'consumption', id: 'x1' });
    expect(parseInboxKey('zz-1')).toBeNull();
    expect(parseInboxKey('qr-a b')).toBeNull();
    expect(parseInboxKey(42)).toBeNull();
  });

  it('varsayılan görünüm "Yeni"; QR kodu filtresi kaynağı QR yapar; bilinmeyen değerler düşer', () => {
    expect(normalizeInboxFilters({})).toMatchObject({ status: 'new', source: 'all', sort: 'newest', range: 'all' });
    expect(normalizeInboxFilters({ qr: 'qr_1', source: 'consumption' }).source).toBe('qr');
    expect(normalizeInboxFilters({ status: 'hack', rating: '9', q: '  çok   soğuk  ' })).toMatchObject({
      status: 'new',
      rating: 'all',
      q: 'çok soğuk',
    });
  });

  it('QR’a özgü sinyal filtresi tüketim kaynağını sorgulamaz', () => {
    expect(sourcesFor({ source: 'all', signal: 'urgent', qr: null })).toEqual({ qr: true, consumption: false });
    expect(sourcesFor({ source: 'all', signal: 'churn', qr: null })).toEqual({ qr: true, consumption: true });
    expect(sourcesFor({ source: 'consumption', signal: 'all', qr: null })).toEqual({ qr: false, consumption: true });
  });

  it('eski derin linkler (tab, search) yeni sorguya çevrilir, diğerleri korunur', () => {
    const sp = legacyInboxParams({ tab: 'qr', search: 'kahve', rating: '2', id: 'qr-1' });
    expect(sp.get('source')).toBe('qr');
    expect(sp.get('q')).toBe('kahve');
    expect(sp.get('rating')).toBe('2');
    expect(sp.get('id')).toBe('qr-1');
    expect(sp.get('tab')).toBeNull();
  });
});

describe('duygu, SLA', () => {
  it('AI duygusu > puan eşiği; metinli ve analizsiz kayıt "bekliyor" (nötr değil)', () => {
    expect(unifiedSentiment({ sentiment: 'negative', rating: 5, hasText: true, analyzed: true })).toEqual({ sentiment: 'negative', basis: 'ai' });
    expect(unifiedSentiment({ sentiment: null, rating: 3, hasText: true, analyzed: false })).toEqual({ sentiment: 'pending', basis: 'pending' });
    expect(unifiedSentiment({ sentiment: null, rating: 1, hasText: false, analyzed: false })).toEqual({ sentiment: 'negative', basis: 'rating' });
    expect(unifiedSentiment({ sentiment: null, rating: 4, hasText: true, analyzed: true })).toEqual({ sentiment: 'positive', basis: 'rating' });
  });

  it('SLA: olumsuz 24 sa, diğer 72 sa; yanıt/kapanış "done"', () => {
    const created = new Date('2026-10-09T12:00:00.000Z');
    expect(computeSla({ createdAt: created, negative: true, closed: false, now: NOW }).state).toBe('overdue');
    expect(computeSla({ createdAt: created, negative: false, closed: false, now: NOW }).state).toBe('ok');
    expect(computeSla({ createdAt: new Date('2026-10-09T15:00:00.000Z'), negative: true, closed: false, now: NOW }).state).toBe('due_soon');
    expect(computeSla({ createdAt: created, negative: true, closed: true, now: NOW })).toMatchObject({ state: 'done', targetHours: 24 });
  });
});

describe('vaka dizini', () => {
  const row = (id: string, status: string, meta: Record<string, string>, assignedToId: string | null = null) => ({
    id,
    status,
    assignedToId,
    resolvedAt: status === 'resolved' ? new Date() : null,
    createdAt: new Date(),
    metadata: meta,
  });

  it('açık vaka, daha yeni kapanmış vakayı ezer; atama açık vakadan okunur', () => {
    const index = buildCaseIndex([
      row('i3', 'resolved', { feedbackId: 'f1' }),
      row('i2', 'assigned', { feedbackId: 'f1' }, 'staff_1'),
      row('i1', 'resolved', { consumptionReviewId: 'c1' }),
      row('i0', 'open', { other: 'x' }),
    ]);
    expect(index.get('qr-f1')).toMatchObject({ status: 'assigned', assignedToId: 'staff_1', openIds: ['i2'], lastResolvedId: 'i3' });
    expect(index.get('cr-c1')).toMatchObject({ status: 'resolved', openIds: [] });
    expect(index.size).toBe(2);
    const sets = caseSets(index, 'staff_1');
    expect(sets.resolved.consumption).toEqual(['c1']);
    expect(sets.assignedToMe.qr).toEqual(['f1']);
  });
});

describe('imleç', () => {
  type Row = { key: string; createdAt: string };
  const t = (m: number) => new Date(Date.UTC(2026, 9, 1, 0, m)).toISOString();
  const qr: Row[] = [
    { key: 'qr-b', createdAt: t(5) },
    { key: 'qr-a', createdAt: t(3) },
    { key: 'qr-c', createdAt: t(3) },
    { key: 'qr-d', createdAt: t(1) },
  ];
  const cr: Row[] = [
    { key: 'cr-x', createdAt: t(4) },
    { key: 'cr-y', createdAt: t(3) },
    { key: 'cr-z', createdAt: t(0) },
  ];

  // Prisma koşulunu bellek içi tabloya uygular (createdAt + id karşılaştırması).
  function applyWhere(rows: Row[], where: Record<string, unknown> | null): Row[] {
    if (!where) return rows;
    const test = (r: Row, w: Record<string, unknown>): boolean => {
      if (Array.isArray(w.OR)) return (w.OR as Record<string, unknown>[]).some((x) => test(r, x));
      if (Array.isArray(w.AND)) return (w.AND as Record<string, unknown>[]).every((x) => test(r, x));
      let pass = true;
      if (w.createdAt !== undefined) {
        const c = w.createdAt as Record<string, Date> | Date;
        const v = new Date(r.createdAt).getTime();
        if (c instanceof Date) pass = pass && v === c.getTime();
        else {
          if (c.lt) pass = pass && v < c.lt.getTime();
          if (c.lte) pass = pass && v <= c.lte.getTime();
          if (c.gt) pass = pass && v > c.gt.getTime();
          if (c.gte) pass = pass && v >= c.gte.getTime();
        }
      }
      if (w.id !== undefined) {
        const id = r.key.slice(3);
        const c = w.id as Record<string, string>;
        if (c.lt) pass = pass && id < c.lt;
        if (c.gt) pass = pass && id > c.gt;
      }
      return pass;
    };
    return rows.filter((r) => test(r, where));
  }

  for (const sort of ['newest', 'oldest'] as const) {
    it(`${sort}: iki kaynaktan sayfa sayfa kayıpsız ve tekrarsız`, () => {
      const order = (rows: Row[]) =>
        [...rows].sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          if (ta !== tb) return sort === 'newest' ? tb - ta : ta - tb;
          return sort === 'newest' ? (a.key < b.key ? 1 : -1) : a.key < b.key ? -1 : 1;
        });
      const seen: string[] = [];
      let cursorRaw: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const cursor = decodeInboxCursor(cursorRaw);
        const limit = 2;
        const qrPage = order(applyWhere(qr, inboxCursorWhere(cursor, 'qr', sort))).slice(0, limit + 1);
        const crPage = order(applyWhere(cr, inboxCursorWhere(cursor, 'cr', sort))).slice(0, limit + 1);
        const page = mergeInboxPages(
          [
            { rows: qrPage.slice(0, limit + 1), exhausted: qrPage.length <= limit },
            { rows: crPage.slice(0, limit + 1), exhausted: crPage.length <= limit },
          ],
          limit,
          sort
        );
        seen.push(...page.items.map((i) => i.key));
        cursorRaw = page.nextCursor;
        if (!cursorRaw) break;
      }
      expect(seen).toEqual(order([...qr, ...cr]).map((r) => r.key));
    });
  }

  it('bozuk imleç yok sayılır', () => {
    expect(decodeInboxCursor('nope')).toBeNull();
    expect(decodeInboxCursor(encodeInboxCursor({ at: 'x', key: 'qr-1' }))).toBeNull();
  });
});

describe('metin yardımcıları', () => {
  it('CSV formül enjeksiyonu etkisizleşir, tırnaklar kaçar', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('@SUM')).toBe(`"'@SUM"`);
    expect(csvCell('normal')).toBe('"normal"');
    expect(toCsv(['a'], [['-2']]).startsWith('﻿"a"')).toBe(true);
  });

  it('şablon değişkenleri doldurulur; anonimde kibar karşılık; bilinmeyen değişken kalır', () => {
    expect(fillReplyTemplate('Merhaba {{isim}}, {{ürün}} için teşekkürler — {{işletme}} {{x}}', {
      customerName: 'Ayşe Yılmaz',
      product: 'Latte',
      business: 'Kahve Evi',
    })).toBe('Merhaba Ayşe, Latte için teşekkürler — Kahve Evi {{x}}');
    expect(fillReplyTemplate('Sevgili {{ad}}', { customerName: null })).toBe('Sevgili değerli misafirimiz');
  });

  it('boyutlar: bilinen anahtarlar çevrilir, bilinmeyen/aralık dışı gizlenir', () => {
    expect(normalizeDimensions({ taste: 5, cleanliness: 4, weird: 3, service: 9 })).toEqual([
      { key: 'taste', label: 'Lezzet', value: 5 },
      { key: 'cleanliness', label: 'Temizlik', value: 4 },
    ]);
  });

  it('medya: yalnız https bağlantıları', () => {
    expect(normalizeMedia(['https://cdn.x/a.jpg', 'javascript:alert(1)', { url: 'https://cdn.x/b.png' }, 'http://x/c'])).toEqual([
      'https://cdn.x/a.jpg',
      'https://cdn.x/b.png',
    ]);
  });
});

/* ───────────────────────── Sunucu ───────────────────────── */

const DEFAULT_FILTERS = normalizeInboxFilters({});

describe('listInbox', () => {
  it('bayi kapsamlı sorgular; "Yeni" çözülmüşleri dışlar; anonim adı yok; e-posta taşımaz', async () => {
    mockIncidentFindMany.mockResolvedValue([
      { id: 'i1', status: 'resolved', assignedToId: null, resolvedAt: NOW, createdAt: NOW, metadata: { feedbackId: 'f9' } },
      { id: 'i2', status: 'assigned', assignedToId: 'staff_1', resolvedAt: null, createdAt: NOW, metadata: { consumptionReviewId: 'c1' } },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: 'staff_1', name: 'Ali Veli' }]);
    mockFeedbackFindMany.mockResolvedValue([
      {
        id: 'f1', rating: 2, npsScore: null, text: 'Soğuktu', createdAt: new Date('2026-10-10T10:00:00Z'),
        dealerReply: null, dealerRepliedAt: null, dealerFirstViewedAt: null, sentiment: null, aiProcessedAt: null,
        urgency: 0.9, churnRisk: null, trustFlagged: false, isToxic: false, topics: ['servis'], media: null,
        userId: null, user: null, qrCode: { name: 'Masa 4' }, remedyOffers: [],
      },
    ]);
    mockReviewFindMany.mockResolvedValue([
      {
        id: 'c1', rating: 5, text: null, createdAt: new Date('2026-10-10T09:00:00Z'), dealerReply: null, dealerRepliedAt: null,
        sentiment: null, analyzedAt: null, churnRisk: null, customer: { name: 'Ayşe' },
        consumption: { product: { name: 'Latte' } }, remedyOffers: [{ status: 'accepted' }],
      },
    ]);

    const page = await listInbox(DEALER, DEALER, DEFAULT_FILTERS, { now: NOW });
    const fbWhere = JSON.stringify(mockFeedbackFindMany.mock.calls[0][0].where);
    expect(fbWhere).toContain(`"dealerId":"${DEALER}"`);
    expect(fbWhere).toContain('"notIn":["f9"]');
    expect(JSON.stringify(mockReviewFindMany.mock.calls[0][0].where)).toContain(`"dealerId":"${DEALER}"`);

    expect(page.items.map((i) => i.key)).toEqual(['qr-f1', 'cr-c1']);
    const [q, c] = page.items;
    expect(q).toMatchObject({ anonymous: true, customerName: null, sentiment: 'pending', urgent: true, priority: 'high', status: 'new' });
    expect(q.sla.state).toBe('ok');
    expect(c).toMatchObject({ customerName: 'Ayşe', sentiment: 'positive', sentimentBasis: 'rating', remedyStatus: 'accepted' });
    expect(c.case).toMatchObject({ status: 'assigned', assignee: { id: 'staff_1', name: 'Ali Veli' } });
    expect(JSON.stringify(page)).not.toMatch(/email|customerId|userId/);
    expect(page.nextCursor).toBeNull();
  });

  it('acil sinyal filtresinde tüketim tablosu hiç sorgulanmaz', async () => {
    await listInbox(DEALER, DEALER, { ...DEFAULT_FILTERS, signal: 'urgent' }, { now: NOW });
    expect(mockReviewFindMany).not.toHaveBeenCalled();
    expect(JSON.stringify(mockFeedbackFindMany.mock.calls[0][0].where)).toContain('"urgency":{"gte":0.7}');
  });
});

describe('replyToInboxItem', () => {
  it('ilk yanıt: atomik koşul (yanıtsız), tek bildirim + e-posta', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ id: 'f1', userId: 'u1', text: 'kötü', dealerReply: null, dealerRepliedAt: null, dealerFirstViewedAt: null });
    mockFeedbackUpdateMany.mockResolvedValue({ count: 1 });
    mockUserFindUnique.mockResolvedValue({ businessName: 'Kahve Evi', name: null });
    const res = await replyToInboxItem({ dealerId: DEALER, key: 'qr-f1', reply: ' Üzgünüz ', expectedReply: null, now: NOW });
    expect(res).toMatchObject({ reply: 'Üzgünüz', edited: false, notified: true });
    const where = JSON.stringify(mockFeedbackUpdateMany.mock.calls[0][0].where);
    expect(where).toContain('"dealerReply":null');
    expect(where).toContain(`"dealerId":"${DEALER}"`);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('düzenleme: beklenen yanıtla koşullu, müşteriye ikinci bildirim gitmez, tarih korunur', async () => {
    const repliedAt = new Date('2026-10-09T10:00:00Z');
    mockReviewFindFirst.mockResolvedValue({ id: 'c1', customerId: 'u2', text: null, dealerReply: 'Eski', dealerRepliedAt: repliedAt });
    mockReviewUpdateMany.mockResolvedValue({ count: 1 });
    const res = await replyToInboxItem({ dealerId: DEALER, key: 'cr-c1', reply: 'Yeni', expectedReply: 'Eski', now: NOW });
    expect(res).toMatchObject({ edited: true, notified: false, repliedAt: repliedAt.toISOString() });
    expect(JSON.stringify(mockReviewUpdateMany.mock.calls[0][0].where)).toContain('"dealerReply":"Eski"');
    expect(mockReviewUpdateMany.mock.calls[0][0].data).toEqual({ dealerReply: 'Yeni' });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('otomatik yanıt araya girdiyse 409 + güncel yanıt; yazım yapılmaz', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ id: 'f1', userId: 'u1', text: 'x', dealerReply: 'Oto yanıt', dealerRepliedAt: NOW, dealerFirstViewedAt: null });
    await expect(replyToInboxItem({ dealerId: DEALER, key: 'qr-f1', reply: 'Elle', expectedReply: null })).rejects.toMatchObject({
      code: 'REPLY_CONFLICT',
      status: 409,
      details: { currentReply: 'Oto yanıt' },
    });
    expect(mockFeedbackUpdateMany).not.toHaveBeenCalled();
  });

  it('yarışta koşul kaybedilirse (count=0) yine 409', async () => {
    mockFeedbackFindFirst
      .mockResolvedValueOnce({ id: 'f1', userId: 'u1', text: 'x', dealerReply: null, dealerRepliedAt: null, dealerFirstViewedAt: null })
      .mockResolvedValueOnce({ dealerReply: 'Kural', dealerRepliedAt: NOW });
    mockFeedbackUpdateMany.mockResolvedValue({ count: 0 });
    await expect(replyToInboxItem({ dealerId: DEALER, key: 'qr-f1', reply: 'Elle', expectedReply: null })).rejects.toBeInstanceOf(InboxError);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('başka bayinin kaydı 404', async () => {
    mockFeedbackFindFirst.mockResolvedValue(null);
    await expect(replyToInboxItem({ dealerId: DEALER, key: 'qr-zzz', reply: 'x', expectedReply: null })).rejects.toMatchObject({ status: 404 });
  });
});

describe('applyInboxAction', () => {
  const fbRow = { id: 'f1', rating: 2, createdAt: new Date('2026-10-10T08:00:00Z'), sentiment: null, dealerRepliedAt: null, qrCode: { name: 'Masa 4' } };

  it('kapatma: açık bağlı vakaların hepsi kapanır', async () => {
    mockFeedbackFindMany.mockResolvedValue([fbRow]);
    mockIncidentFindMany.mockResolvedValue([
      { id: 'i2', status: 'open', assignedToId: null, resolvedAt: null, createdAt: NOW, metadata: { feedbackId: 'f1' } },
      { id: 'i1', status: 'in_progress', assignedToId: null, resolvedAt: null, createdAt: NOW, metadata: { feedbackId: 'f1' } },
    ]);
    mockIncidentUpdateMany.mockResolvedValue({ count: 2 });
    const res = await applyInboxAction({ dealerId: DEALER, actorId: DEALER, keys: ['qr-f1'], action: 'resolve', now: NOW });
    expect(res).toEqual([{ key: 'qr-f1', ok: true }]);
    expect(mockIncidentUpdateMany).toHaveBeenCalledWith({
      where: { dealerId: DEALER, id: { in: ['i2', 'i1'] } },
      data: { status: 'resolved', resolvedAt: NOW },
    });
  });

  it('kapatma: vaka yoksa kilit altında tek "inbox_case" (kapalı) açılır; başkasının kaydı reddedilir', async () => {
    mockFeedbackFindMany.mockResolvedValue([fbRow]);
    mockTxIncidentFindFirst.mockResolvedValue(null);
    const res = await applyInboxAction({ dealerId: DEALER, actorId: DEALER, keys: ['qr-f1', 'qr-other'], action: 'resolve', now: NOW });
    expect(res).toEqual([
      { key: 'qr-f1', ok: true },
      { key: 'qr-other', ok: false, error: 'Kayıt bulunamadı.' },
    ]);
    expect(mockTxExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockTxIncidentCreate.mock.calls[0][0].data).toMatchObject({
      dealerId: DEALER,
      type: 'inbox_case',
      status: 'resolved',
      severity: 'high',
      metadata: { feedbackId: 'f1', inboxKey: 'qr-f1', source: 'inbox' },
    });
  });

  it('atama: geçersiz kişi 400; geçerli kişiye vaka + bildirim', async () => {
    mockValidateAssignee.mockResolvedValueOnce({ ok: false, error: 'Yalnızca işletme sahibi ya da aktif personeliniz atanabilir.' });
    await expect(
      applyInboxAction({ dealerId: DEALER, actorId: DEALER, keys: ['qr-f1'], action: 'assign', assigneeId: 'stranger' })
    ).rejects.toMatchObject({ code: 'INVALID_ASSIGNEE', status: 400 });

    mockValidateAssignee.mockResolvedValueOnce({ ok: true, value: 'staff_1' });
    mockFeedbackFindMany.mockResolvedValue([fbRow]);
    mockTxIncidentFindFirst.mockResolvedValue(null);
    await applyInboxAction({ dealerId: DEALER, actorId: DEALER, keys: ['qr-f1'], action: 'assign', assigneeId: 'staff_1', now: NOW });
    expect(mockTxIncidentCreate.mock.calls[0][0].data).toMatchObject({ status: 'assigned', assignedToId: 'staff_1' });
    expect(mockTxIncidentCreate.mock.calls[0][0].data.dueAt).toEqual(new Date('2026-10-11T08:00:00.000Z'));
    expect(mockNotificationCreate.mock.calls[0][0].data).toMatchObject({ userId: 'staff_1', data: { href: '/dealer/inbox?id=qr-f1' } });
  });

  it('görüldü: yalnız ilk açılışta (koşullu) yazılır, vaka taranmaz', async () => {
    mockFeedbackFindMany.mockResolvedValue([fbRow]);
    mockFeedbackUpdateMany.mockResolvedValue({ count: 1 });
    await applyInboxAction({ dealerId: DEALER, actorId: DEALER, keys: ['qr-f1'], action: 'viewed', now: NOW });
    expect(JSON.stringify(mockFeedbackUpdateMany.mock.calls[0][0].where)).toContain('"dealerFirstViewedAt":null');
    expect(mockIncidentFindMany).not.toHaveBeenCalled();
  });
});

describe('suggestInboxReplies', () => {
  it('AI yapılandırılmamışsa dürüst "kullanılamıyor" (şablon AI diye sunulmaz)', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ rating: 2, text: 'kötü', qrCode: { name: 'Masa' } });
    mockAiConfigured.mockReturnValue(false);
    await expect(suggestInboxReplies(DEALER, DEALER, 'qr-f1')).resolves.toEqual({ drafts: [], source: 'unavailable', reason: 'not_configured' });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('bayi AI kapalı → ai_disabled', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ rating: 2, text: 'kötü', qrCode: { name: 'Masa' } });
    mockDealerAi.mockResolvedValue(false);
    await expect(suggestInboxReplies(DEALER, DEALER, 'qr-f1')).resolves.toMatchObject({ reason: 'ai_disabled' });
  });

  it('metinsiz yorum: puan + ürün + boyut bağlamı, bayi kapsamıyla tek geçitten', async () => {
    mockReviewFindFirst.mockResolvedValue({ rating: 2, text: null, dimensions: { service: 2 }, consumption: { product: { name: 'Latte' } } });
    mockSuggest.mockResolvedValue(['Taslak 1', ' ', 'Taslak 2']);
    const res = await suggestInboxReplies(DEALER, 'actor', 'cr-c1');
    expect(res).toEqual({ drafts: ['Taslak 1', 'Taslak 2'], source: 'ai', reason: null });
    const [text, rating, scope] = mockSuggest.mock.calls[0];
    expect(text).toContain('yazılı yorum bırakmadı');
    expect(text).toContain('Latte');
    expect(text).toContain('Servis 2/5');
    expect(rating).toBe(2);
    expect(scope).toEqual({ dealerId: DEALER, actorKey: 'actor' });
  });
});

describe('getInboxSummary', () => {
  function zeroes() {
    const agg = { _avg: { rating: null }, _count: { _all: 0 } };
    mockFeedbackAggregate.mockResolvedValue(agg);
    mockReviewAggregate.mockResolvedValue(agg);
    mockFeedbackGroupBy.mockResolvedValue([]);
    mockReviewGroupBy.mockResolvedValue([]);
    mockFeedbackCount.mockResolvedValue(0);
    mockReviewCount.mockResolvedValue(0);
    mockFeedbackFindMany.mockResolvedValue([]);
    mockReviewFindMany.mockResolvedValue([]);
  }

  it('yorum yokken ortalama/oranlar null (sıfır değil)', async () => {
    zeroes();
    const s = await getInboxSummary(DEALER, { from: new Date('2026-09-10T21:00:00Z'), to: new Date('2026-10-10T21:00:00Z') }, NOW);
    expect(s.avgRating).toEqual({ value: null, previous: null, n: 0 });
    expect(s.replyRate.value).toBeNull();
    expect(s.medianReplySeconds.value).toBeNull();
    expect(s.pending).toBe(0);
  });

  it('iki kaynağın ağırlıklı ortalaması, yanıt oranı ve medyan yanıt süresi', async () => {
    zeroes();
    mockFeedbackAggregate.mockResolvedValueOnce({ _avg: { rating: 4 }, _count: { _all: 3 } });
    mockReviewAggregate.mockResolvedValueOnce({ _avg: { rating: 2 }, _count: { _all: 1 } });
    mockFeedbackCount.mockResolvedValueOnce(2); // dönemde yanıtlanan QR
    mockFeedbackFindMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-10-01T10:00:00Z'), dealerRepliedAt: new Date('2026-10-01T11:00:00Z') },
      { createdAt: new Date('2026-10-02T10:00:00Z'), dealerRepliedAt: new Date('2026-10-02T13:00:00Z') },
    ]);
    mockFeedbackGroupBy.mockResolvedValueOnce([{ rating: 4, _count: { _all: 3 } }]);
    const s = await getInboxSummary(DEALER, { from: new Date('2026-09-10T21:00:00Z'), to: new Date('2026-10-10T21:00:00Z') }, NOW);
    expect(s.avgRating.value).toBe(3.5);
    expect(s.replyRate.value).toBe(50);
    expect(s.medianReplySeconds.value).toBe(7200);
    expect(s.distribution['4']).toBe(3);
  });
});
