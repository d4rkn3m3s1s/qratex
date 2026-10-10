/**
 * P0-12 — bayi kapsamlı müşteri istatistiği. Senaryo: müşteri A bayisinde 100 TL, rakip B
 * bayisinde 10.000 TL harcamış. Eski platform CLV'si A'ya "VIP, 10.100 TL" gösteriyordu.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));

import { db, resetDb } from '../helpers/prisma-proxy';
import {
  buildDealerCustomerStats,
  computeDealerCustomerStats,
  pickDealerSegment,
  recomputeAllDealerCustomerStats,
} from '@/lib/dealer-customer-stats';

const NOW = new Date('2026-10-08T00:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeEach(() => resetDb());

describe('pickDealerSegment', () => {
  it.each([
    [{ totalSpend: 10, visitCount: 1, churnRisk: 0.7, firstVisitAt: day(200), lastVisitAt: day(1) }, 'at_risk'],
    [{ totalSpend: 6000, visitCount: 1, churnRisk: 0.1, firstVisitAt: day(200), lastVisitAt: day(1) }, 'vip'],
    [{ totalSpend: 100, visitCount: 12, churnRisk: null, firstVisitAt: day(200), lastVisitAt: day(1) }, 'loyal'],
    [{ totalSpend: 100, visitCount: 2, churnRisk: null, firstVisitAt: day(200), lastVisitAt: day(45) }, 'dormant'],
    [{ totalSpend: 100, visitCount: 1, churnRisk: null, firstVisitAt: day(5), lastVisitAt: day(5) }, 'new'],
    [{ totalSpend: 100, visitCount: 2, churnRisk: null, firstVisitAt: day(60), lastVisitAt: day(10) }, null],
  ])('örnek #%#', (m, expected) => {
    expect(pickDealerSegment(m, NOW)).toBe(expected);
  });
});

describe('buildDealerCustomerStats (saf)', () => {
  it('yalnız verilen toplulaştırmaları kullanır; ağırlıklı churn ve puan', () => {
    const stats = buildDealerCustomerStats(
      'dealer-a',
      [
        {
          customerId: 'c1',
          _sum: { amount: 100 },
          _count: { _all: 2 },
          _avg: { amount: 50 },
          _min: { createdAt: day(10) },
          _max: { createdAt: day(2) },
        },
      ],
      [
        { userId: 'c1', avg: 0.2, n: 1 },
        { userId: 'c1', avg: 0.8, n: 3 },
        { userId: 'other', avg: 1, n: 10 },
      ],
      [
        { userId: 'c1', avg: 5, n: 1 },
        { userId: 'c1', avg: 3, n: 1 },
      ],
      NOW
    );
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      dealerId: 'dealer-a',
      customerId: 'c1',
      totalSpend: 100,
      visitCount: 2,
      avgOrderValue: 50,
      reviewCount: 2,
      avgRating: 4,
      segmentKey: 'at_risk',
    });
    expect(stats[0]!.churnRisk).toBeCloseTo(0.65, 5);
  });
});

describe('computeDealerCustomerStats — her sorgu bayi kapsamlı', () => {
  it('rakip bayideki harcama hiçbir sorguya girmez', async () => {
    db.consumption.groupBy.mockResolvedValue([
      { customerId: 'c1', _sum: { amount: 100 }, _count: { _all: 1 }, _avg: { amount: 100 }, _min: { createdAt: day(3) }, _max: { createdAt: day(3) } },
    ]);
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);

    const stats = await computeDealerCustomerStats('dealer-a', { now: NOW });
    expect(stats[0]).toMatchObject({ totalSpend: 100, segmentKey: 'new' });

    expect(db.consumption.groupBy.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a' });
    for (const [args] of db.feedback.groupBy.mock.calls) {
      expect(args.where.qrCode).toEqual({ dealerId: 'dealer-a' });
      expect(args.where.deletedAt).toBeNull();
    }
    for (const [args] of db.consumptionReview.groupBy.mock.calls) {
      expect(args.where.consumption).toEqual({ dealerId: 'dealer-a' });
    }
    expect(db.customerLifetimeValue.findMany).not.toHaveBeenCalled();
  });
});

describe('recomputeAllDealerCustomerStats — kalıcı katman', () => {
  it('her bayi için (dealerId, customerId) upsert; bir bayinin hatası diğerini durdurmaz', async () => {
    db.consumption.groupBy.mockImplementation(async (args: { by: string[]; where?: { dealerId?: string } }) => {
      if (args.by[0] === 'dealerId') return [{ dealerId: 'dealer-a' }, { dealerId: 'dealer-b' }];
      if (args.where?.dealerId === 'dealer-b') throw new Error('boom');
      return [
        { customerId: 'c1', _sum: { amount: 40 }, _count: { _all: 1 }, _avg: { amount: 40 }, _min: { createdAt: day(1) }, _max: { createdAt: day(1) } },
      ];
    });
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);
    db.dealerCustomerStats.upsert.mockResolvedValue({});

    const r = await recomputeAllDealerCustomerStats(NOW);
    expect(r).toEqual({ dealers: 2, rows: 1, failed: 1 });
    const call = db.dealerCustomerStats.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ dealerId_customerId: { dealerId: 'dealer-a', customerId: 'c1' } });
    expect(call.create).toMatchObject({ dealerId: 'dealer-a', customerId: 'c1', totalSpend: 40, visitCount: 1 });
  });
});
