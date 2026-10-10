/**
 * Cüzdan → Hareketler sunucu mantığı (lib/customer-wallet/**). Gerçek DB'ye gidilmez:
 * servisler `db` parametresi aldığından elle yazılmış sahte istemci verilir.
 *
 * Kapsanan denetim bulguları:
 *  - consumptions B1: özet sayılar filtreden bağımsız, "Yorumlandı" negatif olamaz.
 *  - consumptions B2: imleçli sayfalama + sunucu araması (ILIKE/insensitive).
 *  - consumptions B7: yorum ödülü önizlemesi tavanı aşamaz.
 *  - spending-overview B3: CSV formül enjeksiyonu kaçışı.
 *  - spending-overview B6: dönem/kova sınırları Europe/Istanbul.
 *  - Puan defteri: gölge ban satırı bakiye sızdırmaz, uzlaştırma negatif gösterilmez.
 */
import type { Prisma } from '@prisma/client';

// jest `@prisma/client`'ı node_modules taslağına çözer; `Prisma.sql/join/raw` üretilmiş istemcide.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({ consumptionReview: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } } })),
  getConsumptionReviewReward: (text: string, m: { consumptionReview: { longTextThreshold: number; base: unknown; detailed: unknown } }) =>
    text && text.trim().length >= m.consumptionReview.longTextThreshold ? m.consumptionReview.detailed : m.consumptionReview.base,
}));

import { decodeCursor, encodeCursor } from '@/lib/customer-wallet/cursor';
import { bucketKeys, resolveSummaryPeriod, weekStartOf } from '@/lib/customer-wallet/periods';
import { escapeCsvCell, toCsv } from '@/lib/customer-wallet/csv';
import { buildVisitsWhere, getReviewRewardPreview, getVisitStats, getVisitsPage, validAmount } from '@/lib/customer-wallet/activity/visits';
import { getPointsHistory, getPointsOverview, getPointsEntry } from '@/lib/customer-wallet/activity/points-history';
import { GROUP_SOURCES, groupOfSource, sourceLabel } from '@/lib/customer-wallet/activity/sources';
import { percentDelta } from '@/lib/customer-wallet/activity/spend-summary';

function sqlText(arg: unknown): { text: string; values: unknown[] } {
  const s = arg as Prisma.Sql;
  return { text: s.strings.join('?'), values: s.values };
}

describe('imleç', () => {
  it('gidiş-dönüş ve bozuk girdide null', () => {
    const at = new Date('2026-10-09T10:00:00.000Z');
    const c = encodeCursor(at, 'l_abc123');
    expect(decodeCursor(c)).toEqual({ at, id: 'l_abc123' });
    expect(decodeCursor('bozuk!!')).toBeNull();
    expect(decodeCursor(Buffer.from('2026-13-99|x').toString('base64'))).toBeNull();
    expect(decodeCursor(Buffer.from(`${at.toISOString()}|'; DROP`).toString('base64'))).toBeNull();
  });
});

describe('dönemler (Europe/Istanbul)', () => {
  // 10 Ekim 2026 Cumartesi 00:30 İstanbul = 9 Ekim 21:30 UTC
  const now = new Date('2026-10-09T21:30:00.000Z');

  it('"bu ay" İstanbul ayının ilk günü 00:00 (UTC 30 Eylül 21:00) başlar; UTC ayı değil', () => {
    const p = resolveSummaryPeriod('month', now);
    expect(p.from?.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(p.bucket).toBe('day');
    // Karşılaştırma: geçen ay başından aynı uzunluk
    expect(p.compare?.from.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(p.compare!.to.getTime() - p.compare!.from.getTime()).toBe(now.getTime() - p.from!.getTime());
    const keys = bucketKeys(p);
    expect(keys[0]).toBe('2026-10-01');
    expect(keys[keys.length - 1]).toBe('2026-10-10');
  });

  it('son 3 ay haftalık (Pazartesi) kovalar, yıl aylık', () => {
    const q = resolveSummaryPeriod('quarter', now);
    expect(q.from?.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(bucketKeys(q).every((k) => new Date(`${k}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
    const y = resolveSummaryPeriod('year', now);
    expect(bucketKeys(y)).toHaveLength(10);
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05');
  });

  it('tüm zamanlar ilk ziyaretten başlar, en fazla 36 ay', () => {
    const a = resolveSummaryPeriod('all', now);
    expect(a.compare).toBeNull();
    expect(bucketKeys(a, '2026-08-20')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(bucketKeys(a, '2019-01-05')).toHaveLength(36);
  });

  it('yüzde değişim: önceki 0 ise null', () => {
    expect(percentDelta(12, 10)).toBe(20);
    expect(percentDelta(5, 0)).toBeNull();
  });
});

describe('CSV', () => {
  it('formül enjeksiyonu kaçışlı, TR ayırıcı ; ve ondalık virgül, BOM', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x","Tıkla")', ';')).toBe('"\'=HYPERLINK(""http://x"",""Tıkla"")"');
    expect(escapeCsvCell('+cmd|calc', ',')).toBe("\"'+cmd|calc\"");
    expect(escapeCsvCell('@SUM(A1)', ',')).toBe("\"'@SUM(A1)\"");
    expect(escapeCsvCell('-2', ',')).toBe("\"'-2\"");
    expect(escapeCsvCell(-2, ',')).toBe('-2');
    expect(escapeCsvCell(12.5, ';')).toBe('12,5');
    expect(escapeCsvCell(Number.NaN, ',')).toBe('');
    const csv = toCsv([['İşletme', 'Tutar'], ['Kafe; Bar', 12.5]], 'tr');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Kafe; Bar";12,5');
  });
});

describe('ziyaretler', () => {
  function mockDb() {
    return {
      consumption: { count: jest.fn(), findMany: jest.fn() },
      analyticsEvent: { findMany: jest.fn(async () => []) },
      settings: { findUnique: jest.fn() },
    };
  }

  it('B1: özet her zaman filtresiz sayılır; yorumlanan = silinmemiş yorumlu (negatif olamaz)', async () => {
    const db = mockDb();
    db.consumption.count.mockResolvedValueOnce(8).mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const stats = await getVisitStats(db as never, 'u1');
    expect(stats).toEqual({ total: 8, pending: 5, reviewed: 3, replied: 1 });
    const wheres = db.consumption.count.mock.calls.map((c) => c[0].where);
    expect(wheres[0]).toEqual({ customerId: 'u1' });
    expect(wheres[1]).toEqual({ customerId: 'u1', review: null });
    expect(wheres[2]).toEqual({ customerId: 'u1', review: { is: { deletedAt: null } } });
  });

  it('B2: arama sunucuda, büyük/küçük harf duyarsız; filtre where\'e girer', () => {
    const w = buildVisitsWhere('u1', { review: 'pending', q: ' İzmir ', dealerId: 'd1' });
    expect(w.customerId).toBe('u1');
    expect(w.review).toBeNull();
    expect(w.dealerId).toBe('d1');
    expect(w.OR).toEqual([
      { dealer: { businessName: { contains: 'İzmir', mode: 'insensitive' } } },
      { dealer: { name: { contains: 'İzmir', mode: 'insensitive' } } },
      { product: { name: { contains: 'İzmir', mode: 'insensitive' } } },
    ]);
    expect(buildVisitsWhere('u1', { review: 'reviewed' }).review).toEqual({ isNot: null });
  });

  it('B2: imleç sayfalama — limit+1 ister, fazlası varsa son kimliği imleç verir; bozuk imleç yok sayılır', async () => {
    const db = mockDb();
    const row = (id: string) => ({
      id,
      createdAt: new Date('2026-10-01T10:00:00Z'),
      amount: id === 'c1' ? 0 : 45.5,
      dealer: { id: 'd1', businessName: '', name: 'Işık Kafe', businessLogo: null },
      product: null,
      review: id === 'c2' ? { rating: 4, text: 'Güzel', dealerReply: 'Teşekkürler', dealerRepliedAt: new Date(), deletedAt: null } : null,
    });
    db.consumption.findMany.mockResolvedValue([row('c1'), row('c2'), row('c3')]);
    const page = await getVisitsPage(db as never, 'u1', { limit: 2, cursor: 'c0' });
    const args = db.consumption.findMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(args.cursor).toEqual({ id: 'c0' });
    expect(args.skip).toBe(1);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('c2');
    expect(page.items[0].amount).toBeNull(); // 0 tutar "0" basılmaz (B11)
    expect(page.items[0].dealer.name).toBe('Işık Kafe');
    expect(page.items[1].review).toMatchObject({ state: 'reviewed', rating: 4, dealerReplied: true });

    await getVisitsPage(db as never, 'u1', { cursor: "x'; --" });
    expect(db.consumption.findMany.mock.calls[1][0].cursor).toBeUndefined();
  });

  it('B7: ödül önizlemesi bugünkü kalan hakkı aşmaz', async () => {
    const db = mockDb();
    db.analyticsEvent.findMany.mockResolvedValue([{ data: { points: 480 }, createdAt: new Date() }] as never);
    const r = await getReviewRewardPreview(db as never, 'u1');
    expect(r.base).toBe(50);
    expect(r.detailed).toBe(100);
    expect(r.detailedMinChars).toBe(50);
    expect(r.remainingToday).toBe(20);
  });

  it('geçerli tutar: NaN, ∞, ≤0 ve absürt değerler gösterilmez', () => {
    expect(validAmount(Number.NaN)).toBeNull();
    expect(validAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(validAmount(-5)).toBeNull();
    expect(validAmount(5_000_000)).toBeNull();
    expect(validAmount(120)).toBe(120);
  });
});

describe('puan defteri', () => {
  const baseRow = {
    at: new Date('2026-10-09T08:00:00Z'),
    xp: 0,
    status: 'posted',
    balance_after: 900,
    ref: null,
    dealer_name: null,
    legacy: false,
  };

  it('satırları eşler: gölge ban (void) bakiye göstermez, bağış/ziyaret kaynağa bağlanır, imleç üretir', async () => {
    const $queryRaw = jest.fn(async () => [
      { ...baseRow, id: 'l_1', delta: 50, source: 'game', status: 'void' },
      { ...baseRow, id: 'l_2', delta: -100, source: 'donation', ref: 'don1' },
      { ...baseRow, id: 'l_3', delta: 30, source: 'dealer_passive', ref: 'cons1', dealer_name: 'Kafe' },
    ]);
    const page = await getPointsHistory({ $queryRaw } as never, 'u1', { limit: 2, direction: 'earn', group: 'game' });
    expect(page.items[0]).toMatchObject({ id: 'l_1', status: 'posted', balanceAfter: null, group: 'game' });
    expect(page.items[1]).toMatchObject({ delta: -100, href: '/customer/wallet/donate?tab=history&receipt=don1' });
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor)?.id).toBe('l_2');

    const { text, values } = sqlText(($queryRaw.mock.calls[0] as unknown[])[0]);
    expect(text).toContain('"PointsLedger"');
    expect(text).toContain("'points_credited'");
    expect(text).toContain("->>'ledgerId') IS NULL"); // defterli olaylar iki kez sayılmaz
    expect(text).toContain('t.delta > 0');
    for (const s of GROUP_SOURCES.game) expect(values).toContain(s);
    expect(values).toContain(3); // limit + 1
  });

  it('uzlaştırma: bakiye − listelenen > 0 ise gösterilir, negatif fark gösterilmez', async () => {
    const db = {
      user: { findUnique: jest.fn(async () => ({ points: 1500 })) },
      $queryRaw: jest.fn(async () => [{ counted: BigInt(1200), earned_month: BigInt(300), spent_month: BigInt(50), pending: BigInt(0), first_at: new Date() }]),
    };
    const o = await getPointsOverview(db as never, 'u1');
    expect(o).toMatchObject({ balance: 1500, unlistedBalance: 300, earnedThisMonth: 300, spentThisMonth: 50 });
    db.user.findUnique.mockResolvedValueOnce({ points: 100 });
    expect((await getPointsOverview(db as never, 'u1')).unlistedBalance).toBe(0);
  });

  it('tek hareket: biçimsiz kimlik sorguya gitmez', async () => {
    const $queryRaw = jest.fn(async () => []);
    expect(await getPointsEntry({ $queryRaw } as never, 'u1', 'x_1')).toBeNull();
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('kaynak sözlüğü: bilinmeyen kaynak "Diğer", etiketler iki dilli', () => {
    expect(groupOfSource('feedback')).toBe('feedback');
    expect(groupOfSource('yeni_kaynak')).toBe('other');
    expect(sourceLabel('donation', 'tr')).toBe('Bağış');
    expect(sourceLabel('donation', 'en')).toBe('Donation');
    expect(sourceLabel('bilinmeyen', 'tr')).toBe('Diğer');
  });
});
