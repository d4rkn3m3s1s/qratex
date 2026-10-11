/**
 * Admin geri bildirim moderasyon kuyruğu — sözleşme, SQL yapı taşları ve toplu aksiyonlar.
 * (docs/audit/2026-10-08/admin/admin_feedbacks.md bulguları 1-5, 10, 14)
 */
// jest `@prisma/client`'ı node_modules taslağına çözer; `Prisma.sql/raw` üretilmiş istemcide.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
import type { Prisma } from '@prisma/client';

const tx = {
  feedback: { findMany: jest.fn(), updateMany: jest.fn() },
  consumptionReview: { findMany: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  // Moderasyon geri alımı (lib/economy/clawback): varsayılan "kredi satırı yok" → puan işlemi yok.
  pointsLedger: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
};
const mockPrisma = {
  ...tx,
  notification: { create: tx.notification.create, findMany: jest.fn() },
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  $queryRaw: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma, isPrismaConnectivityError: () => false }));

import {
  bulkBodySchema,
  canonicalFeedQs,
  csvCell,
  normalizeDimensions,
  normalizeStringList,
  parseFeedKey,
  parseFeedQuery,
  resolveWindow,
  searchPattern,
} from '@/lib/admin-feedbacks/contract';
import { feedCte, filterConds, toFeedItem, toStats, viewCond } from '@/lib/admin-feedbacks/feed.server';
import { runBulk } from '@/lib/admin-feedbacks/actions.server';

const ACTOR = { actor: { id: 'admin-1', type: 'user' as const, email: 'a@x.com', role: 'ADMIN', name: 'Yönetici' } };
const sqlText = (s: Prisma.Sql) => s.sql.replace(/\s+/g, ' ');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('sözleşme', () => {
  it('kaynak önekli kimlik ayrıştırılır, bozuk kimlik reddedilir', () => {
    expect(parseFeedKey('qr:abc123')).toEqual({ source: 'qr', id: 'abc123' });
    expect(parseFeedKey('consumption:r_1')).toEqual({ source: 'consumption', id: 'r_1' });
    expect(parseFeedKey('x:abc')).toBeNull();
    expect(parseFeedKey('qr:a b')).toBeNull();
    expect(parseFeedKey('abc')).toBeNull();
  });

  it('bitiş günü DAHİL, İstanbul gece yarısı (Bulgu 5)', () => {
    const w = resolveWindow({ from: '2026-10-01', to: '2026-10-01' })!;
    expect(w.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-01T21:00:00.000Z');
    expect(resolveWindow({})).toBeNull();
    const p = resolveWindow({ period: 'last7' }, '2026-10-11')!;
    expect(p.from.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-10-11T21:00:00.000Z');
  });

  it('URL ayrıştırma bozuk alanı düşürür, diğerlerini korur; kanonik dizgi sıra bağımsız', () => {
    const a = parseFeedQuery(new URLSearchParams('rating=1,9,2&view=bogus&q=kahve&size=20'));
    expect(a.rating).toEqual(['1', '2']);
    expect(a.view).toBeUndefined();
    expect(a.q).toBe('kahve');
    const b = parseFeedQuery(new URLSearchParams('q=kahve&rating=2,1'));
    expect(canonicalFeedQs(a)).toBe(canonicalFeedQs(b));
  });

  it('arama deseni joker karakterleri kaçışlar; tek harf yok sayılır', () => {
    expect(searchPattern('a')).toBeNull();
    expect(searchPattern('50%_x')).toBe('%50\\%\\_x%');
  });

  it('gerekçe zorunlu aksiyonlar gerekçesiz reddedilir; kimlikler tekilleşir', () => {
    expect(bulkBodySchema.safeParse({ action: 'delete', keys: ['qr:a'] }).success).toBe(false);
    const ok = bulkBodySchema.parse({ action: 'delete', keys: ['qr:a', 'qr:a', 'consumption:b'], reason: 'hakaret' });
    expect(ok.keys).toEqual([
      { source: 'qr', id: 'a' },
      { source: 'consumption', id: 'b' },
    ]);
    expect(bulkBodySchema.safeParse({ action: 'restore', keys: ['qr:a'] }).success).toBe(true);
    expect(bulkBodySchema.safeParse({ action: 'restore', keys: ['bad'] }).success).toBe(false);
  });

  it('duygular dizisi indeks değil etiket döner (Bulgu 4); boyutlar sayısal + TR', () => {
    expect(normalizeStringList(['mutlu', 'memnun'])).toEqual(['mutlu', 'memnun']);
    expect(normalizeStringList([{ label: 'happy', score: 0.8 }])).toEqual(['happy']);
    expect(normalizeStringList({ happy: 1 })).toEqual(['happy']);
    expect(normalizeDimensions({ taste: 5, service: { score: 4 }, note: 'x' })).toEqual([
      { key: 'taste', label: 'Lezzet', value: 5 },
      { key: 'service', label: 'Hizmet', value: 4 },
    ]);
  });

  it('CSV formül enjeksiyonu nötrlenir (Bulgu 6)', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('normal')).toBe('normal');
  });
});

describe('SQL yapı taşları', () => {
  it('iki kaynak tek akışta UNION ALL; kaynak seçilince diğer tablo taranmaz (Bulgu 2)', () => {
    expect(sqlText(feedCte(undefined))).toContain('UNION ALL');
    expect(sqlText(feedCte('qr'))).not.toContain('ConsumptionReview');
    expect(sqlText(feedCte('consumption'))).not.toContain('"Feedback"');
  });

  it('görünümler: çöp kutusu silinenler, diğerleri silinmemiş', () => {
    expect(sqlText(viewCond('trash'))).toContain('deleted_at IS NOT NULL');
    for (const v of ['all', 'attention', 'unreplied', 'flagged', 'hidden'] as const) {
      expect(sqlText(viewCond(v))).toContain('deleted_at IS NULL');
    }
    expect(sqlText(viewCond('attention'))).toContain('e.rating <= 2 AND NOT e.replied');
  });

  it('arama tek yerde: metin, müşteri adı/e-posta, bayi, QR/ürün', () => {
    const [c] = filterConds({ q: 'kahve' });
    const t = sqlText(c);
    for (const col of ['e.body', 'e.user_name', 'e.user_email', 'e.dealer_name', 'e.place']) expect(t).toContain(col);
  });

  it('duygu ve puan filtresi birbirini ezmez (Bulgu 5)', () => {
    const conds = filterConds({ sentiment: 'negative', rating: ['2'] });
    expect(conds).toHaveLength(2);
    expect(conds[0].values).toContain('negative');
    expect(conds[1].values).toContainEqual([2]);
  });

  it('satır eşleme: kimlik önekli, önizleme kırpılır, bigint sayılar', () => {
    const item = toFeedItem({
      source: 'qr',
      id: 'f1',
      at: new Date('2026-10-01T10:00:00Z'),
      rating: 2,
      body: 'x'.repeat(400),
      s: 'negative',
      dealer_id: 'd1',
      dealer_name: 'Kafe',
      place: 'Masa 1',
      user_id: null,
      user_name: null,
      user_email: null,
      replied: false,
      is_toxic: false,
      trust_flagged: true,
      fraud_score: null,
      is_public: true,
      deleted_at: null,
      topics: ['hizmet'],
    });
    expect(item.key).toBe('qr:f1');
    expect(item.text!.length).toBe(280);
    expect(item.topics).toEqual(['hizmet']);
    const st = toStats({ v_attention: BigInt(3), total: BigInt(10), avg_rating: 3.456, nps_n: BigInt(4), nps_pro: BigInt(3), nps_det: BigInt(1), r1: BigInt(2) });
    expect(st.views.attention).toBe(3);
    expect(st.avgRating).toBe(3.46);
    expect(st.nps).toEqual({ value: 50, n: 4 });
    expect(st.distribution['1']).toBe(2);
  });
});

describe('toplu moderasyon', () => {
  it('çöp kutusu: koşullu soft delete, gerçek sayı, anlık görüntülü denetim (Bulgu 1, 3)', async () => {
    tx.feedback.findMany.mockResolvedValue([{ id: 'f1', rating: 1, text: 'kötü', isPublic: true, isToxic: false, trustFlagged: false, deletedAt: null }]);
    tx.feedback.updateMany.mockResolvedValue({ count: 1 });
    tx.consumptionReview.findMany.mockResolvedValue([{ id: 'r1', rating: 2, text: 'meh', deletedAt: null }]);
    tx.consumptionReview.updateMany.mockResolvedValue({ count: 1 });

    const body = bulkBodySchema.parse({ action: 'delete', keys: ['qr:f1', 'qr:f2', 'consumption:r1'], reason: 'hakaret' });
    const r = await runBulk(body, ACTOR);

    expect(r.affected).toBe(2);
    expect(r.skipped).toEqual([{ key: 'qr:f2', reason: expect.any(String) }]);
    const upd = tx.feedback.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: { in: ['f1'] }, deletedAt: null });
    expect(upd.data.deletedAt).toBeInstanceOf(Date);
    expect(tx.consumptionReview.updateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('FEEDBACK_MOD_DELETE');
    expect(audit.oldData.items).toHaveLength(2);
    expect(audit.newData.reason).toBe('hakaret');
    expect(audit.entityId).toContain('qr:f1');
  });

  it('gizleme tüketim yorumunda açık gerekçeyle atlanır, sessizce yok sayılmaz', async () => {
    tx.feedback.findMany.mockResolvedValue([]);
    const body = bulkBodySchema.parse({ action: 'hide', keys: ['consumption:r1'], reason: 'spam yorum' });
    const r = await runBulk(body, ACTOR);
    expect(r.affected).toBe(0);
    expect(r.skipped[0]).toMatchObject({ key: 'consumption:r1' });
    expect(tx.consumptionReview.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('bayiye hatırlatma: bayi başına tek bildirim, 24 saat bekleme süresi', async () => {
    mockPrisma.feedback.findMany.mockResolvedValue([
      { id: 'f1', rating: 1, qrCode: { dealerId: 'd1' } },
      { id: 'f2', rating: 4, qrCode: { dealerId: 'd1' } },
      { id: 'f3', rating: 2, qrCode: { dealerId: 'd2' } },
    ]);
    mockPrisma.consumptionReview.findMany.mockResolvedValue([]);
    mockPrisma.notification.findMany.mockResolvedValue([{ userId: 'd2' }]);
    const body = bulkBodySchema.parse({ action: 'remind', keys: ['qr:f1', 'qr:f2', 'qr:f3', 'qr:f9'] });
    const r = await runBulk(body, ACTOR);
    expect(r.notifiedDealers).toBe(1);
    expect(r.affected).toBe(2);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    const n = tx.notification.create.mock.calls[0][0].data;
    expect(n.userId).toBe('d1');
    expect(n.data.kind).toBe('admin_feedback_reminder');
    expect(n.message).toContain('1 tanesi düşük puanlı');
    expect(r.skipped.map((s) => s.key).sort()).toEqual(['qr:f3', 'qr:f9']);
  });
});
