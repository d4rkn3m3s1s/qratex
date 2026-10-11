/**
 * Veri modeli B3 — gece ekonomi mutabakatı (DB YOK; $queryRaw sahte).
 *  - Sapma yoksa hiçbir uyarı yazılmaz.
 *  - Defter sapması → tek ECONOMY_LEDGER_DRIFT (ERROR), örneklem metadata'da; bigint sayılar çevrilir.
 *  - Bağış / kupon sapmaları ayrı WARNING uyarıları.
 *  - Sorgular doğru kuralları taşır: sessiz pencere, ±60 sn küme, yalnız POINTS, kupon yalnız eksik sayaç.
 *  - İş hiçbir bakiyeyi/sayacı DEĞİŞTİRMEZ (yalnız securityAlert.create).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@prisma/client', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));

import { runEconomyReconcile } from '@/lib/economy/reconcile';

type Sql = { strings?: readonly string[]; sql?: string };
const sqlText = (q: unknown) => {
  const s = q as Sql;
  return s.sql ?? (s.strings ?? []).join('?');
};

function makeDb(rows: { ledger?: unknown[]; donation?: unknown[]; coupon?: unknown[] }) {
  const queries: string[] = [];
  const db = {
    $queryRaw: jest.fn(async (q: unknown) => {
      const text = sqlText(q);
      queries.push(text);
      if (text.includes('"PointsLedger"')) return rows.ledger ?? [];
      if (text.includes('"DonationProject"')) return rows.donation ?? [];
      if (text.includes('"CouponRedemption"')) return rows.coupon ?? [];
      return [];
    }),
    securityAlert: { create: jest.fn(async () => ({ id: 'a1' })) },
  };
  return { db, queries };
}

const NOW = new Date('2026-10-11T03:00:00Z');

describe('runEconomyReconcile', () => {
  it('sapma yoksa uyarı yazmaz', async () => {
    const { db } = makeDb({});
    const r = await runEconomyReconcile(db as never, NOW);
    expect(r.alerts).toBe(0);
    expect(db.securityAlert.create).not.toHaveBeenCalled();
  });

  it('defter sapmasını tek ERROR uyarısıyla raporlar (bigint → number)', async () => {
    const { db } = makeDb({
      ledger: [{ userId: 'u1', points: 900, ledgerBalance: BigInt(700), lastAt: new Date('2026-10-10T10:00:00Z') }],
    });
    const r = await runEconomyReconcile(db as never, NOW);
    expect(r.ledgerDrift).toEqual([{ userId: 'u1', points: 900, ledgerBalance: 700, lastAt: new Date('2026-10-10T10:00:00Z') }]);
    expect(db.securityAlert.create).toHaveBeenCalledTimes(1);
    const data = (db.securityAlert.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.type).toBe('ECONOMY_LEDGER_DRIFT');
    expect(data.severity).toBe('ERROR');
    expect(data.targetId).toBe('u1');
  });

  it('bağış ve kupon sapmaları ayrı uyarılar', async () => {
    const { db } = makeDb({
      donation: [{ projectId: 'p1', name: 'Su', current: 100, total: BigInt(80) }],
      coupon: [{ couponId: 'c1', code: 'X', usedCount: 1, redemptions: BigInt(3) }],
    });
    const r = await runEconomyReconcile(db as never, NOW);
    expect(r.alerts).toBe(2);
    const types = db.securityAlert.create.mock.calls.map((c) => (c as unknown as [{ data: { type: string } }])[0].data.type);
    expect(types.sort()).toEqual(['ECONOMY_COUPON_DRIFT', 'ECONOMY_DONATION_DRIFT']);
    expect(r.donationDrift[0]).toEqual({ projectId: 'p1', name: 'Su', current: 100, total: 80 });
  });

  it('sorgu kuralları: sessiz pencere, ±60 sn küme, POINTS, kupon yalnız eksik sayaç', async () => {
    const { db, queries } = makeDb({});
    await runEconomyReconcile(db as never, NOW);
    const ledger = queries.find((q) => q.includes('"PointsLedger"'))!;
    expect(ledger).toMatch(/HAVING MAX\("createdAt"\) </);
    expect(ledger).toMatch(/interval '60 seconds'/);
    expect(ledger).toMatch(/"currency" = 'POINTS'/);
    expect(ledger).toMatch(/NOT EXISTS/);
    const coupon = queries.find((q) => q.includes('"CouponRedemption"'))!;
    expect(coupon).toMatch(/"usedCount" < COUNT/);
    // Yalnız okuma: UPDATE/DELETE yok.
    for (const q of queries) expect(q).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/);
  });
});
