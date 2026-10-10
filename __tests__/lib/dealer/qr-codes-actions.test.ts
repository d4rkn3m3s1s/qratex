/**
 * /dealer/qr-codes yazma katmanı — kota (D5), arşiv (C1, silme yok), rotate kota-nötr,
 * şube kotası. Prisma bellek içi sahte.
 */
type Qr = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dealerId: string;
  isActive: boolean;
  revokedAt: Date | null;
  archivedAt: Date | null;
  expiresAt: Date | null;
  segmentConfig: unknown;
  locationId: string | null;
};
type Loc = { id: string; dealerId: string; name: string; isActive: boolean; address: string | null };

const qrs = new Map<string, Qr>();
const locs = new Map<string, Loc>();
const audits: string[] = [];
const events: Array<Record<string, unknown>> = [];
let seq = 0;

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = row[k];
    if (v === null) {
      if (cur !== null) return false;
    } else if (typeof v === 'object' && v !== null && 'in' in (v as object)) {
      if (!(v as { in: unknown[] }).in.includes(cur)) return false;
    } else if (typeof v === 'object' && v !== null && 'not' in (v as object)) {
      if (cur === null) return false;
    } else if (cur !== v) return false;
  }
  return true;
}

const db = {
  qRCode: {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...qrs.values()].find((q) => matches(q, where)) ?? null),
    findMany: jest.fn(async ({ where }: { where: { code?: { in: string[] } } }) =>
      [...qrs.values()].filter((q) => (where.code ? where.code.in.includes(q.code) : true))
    ),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...qrs.values()].filter((q) => matches(q, where)).length),
    create: jest.fn(async ({ data }: { data: Partial<Qr> }) => {
      const row: Qr = {
        id: `qr_${++seq}`,
        description: null,
        isActive: true,
        revokedAt: null,
        archivedAt: null,
        expiresAt: null,
        segmentConfig: null,
        locationId: null,
        ...(data as Qr),
      };
      qrs.set(row.id, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Qr> }) => {
      const q = qrs.get(where.id)!;
      Object.assign(q, data);
      return q;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Qr> }) => {
      let count = 0;
      for (const q of qrs.values()) {
        if (matches(q, where)) {
          Object.assign(q, data);
          count++;
        }
      }
      return { count };
    }),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  dealerLocation: {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...locs.values()].find((l) => matches(l, where)) ?? null),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...locs.values()].filter((l) => matches(l, where)).length),
    create: jest.fn(async ({ data }: { data: Omit<Loc, 'id' | 'isActive'> }) => {
      const row: Loc = { id: `loc_${++seq}`, isActive: true, ...data };
      locs.set(row.id, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Loc> }) => Object.assign(locs.get(where.id)!, data)),
  },
  auditLog: { create: jest.fn(async ({ data }: { data: { action: string } }) => audits.push(data.action)) },
  analyticsEvent: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => events.push(data)) },
  $executeRaw: jest.fn(async () => 1),
};

jest.mock('@/lib/prisma', () => ({
  prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
  isPrismaConnectivityError: () => false,
}));
jest.mock('@prisma/client', () => ({
  Prisma: { DbNull: 'DbNull', JsonNull: 'JsonNull', PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
const limits = { maxQRCodes: 3 as number | null, maxBranches: 1 as number | null, planName: 'Ücretsiz' };
jest.mock('@/lib/plan-limits', () => ({ getDealerPlanLimits: jest.fn(async () => limits) }));
let codeSeq = 0;
jest.mock('@/lib/utils', () => ({ generateQRCode: () => `CODE${String(++codeSeq).padStart(4, '0')}` }));

import { bulkQr, createLocation, createQrCodes, qrLifecycle, updateLocation, updateQrCode } from '@/lib/dealer/qr-codes/actions.server';
import { qrCreateSchema } from '@/lib/dealer/qr-codes/rules';

const actor = { dealerId: 'd1', actorId: 'd1' };
const live = () => [...qrs.values()].filter((q) => q.dealerId === 'd1' && !q.revokedAt && !q.archivedAt).length;

function seed(id: string, extra: Partial<Qr> = {}) {
  qrs.set(id, {
    id,
    code: `C_${id}`,
    name: `Masa ${id}`,
    description: null,
    dealerId: 'd1',
    isActive: true,
    revokedAt: null,
    archivedAt: null,
    expiresAt: null,
    segmentConfig: null,
    locationId: null,
    ...extra,
  });
}

beforeEach(() => {
  qrs.clear();
  locs.clear();
  audits.length = 0;
  events.length = 0;
  limits.maxQRCodes = 3;
  limits.maxBranches = 1;
  jest.clearAllMocks();
});

describe('oluşturma ve kota', () => {
  it('seri, kotaya sığmıyorsa hiç kod oluşturmaz (402 PLAN_LIMIT_REACHED)', async () => {
    seed('a');
    const input = qrCreateSchema.parse({ mode: 'series', prefix: 'Masa', from: 1, to: 3 });
    await expect(createQrCodes(actor, input)).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED', status: 402 });
    expect(qrs.size).toBe(1);
  });

  it('seri kotaya sığınca numaralı adlarla oluşturur ve denetim kaydı yazar', async () => {
    const input = qrCreateSchema.parse({ mode: 'series', prefix: 'Masa', from: 4, to: 6 });
    const r = await createQrCodes(actor, input);
    expect(r.created.map((c) => c.name)).toEqual(['Masa 4', 'Masa 5', 'Masa 6']);
    expect(new Set(r.created.map((c) => c.code)).size).toBe(3);
    expect(audits).toContain('CREATE_QR_SERIES');
  });

  it('iptal ve arşiv kotayı boşaltır', async () => {
    seed('a');
    seed('b', { revokedAt: new Date() });
    seed('c', { archivedAt: new Date(), revokedAt: new Date() });
    const r = await createQrCodes(actor, qrCreateSchema.parse({ mode: 'single', name: 'Kasa' }));
    expect(r.created).toHaveLength(1);
  });

  it('başka bayinin ya da arşivli şubesine bağlanamaz', async () => {
    locs.set('L1', { id: 'L1', dealerId: 'd2', name: 'X', isActive: true, address: null });
    locs.set('L2', { id: 'L2', dealerId: 'd1', name: 'Y', isActive: false, address: null });
    await expect(createQrCodes(actor, qrCreateSchema.parse({ mode: 'single', name: 'Kasa', locationId: 'L1' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createQrCodes(actor, qrCreateSchema.parse({ mode: 'single', name: 'Kasa', locationId: 'L2' }))).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('seri 50 kodu aşamaz (şema)', () => {
    expect(qrCreateSchema.safeParse({ mode: 'series', prefix: 'Masa', from: 1, to: 51 }).success).toBe(false);
    expect(qrCreateSchema.safeParse({ mode: 'series', prefix: 'Masa', from: 5, to: 4 }).success).toBe(false);
  });
});

describe('yaşam döngüsü', () => {
  it('rotate kota-nötr: limitteyken de çalışır, ayarları taşır, zincir olayı yazar', async () => {
    seed('a', { locationId: 'L', segmentConfig: { paket: { welcomeText: 'Merhaba' } } });
    seed('b');
    seed('c');
    const r = await qrLifecycle(actor, 'a', 'rotate');
    expect(live()).toBe(3);
    const fresh = qrs.get(r.id)!;
    expect(fresh.locationId).toBe('L');
    expect(fresh.segmentConfig).toEqual({ paket: { welcomeText: 'Merhaba' } });
    expect(qrs.get('a')!.revokedAt).toBeInstanceOf(Date);
    expect(events[0]).toMatchObject({ event: 'qr_code_rotated', data: expect.objectContaining({ oldQrCodeId: 'a', newQrCodeId: r.id }) });
  });

  it('rotate + iptali geri alma döngüsüyle kota aşılamaz', async () => {
    seed('a');
    seed('b');
    seed('c');
    await qrLifecycle(actor, 'a', 'rotate');
    await expect(qrLifecycle(actor, 'a', 'unrevoke')).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    expect(live()).toBe(3);
  });

  it('arşiv silmez; arşivden geri alma kotayı denetler', async () => {
    seed('a');
    await qrLifecycle(actor, 'a', 'archive');
    expect(qrs.has('a')).toBe(true);
    expect(db.qRCode.delete).not.toHaveBeenCalled();
    expect(db.qRCode.deleteMany).not.toHaveBeenCalled();
    seed('b');
    seed('c');
    seed('d');
    await expect(qrLifecycle(actor, 'a', 'restore')).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    await qrLifecycle(actor, 'd', 'archive');
    const r = await qrLifecycle(actor, 'a', 'restore');
    expect(r.changed).toBe(true);
    expect(qrs.get('a')!.archivedAt).toBeNull();
    expect(qrs.get('a')!.revokedAt).toBeNull();
  });

  it('arşivden önce iptal edilmiş kod geri alınınca iptal kalır (kota harcamaz)', async () => {
    seed('a', { revokedAt: new Date('2026-01-01') });
    await qrLifecycle(actor, 'a', 'archive');
    seed('b');
    seed('c');
    seed('d');
    const r = await qrLifecycle(actor, 'a', 'restore');
    expect(r.changed).toBe(true);
    expect(qrs.get('a')!.revokedAt).not.toBeNull();
  });

  it('başka bayinin koduna dokunamaz', async () => {
    seed('x', { dealerId: 'd2' });
    await expect(qrLifecycle(actor, 'x', 'archive')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('arşivdeki kod düzenlenemez; açıklama verilmezse silinmez', async () => {
    seed('a', { description: 'Bahçe' });
    await updateQrCode(actor, 'a', { name: 'Bahçe 1', description: undefined });
    expect(qrs.get('a')!.description).toBe('Bahçe');
    expect(qrs.get('a')!.name).toBe('Bahçe 1');
    await qrLifecycle(actor, 'a', 'archive');
    await expect(updateQrCode(actor, 'a', { name: 'Yeni ad', description: undefined })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('toplu işlem iptal/arşiv kodlarını ve başka bayiyi atlar', async () => {
    seed('a', { isActive: false });
    seed('b', { isActive: false, revokedAt: new Date() });
    seed('x', { dealerId: 'd2', isActive: false });
    const r = await bulkQr(actor, 'activate', ['a', 'b', 'x']);
    expect(r).toEqual({ count: 1, skipped: 2 });
    expect(qrs.get('x')!.isActive).toBe(false);
  });
});

describe('şubeler', () => {
  it('şube kotası etkin şubeleri sayar; arşivlenen şube hak boşaltır', async () => {
    const a = await createLocation(actor, { name: 'Merkez', address: null });
    await expect(createLocation(actor, { name: 'Kadıköy', address: null })).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    await updateLocation(actor, a.id, { action: 'archive' });
    expect(locs.get(a.id)!.isActive).toBe(false);
    await createLocation(actor, { name: 'Kadıköy', address: null });
    await expect(updateLocation(actor, a.id, { action: 'restore' })).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });
});
