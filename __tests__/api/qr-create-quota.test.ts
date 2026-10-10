/**
 * POST /api/qr-codes — plan kotası kontrolü ile oluşturma AYNI kilit altında (P0-24 / F12).
 *
 * Saldırı (yeniden üretim): planı 3 QR olan, 2 canlı kodu bulunan bayi aynı anda 5 "oluştur"
 * isteği yollar. Eski kod önce `count` (hepsi 2 görür) sonra `create` yapıyordu → 7 canlı kod.
 * Beklenen: tam 1 istek başarılı, diğerleri 402 PLAN_LIMIT_REACHED; canlı sayı 3.
 * Arşivlenmiş/iptal edilmiş kodlar canlı kotayı tüketmez.
 */
import { NextRequest } from 'next/server';

type Qr = { id: string; code: string; name: string; dealerId: string; revokedAt: Date | null; archivedAt: Date | null };
const qrs = new Map<string, Qr>();
let seq = 0;

// pg_advisory_xact_lock benzetimi: anahtar başına tek transaction; kilit tx bitince bırakılır.
const lockTails = new Map<string, Promise<void>>();
let currentRelease: (() => void) | null = null;
const releases: Array<() => void> = [];

function liveCount(where: Record<string, unknown>): number {
  return [...qrs.values()].filter(
    (q) =>
      (where.dealerId === undefined || q.dealerId === where.dealerId) &&
      (where.revokedAt !== null || q.revokedAt === null) &&
      (where.archivedAt !== null || q.archivedAt === null)
  ).length;
}

const db = {
  qRCode: {
    findUnique: jest.fn(async () => null),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      await new Promise((r) => setTimeout(r, 1)); // count ile create arasında yarış penceresi
      return liveCount(where);
    }),
    create: jest.fn(async ({ data }: { data: Partial<Qr> }) => {
      const row = { id: `qr_${++seq}`, revokedAt: null, archivedAt: null, ...data } as Qr;
      qrs.set(row.id, row);
      return row;
    }),
  },
  analyticsEvent: { create: jest.fn(async () => ({})) },
  $executeRaw: jest.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
    const key = String(values[0]);
    const prev = lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    lockTails.set(key, prev.then(() => mine));
    await prev;
    releases.push(release);
    currentRelease = release;
    return 1;
  }),
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    ...db,
    $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
      const before = releases.length;
      try {
        return await fn(db);
      } finally {
        // Bu tx'in aldığı kilitleri bırak (xact_lock: commit/rollback'te düşer).
        releases.splice(before).forEach((r) => r());
        currentRelease = null;
      }
    },
  },
}));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'dealer_1', role: 'DEALER' } } })),
}));
jest.mock('@/lib/plan-limits', () => ({
  getDealerPlanLimits: jest.fn(async () => ({ maxQRCodes: 3, maxBranches: 1, planName: 'Ücretsiz' })),
}));
jest.mock('@/lib/utils', () => ({ generateQRCode: () => `CODE${++seq}` }));

import { POST } from '@/app/api/qr-codes/route';

function seed(id: string, extra: Partial<Qr> = {}) {
  qrs.set(id, { id, code: `C_${id}`, name: id, dealerId: 'dealer_1', revokedAt: null, archivedAt: null, ...extra });
}
const post = () =>
  POST(
    new NextRequest('http://localhost/api/qr-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Masa' }),
    })
  );
const live = () => [...qrs.values()].filter((q) => !q.revokedAt && !q.archivedAt).length;

beforeEach(() => {
  qrs.clear();
  lockTails.clear();
  releases.length = 0;
  currentRelease = null;
  seed('A');
  seed('B');
});

describe('POST /api/qr-codes kota yarışı', () => {
  it('SALDIRI: 5 paralel oluşturma limiti aşamaz (yalnız 1 başarılı)', async () => {
    const results = await Promise.all([post(), post(), post(), post(), post()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 402)).toHaveLength(4);
    expect(live()).toBe(3);
    const denied = await results.find((r) => r.status === 402)!.json();
    expect(denied).toMatchObject({ code: 'PLAN_LIMIT_REACHED', quota: { used: 3, limit: 3 } });
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it('arşivlenmiş ve iptal edilmiş kodlar canlı kotayı tüketmez', async () => {
    seed('C', { archivedAt: new Date() });
    seed('D', { revokedAt: new Date() });
    const res = await post();
    expect(res.status).toBe(200);
    expect(live()).toBe(3);
  });

  it('limit doluyken 402 ve yazım yok', async () => {
    seed('C');
    const before = qrs.size;
    const res = await post();
    expect(res.status).toBe(402);
    expect(qrs.size).toBe(before);
    expect(currentRelease).toBeNull();
  });
});
