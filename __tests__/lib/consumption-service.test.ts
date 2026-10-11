/**
 * lib/consumption/service — tüketim yazma yolunun ekonomi testleri (P0-13, P0-18, P0-21).
 *
 * Gerçek `mintPoints` kullanılır (mock tx ile): pasif puanın tüketimle AYNI transaction'da,
 * `points_credited{dealer_passive, actorId}` görünürlüğüyle ve tavanlarla basıldığı doğrulanır.
 * Saldırı senaryoları: 1.000.000× mutlu saat, 10× + 100.000 bonuslu sezon, kendi kartına
 * tüketim, aynı clientOpId ile tekrar oynatma, eşzamanlı clientOpId yarışı.
 * Gerçek DB'ye GİDİLMEZ.
 */
const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: (...a: unknown[]) => mockRateLimit(...a) }));
const mockQualify = jest.fn();
const mockVisit = jest.fn();
jest.mock('@/lib/referral', () => ({ maybeQualifyReferral: (...a: unknown[]) => mockQualify(...a) }));
jest.mock('@/lib/visit-missions', () => ({ advanceVisitMissions: (...a: unknown[]) => mockVisit(...a) }));

import {
  computePassivePoints,
  createConsumption,
  ConsumptionError,
  PASSIVE_POINTS_MAX_PER_CONSUMPTION,
  runConsumptionSideEffects,
} from '@/lib/consumption/service';

// 2026-10-08 Perşembe 09:30 UTC = 12:30 İstanbul
const NOW = new Date('2026-10-08T09:30:00.000Z');
const DEALER = 'dealer_1';
const CUSTOMER = 'cust_1';

type Ev = { data: unknown; createdAt: Date };

function setup(opts: {
  card?: Record<string, unknown> | null;
  happyHours?: Array<Record<string, unknown>>;
  campaigns?: Array<Record<string, unknown>>;
  events?: Ev[];
  fraudStatus?: string;
  squad?: boolean;
  existingByClientOp?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
  birthDate?: Date | null;
  createError?: unknown;
  insider?: boolean;
} = {}) {
  let balance = 1000;
  const created = {
    id: 'cons_1',
    cardId: 'card_1',
    productId: null,
    amount: 100,
    note: null,
    clientOpId: null,
    createdAt: NOW,
    updatedAt: NOW,
    customer: { name: 'Ayşe', email: 'a@x.com' },
    product: null,
  };
  const tx = {
    consumption: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (opts.createError) throw opts.createError;
        return { ...created, amount: data.amount ?? null, clientOpId: data.clientOpId ?? null };
      }),
    },
    cardAuditLog: { create: jest.fn(async () => ({ id: 'cal1' })) },
    notification: { create: jest.fn(async () => ({ id: 'n1' })) },
    $queryRaw: jest.fn(async () => [{ id: CUSTOMER, fraudStatus: opts.fraudStatus ?? 'clean' }]),
    pointsLedger: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'led1' })),
    },
    analyticsEvent: {
      findMany: jest.fn(async () => opts.events ?? []),
      create: jest.fn(async () => ({ id: 'ev1' })),
    },
    user: {
      findUnique: jest.fn(async () => ({ points: balance, xp: 0, level: 1 })),
      update: jest.fn(async ({ data }: { data: { points?: { increment: number } } }) => {
        balance += data.points?.increment ?? 0;
        return { id: CUSTOMER, points: balance, xp: 0, level: 1 };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    squadMember: { findFirst: jest.fn(async () => (opts.squad ? { squadId: 'sq1' } : null)) },
    squad: { update: jest.fn(async () => ({ id: 'sq1' })) },
  };

  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, {
    physicalCard: {
      findUnique: jest.fn(async () =>
        opts.card === undefined
          ? { id: 'card_1', status: 'ACTIVATED', customerId: CUSTOMER, archivedAt: null }
          : opts.card
      ),
    },
    consumption: {
      findFirst: jest.fn(async () => opts.existingByClientOp ?? null),
    },
    product: { findUnique: jest.fn(async () => opts.product ?? null) },
    dealerStaff: { findFirst: jest.fn(async () => (opts.insider ? { id: 'staff_link_1' } : null)) },
    happyHour: { findMany: jest.fn(async () => opts.happyHours ?? []) },
    seasonalCampaign: { findMany: jest.fn(async () => opts.campaigns ?? []) },
    user: {
      findUnique: jest.fn(async () => ({
        id: CUSTOMER,
        level: 3,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        birthday: opts.birthDate ? { birthDate: opts.birthDate } : null,
      })),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  });
  return { tx, balance: () => balance };
}

const allDayHappyHour = (multiplier: number, extra: Record<string, unknown> = {}) => ({
  id: 'hh1',
  startTime: '00:00',
  endTime: '23:59',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  isActive: true,
  validFrom: null,
  validUntil: null,
  multiplier,
  ...extra,
});

const ctx = { dealerId: DEALER, channel: 'live' as const, now: NOW };

beforeEach(() => {
  mockRateLimit.mockReset();
  mockRateLimit.mockResolvedValue({ ok: true });
});

describe('computePassivePoints (saf)', () => {
  it('tutar yoksa taban 50 → 2 puan', () => {
    expect(computePassivePoints({ amount: null }).points).toBe(2);
  });
  it('çarpan şelalesi 4 ile, sonuç tüketim başı 300 ile sınırlı', () => {
    const r = computePassivePoints({ amount: 1_000_000, happyHourMultiplier: 3, seasonalMultiplier: 3, seasonalBonus: 250 });
    expect(r.baseXp).toBe(1000);
    expect(r.combinedMultiplier).toBe(4);
    expect(r.points).toBe(PASSIVE_POINTS_MAX_PER_CONSUMPTION);
  });
  it('kırpılmamış (saldırgan) çarpan verilse bile şelale 4 ile sınırlı', () => {
    const r = computePassivePoints({ amount: 100, happyHourMultiplier: 1_000_000 });
    expect(r.combinedMultiplier).toBe(4);
    expect(r.points).toBe(200);
  });
});

describe('createConsumption — puan basma kapısı (P0-13 / P0-21)', () => {
  it('1.000.000× mutlu saat + 10× / 100.000 bonuslu sezon: tek tüketim ≤ 300 puan, points_credited aynı tx', async () => {
    const { tx } = setup({
      happyHours: [allDayHappyHour(1_000_000)],
      campaigns: [{ id: 'c1', type: 'SEASONAL', multiplier: 10, bonusPoints: 100_000, conditions: null }],
    });

    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);

    expect(r.duplicate).toBe(false);
    expect(r.passive.requested).toBe(300); // 1000×0,05×4 + 250 = 450 → 300
    expect(r.passive.credited).toBe(300);
    expect(r.passive.combinedMultiplier).toBe(4);
    // Ham increment YOK: kök istemcide user.update çağrılmadı; kredi tx içinde.
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ points: { increment: 300 } }) })
    );
    // Görünürlük: points_credited, dealer_passive kategorisinde, aktör = bayi.
    expect(tx.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: CUSTOMER,
        event: 'points_credited',
        category: 'dealer_passive',
        data: expect.objectContaining({ points: 300, actorId: DEALER, source: 'dealer_passive', sourceId: 'cons_1' }),
      }),
    });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idempotencyKey: 'consumption:cons_1', actorId: DEALER, delta: 300 }),
      select: { id: true },
    });
    // Kayıt + denetim + bildirim aynı transaction'da.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.consumption.create).toHaveBeenCalledTimes(1);
    expect(tx.cardAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('müşteri × bayi × gün tavanı (300) dolduysa tüketim yazılır ama puan basılmaz', async () => {
    const { tx } = setup({
      events: [{ data: { points: 300, actorId: DEALER }, createdAt: NOW }],
    });
    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(tx.consumption.create).toHaveBeenCalled();
    expect(r.passive.requested).toBe(50);
    expect(r.passive.credited).toBe(0);
    expect(r.passive.capped).toBe(true);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('başka bayilerden günlük 600 dolduysa da puan yok (müşteri × gün tavanı)', async () => {
    const { tx } = setup({
      events: [
        { data: { points: 300, actorId: 'd2' }, createdAt: NOW },
        { data: { points: 300, actorId: 'd3' }, createdAt: NOW },
      ],
    });
    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(r.passive.credited).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('gölge ban: kayıt yazılır, bakiye ve klan puanı artmaz', async () => {
    const { tx } = setup({ fraudStatus: 'shadow_ban', squad: true });
    await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.squad.update).not.toHaveBeenCalled();
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'void' }) })
    );
  });

  it('klan toplamına yalnız gerçekten basılan puan eklenir', async () => {
    const { tx } = setup({ squad: true, events: [{ data: { points: 290, actorId: DEALER }, createdAt: NOW }] });
    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(r.passive.credited).toBe(10);
    expect(tx.squad.update).toHaveBeenCalledWith({ where: { id: 'sq1' }, data: { totalPoints: { increment: 10 } } });
  });

  it('BIRTHDAY kampanyası doğum günü olmayan müşteriye UYGULANMAZ', async () => {
    setup({
      campaigns: [{ id: 'bday', type: 'BIRTHDAY', multiplier: 3, bonusPoints: 100, conditions: null }],
      birthDate: new Date('1990-03-15T00:00:00Z'),
    });
    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(r.passive.seasonalCampaignId).toBeNull();
    expect(r.passive.requested).toBe(50);
  });

  it('BIRTHDAY kampanyası doğum günü bugün olan müşteriye uygulanır', async () => {
    setup({
      campaigns: [{ id: 'bday', type: 'BIRTHDAY', multiplier: 2, bonusPoints: 10, conditions: null }],
      birthDate: new Date('1990-10-08T00:00:00Z'),
    });
    const r = await createConsumption({ cardToken: 'tok', amount: 100 }, ctx);
    expect(r.passive.seasonalCampaignId).toBe('bday');
    expect(r.passive.requested).toBe(110);
  });
});

describe('createConsumption — kart, ürün ve girdi kuralları', () => {
  async function expectCode(p: Promise<unknown>, code: string) {
    await expect(p).rejects.toBeInstanceOf(ConsumptionError);
    await expect(p).rejects.toMatchObject({ code });
  }

  it('bayi kendi kartına tüketim yazamaz (kendine puan basma)', async () => {
    setup({ card: { id: 'card_1', status: 'ACTIVATED', customerId: DEALER, archivedAt: null } });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'SELF_DEALING');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('işletme personelinin (pasif dahil) kartına tüketim yazılamaz — personele pasif puan basma', async () => {
    setup({ insider: true });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'SELF_DEALING');
    expect(mockPrisma.dealerStaff.findFirst).toHaveBeenCalledWith({
      where: { dealerId: DEALER, userId: CUSTOMER },
      select: { id: true },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloklu / arşivli / aktive edilmemiş kart reddedilir', async () => {
    setup({ card: { id: 'c', status: 'BLOCKED', customerId: CUSTOMER, archivedAt: null } });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'CARD_BLOCKED');
    setup({ card: { id: 'c', status: 'ACTIVATED', customerId: CUSTOMER, archivedAt: NOW } });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'CARD_ARCHIVED');
    setup({ card: { id: 'c', status: 'UNUSED', customerId: null, archivedAt: null } });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'CARD_NOT_ACTIVATED');
    setup({ card: null });
    await expectCode(createConsumption({ cardToken: 'tok' }, ctx), 'CARD_NOT_FOUND');
  });

  it('tutar sınırı ve negatif tutar (offline parseFloat açığı)', async () => {
    setup();
    await expectCode(createConsumption({ cardToken: 'tok', amount: -999_999 }, ctx), 'VALIDATION');
    await expectCode(createConsumption({ cardToken: 'tok', amount: 5_000_000 }, ctx), 'VALIDATION');
    await expectCode(createConsumption({ cardToken: 'tok', amount: '100' }, ctx), 'VALIDATION');
  });

  it('başka bayinin ürünü 403', async () => {
    setup({ product: { id: 'p1', name: 'Çay', price: 10, dealerId: 'other' } });
    await expectCode(createConsumption({ cardToken: 'tok', productId: 'p1' }, ctx), 'PRODUCT_FORBIDDEN');
  });

  it('oran sınırı aşılırsa 429 ve kayıt yok', async () => {
    setup();
    mockRateLimit.mockResolvedValue({ ok: false, retryAfterMs: 4000 });
    const p = createConsumption({ cardToken: 'tok' }, ctx);
    await expectCode(p, 'RATE_LIMITED');
    await expect(p).rejects.toMatchObject({ retryAfterSec: 4, retryable: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('createConsumption — clientOpId idempotency (P0-18)', () => {
  const existing = {
    id: 'cons_old',
    cardId: 'card_1',
    productId: null,
    amount: 100,
    note: null,
    clientOpId: 'offline:q1abcdef',
    createdAt: NOW,
    updatedAt: NOW,
    customer: { name: 'Ayşe', email: 'a@x.com' },
    product: null,
    customerId: CUSTOMER,
  };

  it('aynı clientOpId ikinci kez: yeni kayıt, oran sınırı ve puan YOK', async () => {
    setup({ existingByClientOp: existing });
    const r = await createConsumption({ cardToken: 'tok', clientOpId: 'offline:q1abcdef' }, ctx);
    expect(r.duplicate).toBe(true);
    expect(r.consumption.id).toBe('cons_old');
    expect(r.passive.credited).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it('aynı clientOpId farklı kartla → 409', async () => {
    setup({ existingByClientOp: { ...existing, cardId: 'other_card' } });
    await expect(createConsumption({ cardToken: 'tok', clientOpId: 'offline:q1abcdef' }, ctx)).rejects.toMatchObject({
      code: 'CLIENT_OP_CONFLICT',
    });
  });

  it('eşzamanlı yarış: P2002 → tx geri alınır, ilk kayıt duplicate olarak döner', async () => {
    setup({ createError: Object.assign(new Error('unique'), { code: 'P2002' }) });
    mockPrisma.consumption.findFirst = jest
      .fn()
      .mockResolvedValueOnce(null) // ön kontrol: henüz yok
      .mockResolvedValueOnce(existing); // yarıştan sonra: ilk istek yazmış
    const r = await createConsumption({ cardToken: 'tok', clientOpId: 'offline:q1abcdef' }, ctx);
    expect(r.duplicate).toBe(true);
    expect(r.consumption.id).toBe('cons_old');
  });
});

describe('runConsumptionSideEffects — bekleyen davet (P0-16)', () => {
  beforeEach(() => {
    mockQualify.mockReset().mockResolvedValue(undefined);
    mockVisit.mockReset().mockResolvedValue({ completed: 0 });
  });

  it('kart tüketimi "ilk QR olayı": müşterinin bekleyen daveti nitelendirilmeye çalışılır', async () => {
    await runConsumptionSideEffects({ dealerId: DEALER, customerId: CUSTOMER, revenue: 120, at: NOW });
    expect(mockQualify).toHaveBeenCalledWith(CUSTOMER);
    expect(mockVisit).toHaveBeenCalledWith(CUSTOMER, DEALER);
  });

  it('davet kancası hata verse de diğer yan etkiler çalışır ve hata yutulur', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQualify.mockRejectedValue(new Error('db down'));
    await expect(
      runConsumptionSideEffects({ dealerId: DEALER, customerId: CUSTOMER, revenue: 0, at: NOW })
    ).resolves.toBeUndefined();
    expect(mockVisit).toHaveBeenCalled();
    spy.mockRestore();
  });
});
