/**
 * Admin → Sürpriz kutular + Kuponlar (Dalga 2) sunucu mantığı — prisma mock'lu.
 *  - Olasılık tablosu kurallardan türer (toplam %100, ≈40/35/20/5) ve ki-kare sapmayı yakalar.
 *  - Kutu kuponu gerçek Coupon'a bağlı: yok / pasif / süresi dolmuş / hak yetmiyor reddedilir.
 *  - Geri çekme yalnız açılmamış kutuları siler, denetim yazar; hepsi açılmışsa 409.
 *  - Kupon: Türkçe tek şema, geçmiş tarih ve P2002 → 409, ilk kullanımdan sonra çekirdek alan
 *    kilidi, limit kullanımın altına inemez, sürüm çakışması 409, değişiklik yoksa denetim yok,
 *    tekrar pasifleştirme idempotent, toplu üretim tek kullanımlık.
 */
class MockKnownError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
jest.mock('@prisma/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (v: unknown[]) => v,
    empty: { strings: [''], values: [] },
    PrismaClientKnownRequestError: MockKnownError,
  },
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({ surprise_boxes: true })) }));

type Row = Record<string, unknown>;
const boxes: Row[] = [];
const coupons = new Map<string, Row>();
const audits: Row[] = [];
const notifications: Row[] = [];

const db = {
  $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(db)),
  $queryRaw: jest.fn(async () => []),
  user: { findMany: jest.fn(async () => []) },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Row }) => {
      audits.push(data);
      return data;
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      audits.push(...data);
      return { count: data.length };
    }),
    findMany: jest.fn(async () => []),
  },
  notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
  userSurpriseBox: {
    findMany: jest.fn(async ({ where }: { where: Row }) => {
      if (where.id && typeof where.id === 'object') {
        const ids = (where.id as { in: string[] }).in;
        return boxes
          .filter((b) => ids.includes(b.id as string) && (!('withdrawnAt' in where) || b.withdrawnAt == null))
          .map((b) => ({ id: b.id }));
      }
      const key = ((where.OR as Row[])[0].metadata as { equals: string }).equals;
      return boxes
        .filter((b) => !('withdrawnAt' in where) || b.withdrawnAt == null)
        .filter((b) => (b.metadata as Row | null)?.campaignId === key || b.id === key).map((b) => ({ ...b, user: { name: 'Ali', email: 'a@x.com' } }));
    }),
    // Geri çekme artık SİLMEZ: withdrawnAt/By/Reason yazar (denetim için satır kalır).
    updateMany: jest.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
      let n = 0;
      for (const b of boxes) {
        if (where.id.in.includes(b.id as string) && b.openedAt == null && b.withdrawnAt == null) {
          Object.assign(b, data);
          n++;
        }
      }
      return { count: n };
    }),
    aggregate: jest.fn(async () => ({ _sum: { points: 0 } })),
  },
  coupon: {
    fields: { maxUses: 'FIELD_REF' },
    findUnique: jest.fn(async ({ where }: { where: { id?: string; code?: string } }) => {
      const c = where.id ? coupons.get(where.id) : [...coupons.values()].find((x) => x.code === where.code);
      return c ? { ...c } : null;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => ({ ...coupons.get(where.id)! })),
    findMany: jest.fn(async ({ where }: { where: { code: { in: string[] } } }) =>
      [...coupons.values()].filter((c) => where.code.in.includes(c.code as string)).map((c) => ({ id: c.id, code: c.code, createdAt: c.createdAt }))
    ),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const id = `c${coupons.size + 1}`;
      const row = { id, usedCount: 0, createdAt: new Date(), updatedAt: new Date('2026-10-01T00:00:00Z'), ...data };
      coupons.set(id, row);
      return { ...row };
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) {
        const id = `c${coupons.size + 1}`;
        coupons.set(id, { id, usedCount: 0, createdAt: new Date(), updatedAt: new Date(), ...d });
      }
      return { count: data.length };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const c = coupons.get(where.id as string);
      if (!c) return { count: 0 };
      if ('isActive' in where && c.isActive !== where.isActive) return { count: 0 };
      if (where.updatedAt && (c.updatedAt as Date).getTime() !== (where.updatedAt as Date).getTime()) return { count: 0 };
      Object.assign(c, data, { updatedAt: new Date((c.updatedAt as Date).getTime() + 1000) });
      return { count: 1 };
    }),
  },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { campaignState, expectedDailyTiers, tierTable } from '@/lib/admin-surprise-boxes/contract';
import { revokeCampaign, validateBoxCoupon } from '@/lib/admin-surprise-boxes/server';
import { couponBatchSchema, couponCreateSchema, csvCell, deriveCouponStatus } from '@/lib/admin-coupons/contract';
import { createCoupon, createCouponBatch, deactivateCoupon, updateCoupon } from '@/lib/admin-coupons/server';

const actor = { id: 'admin1', email: 'a@q.com', role: 'ADMIN', name: 'Yönetici', type: 'user' as const };
const NOW = new Date('2026-10-11T09:00:00Z');

beforeEach(() => {
  boxes.length = 0;
  coupons.clear();
  audits.length = 0;
  notifications.length = 0;
  jest.clearAllMocks();
});

describe('olasılık tablosu', () => {
  it('kurallardan türer ve toplam %100', () => {
    const e = expectedDailyTiers();
    const sum = e.common + e.rare + e.epic + e.legendary;
    expect(sum).toBeCloseTo(100, 5);
    expect(e.common).toBeGreaterThan(38);
    expect(e.common).toBeLessThan(42);
    expect(e.legendary).toBeGreaterThan(4);
    expect(e.legendary).toBeLessThan(7);
  });
  it('az örnekte sapma hesaplanmaz, beklenene uyan dağılım anlamlı değil, bozuk dağılım anlamlı', () => {
    expect(tierTable({ common: 10, rare: 10, epic: 5, legendary: 1 }).drift).toBeNull();
    const ok = tierTable({ common: 400, rare: 348, epic: 199, legendary: 55 });
    expect(ok.drift?.significant).toBe(false);
    const bad = tierTable({ common: 100, rare: 100, epic: 100, legendary: 700 });
    expect(bad.drift?.significant).toBe(true);
  });
  it('kampanya durumu', () => {
    expect(campaignState(0, 0)).toBe('revoked');
    expect(campaignState(3, 0)).toBe('pending');
    expect(campaignState(3, 1)).toBe('partial');
    expect(campaignState(3, 3)).toBe('opened');
  });
});

describe('kutu kuponu doğrulaması', () => {
  it('kodsuz geçer, yok/pasif/süresi dolmuş/hak yetmeyen reddedilir, büyük harfe çevrilir', async () => {
    expect(await validateBoxCoupon(undefined, 5, NOW)).toEqual({ ok: true, code: null });
    expect((await validateBoxCoupon('yok', 1, NOW)).ok).toBe(false);
    coupons.set('p', { id: 'p', code: 'PASIF', isActive: false, expiresAt: null, maxUses: -1, usedCount: 0 });
    expect((await validateBoxCoupon('pasif', 1, NOW)).ok).toBe(false);
    coupons.set('e', { id: 'e', code: 'ESKI', isActive: true, expiresAt: new Date('2026-01-01'), maxUses: -1, usedCount: 0 });
    expect((await validateBoxCoupon('ESKI', 1, NOW)).ok).toBe(false);
    coupons.set('l', { id: 'l', code: 'LIMIT', isActive: true, expiresAt: null, maxUses: 10, usedCount: 8 });
    const r = await validateBoxCoupon('limit', 3, NOW);
    expect(r.ok).toBe(false);
    expect(await validateBoxCoupon('limit', 2, NOW)).toEqual({ ok: true, code: 'LIMIT' });
  });
});

describe('kampanya geri çekme', () => {
  it('yalnız açılmamış kutuları geri çeker (silmez), bildirimleri temizler ve denetim yazar', async () => {
    const meta = { campaignId: 'sb_abc123' };
    boxes.push(
      { id: 'b1', userId: 'u1', points: 100, couponCode: null, title: 'T', metadata: meta, openedAt: null, createdAt: NOW },
      { id: 'b2', userId: 'u2', points: 100, couponCode: null, title: 'T', metadata: meta, openedAt: NOW, createdAt: NOW },
      { id: 'b3', userId: 'u3', points: 100, couponCode: null, title: 'T', metadata: meta, openedAt: null, createdAt: NOW }
    );
    const r = await revokeCampaign('sb_abc123', 'yanlış puan', actor, null, db as never);
    expect(r).toEqual({ revoked: 2, pointsReleased: 200 });
    // Satırlar KALIR; açılmamış olanlar withdrawn işaretlenir, açılmış olan dokunulmaz.
    expect(boxes.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(boxes.filter((b) => b.withdrawnAt).map((b) => b.id)).toEqual(['b1', 'b3']);
    expect(boxes.find((b) => b.id === 'b1')).toMatchObject({ withdrawnById: actor.id, withdrawReason: 'yanlış puan' });
    expect(boxes.find((b) => b.id === 'b2')!.withdrawnAt).toBeUndefined();
    // Tekrar geri çekme: kalan açılmamış kutu yok (geri çekilenler listeden gizli) → 409.
    await expect(revokeCampaign('sb_abc123', 'tekrar', actor, null, db as never)).rejects.toMatchObject({ status: 409 });
    expect(db.notification.deleteMany).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('SURPRISE_BOX_REVOKE');
    expect((audits[0].newData as Row).mode).toBe('withdraw');
    expect((audits[0].newData as Row).reason).toBe('yanlış puan');
  });
  it('hepsi açılmışsa 409, kampanya yoksa 404', async () => {
    boxes.push({ id: 'b9', userId: 'u1', points: 5, couponCode: null, title: 'T', metadata: { campaignId: 'sb_open01' }, openedAt: NOW, createdAt: NOW });
    await expect(revokeCampaign('sb_open01', 'deneme', actor, null, db as never)).rejects.toMatchObject({ status: 409 });
    await expect(revokeCampaign('sb_yok0001', 'deneme', actor, null, db as never)).rejects.toMatchObject({ status: 404 });
    expect(audits).toHaveLength(0);
  });
});

describe('kupon şeması ve durum', () => {
  it('Türkçe hatalar: %>100, limit 0, geçersiz kod; kod büyük harfe çevrilir', () => {
    const bad = couponCreateSchema.safeParse({ code: 'a', type: 'percentage', value: 150, maxUses: 0 });
    expect(bad.success).toBe(false);
    const msgs = bad.success ? [] : bad.error.issues.map((i) => i.message);
    expect(msgs).toContain('Kod en az 3 karakter olmalı');
    expect(msgs).toContain('Kullanım limiti en az 1 olmalı');
    const good = couponCreateSchema.parse({ code: ' yaz-2026 ', type: 'percentage', value: 20 });
    expect(good.code).toBe('YAZ-2026');
    expect(good.maxUses).toBeNull();
    expect(couponCreateSchema.safeParse({ code: 'YUZDE', type: 'percentage', value: 101 }).success).toBe(false);
    expect(couponBatchSchema.safeParse({ prefix: 'yaz', count: 501, type: 'fixed', value: 10 }).success).toBe(false);
  });
  it('durum önceliği: pasif > süresi doldu > limit doldu > kullanılabilir', () => {
    expect(deriveCouponStatus({ isActive: false, expiresAt: null, maxUses: -1, usedCount: 0 }, NOW)).toBe('inactive');
    expect(deriveCouponStatus({ isActive: true, expiresAt: '2026-01-01T00:00:00Z', maxUses: 1, usedCount: 1 }, NOW)).toBe('expired');
    expect(deriveCouponStatus({ isActive: true, expiresAt: null, maxUses: 1, usedCount: 1 }, NOW)).toBe('exhausted');
    expect(deriveCouponStatus({ isActive: true, expiresAt: null, maxUses: null, usedCount: 99 }, NOW)).toBe('usable');
  });
  it('CSV hücresi formül enjeksiyonunu etkisizleştirir', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('ABC')).toBe('ABC');
  });
});

describe('kupon yazımları', () => {
  it('oluşturma: tx içinde kupon + denetim; geçmiş tarih ve var olan kod reddedilir; P2002 → 409', async () => {
    const c = await createCoupon({ code: 'YAZ', type: 'percentage', value: 20, maxUses: null, expiresAt: null }, actor, null, NOW, db as never);
    expect(c.maxUses).toBeNull();
    expect(coupons.get(c.id)!.maxUses).toBe(-1);
    expect(audits[0]).toMatchObject({ action: 'CREATE_COUPON', entity: 'Coupon', entityId: c.id });
    await expect(createCoupon({ code: 'YAZ', type: 'fixed', value: 5, maxUses: null, expiresAt: null }, actor, null, NOW, db as never)).rejects.toMatchObject({ status: 409 });
    await expect(
      createCoupon({ code: 'ESKI', type: 'fixed', value: 5, maxUses: null, expiresAt: '2026-01-01T00:00:00Z' }, actor, null, NOW, db as never)
    ).rejects.toMatchObject({ status: 400 });
    db.coupon.create.mockRejectedValueOnce(new MockKnownError('P2002'));
    await expect(createCoupon({ code: 'YARIS', type: 'fixed', value: 5, maxUses: null, expiresAt: null }, actor, null, NOW, db as never)).rejects.toMatchObject({ status: 409 });
  });

  it('düzenleme: kilit, limit alt sınırı, sürüm çakışması, değişmeyende denetim yok', async () => {
    const v = new Date('2026-10-01T00:00:00Z');
    coupons.set('k1', { id: 'k1', code: 'KUL', type: 'percentage', value: 10, maxUses: 10, usedCount: 4, expiresAt: null, isActive: true, createdAt: v, updatedAt: v });
    const base = v.toISOString();
    await expect(updateCoupon('k1', { baseVersion: base, value: 50 }, actor, null, NOW, db as never)).rejects.toMatchObject({ status: 409 });
    await expect(updateCoupon('k1', { baseVersion: base, maxUses: 3 }, actor, null, NOW, db as never)).rejects.toMatchObject({ status: 400 });
    await expect(updateCoupon('k1', { baseVersion: '2026-09-01T00:00:00.000Z', maxUses: 20 }, actor, null, NOW, db as never)).rejects.toMatchObject({ status: 409 });
    const same = await updateCoupon('k1', { baseVersion: base, maxUses: 10 }, actor, null, NOW, db as never);
    expect(audits).toHaveLength(0);
    const up = await updateCoupon('k1', { baseVersion: same.updatedAt, maxUses: null, isActive: false }, actor, null, NOW, db as never);
    expect(up.maxUses).toBeNull();
    expect(up.status).toBe('inactive');
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('UPDATE_COUPON');
  });

  it('pasifleştirme idempotent: ikinci çağrı denetim yazmaz', async () => {
    coupons.set('d1', { id: 'd1', code: 'DUR', isActive: true, updatedAt: new Date() });
    expect(await deactivateCoupon('d1', actor, null, db as never)).toEqual({ changed: true });
    expect(await deactivateCoupon('d1', actor, null, db as never)).toEqual({ changed: false });
    expect(audits).toHaveLength(1);
  });

  it('toplu üretim: N benzersiz tek kullanımlık kod + denetim', async () => {
    const r = await createCouponBatch({ prefix: 'YAZ', count: 25, type: 'fixed', value: 50, expiresAt: null }, actor, null, NOW, db as never);
    expect(r.codes).toHaveLength(25);
    expect(new Set(r.codes).size).toBe(25);
    expect(r.codes.every((c) => /^YAZ-[A-Z2-9]{6}$/.test(c))).toBe(true);
    expect([...coupons.values()].every((c) => c.maxUses === 1)).toBe(true);
  });
});
