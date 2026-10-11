/**
 * Admin → Fiziksel Kartlar (Dalga 2) sunucu mantığı — prisma mock'lu.
 *  - Sözleşme: kart URL'si/boşluklu kod aramada tokena iner, blok gerekçesi zorunlu.
 *  - Durum makinesi: toplu blok/blok kaldır/arşiv uygun olmayan kartı atlar, bloklu bağsız kart
 *    UNUSED'a, bağlı kart ACTIVATED'a döner; arada değişen kart (koşullu yazım 0) atlanır.
 *  - Üretim: çift token yeniden üretilir, sayı createMany dönüşünden gelir, denetim aynı tx'te.
 *  - İstanbul gün sınırı.
 */
type Row = Record<string, unknown>;
const cards = new Map<string, Row>();
const cardAudits: Row[] = [];
const audits: Row[] = [];
const notifications: Row[] = [];
const created: Row[] = [];
let conflictIds = new Set<string>();

const tx = {
  physicalCard: {
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const c = cards.get(where.id as string);
      if (!c || conflictIds.has(c.id as string) || c.status !== where.status || (c.archivedAt ?? null) !== null) return { count: 0 };
      Object.assign(c, data);
      return { count: 1 };
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const d of data) {
        if (created.some((x) => x.token === d.token) || d.token === 'DUP') continue;
        created.push(d);
        count++;
      }
      return { count };
    }),
  },
  cardAuditLog: { create: jest.fn(async ({ data }: { data: Row }) => cardAudits.push(data)) },
  auditLog: { create: jest.fn(async ({ data }: { data: Row }) => audits.push(data)) },
  notification: { createMany: jest.fn(async ({ data }: { data: Row[] }) => notifications.push(...data)) },
  cardBatch: { create: jest.fn(async ({ data }: { data: Row }) => ({ ...data, createdAt: new Date('2026-10-10T10:00:00Z') })) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    physicalCard: {
      findMany: jest.fn(async ({ where }: { where: Row }) => {
        const ids = (where.id as { in?: string[] } | undefined)?.in;
        return [...cards.values()].filter((c) => (ids ? ids.includes(c.id as string) : c.batchId === where.batchId)).map((c) => ({ ...c }));
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));

import { bulkBodySchema, composeBlockReason, generateBodySchema, normalizeCardSearch } from '@/lib/admin-cards/contract';
import { allowedActions, buildCardWhere, bulkCards, generateBatch, istanbulDayStart } from '@/lib/admin-cards/server';

const actor = { id: 'admin-1' };
const meta = { ipAddress: null, userAgent: null };

function seed(rows: Row[]) {
  cards.clear();
  for (const r of rows) cards.set(r.id as string, { customerId: null, archivedAt: null, blockedAt: null, blockReason: null, batchId: 'B1', ...r });
}

beforeEach(() => {
  cardAudits.length = 0;
  audits.length = 0;
  notifications.length = 0;
  created.length = 0;
  conflictIds = new Set();
  jest.clearAllMocks();
});

describe('sözleşme', () => {
  it('kart bağlantısını ve boşluklu kodu tokena indirger (büyük/küçük harf korunur)', () => {
    expect(normalizeCardSearch('https://qratex.com/c/AbCd1234Ef?utm=x')).toBe('AbCd1234Ef');
    expect(normalizeCardSearch('AbCd 1234 Ef')).toBe('AbCd1234Ef');
    expect(normalizeCardSearch('ali veli')).toBe('aliveli');
    expect(normalizeCardSearch('  ')).toBeUndefined();
  });

  it('blok gerekçe kodu zorunlu, "Diğer" açıklama ister, ids ve batchId birlikte verilemez', () => {
    expect(bulkBodySchema.safeParse({ action: 'block', ids: ['a'] }).success).toBe(false);
    expect(bulkBodySchema.safeParse({ action: 'block', ids: ['a'], reasonCode: 'OTHER' }).success).toBe(false);
    expect(bulkBodySchema.safeParse({ action: 'block', ids: ['a'], reasonCode: 'LOST' }).success).toBe(true);
    expect(bulkBodySchema.safeParse({ action: 'unblock', ids: ['a'], batchId: 'B1' }).success).toBe(false);
    expect(bulkBodySchema.safeParse({ action: 'unblock' }).success).toBe(false);
    expect(composeBlockReason('STOLEN', ' çanta ')).toBe('Çalıntı: çanta');
  });

  it('üretim gövdesi: 1–10.000 tam sayı, önek alfanümerik', () => {
    expect(generateBodySchema.safeParse({ batchName: 'Ekim', quantity: 0 }).success).toBe(false);
    expect(generateBodySchema.safeParse({ batchName: 'Ekim', quantity: 10001 }).success).toBe(false);
    expect(generateBodySchema.safeParse({ batchName: 'Ekim', quantity: 5, prefix: 'Q-1' }).success).toBe(false);
    expect(generateBodySchema.safeParse({ batchName: 'Ekim', quantity: 5, prefix: '' }).data?.prefix).toBeUndefined();
  });
});

describe('liste filtresi', () => {
  it('varsayılan arşivi gizler, ARCHIVED yalnız arşivi gösterir, idle aktif + 30 gün tüketimsiz', () => {
    expect(buildCardWhere({}).AND).toContainEqual({ archivedAt: null });
    expect(buildCardWhere({ status: 'ARCHIVED' }).AND).toContainEqual({ archivedAt: { not: null } });
    const idle = buildCardWhere({ usage: 'idle' }, new Date('2026-10-31T00:00:00Z')).AND as Row[];
    expect(idle).toContainEqual({ status: 'ACTIVATED', consumptions: { none: { createdAt: { gte: new Date('2026-10-01T00:00:00Z') } } } });
  });

  it('İstanbul gün başlangıcı (UTC+3)', () => {
    expect(istanbulDayStart(new Date('2026-10-10T22:30:00Z')).toISOString()).toBe('2026-10-10T21:00:00.000Z');
    expect(istanbulDayStart(new Date('2026-10-10T20:00:00Z'), 6).toISOString()).toBe('2026-10-03T21:00:00.000Z');
  });

  it('izinli aksiyonlar durum makinesinden türer (bloklu kartta "müşteriden kaldır" yok)', () => {
    const blocked = allowedActions({ status: 'BLOCKED', customerId: 'u1', archivedAt: null });
    expect(blocked.allowed.unassign).toBe(false);
    expect(blocked.unblockTo).toBe('ACTIVATED');
    expect(allowedActions({ status: 'BLOCKED', customerId: null, archivedAt: null }).unblockTo).toBe('UNUSED');
    const archived = allowedActions({ status: 'BLOCKED', customerId: null, archivedAt: new Date() });
    expect(Object.values(archived.allowed).some(Boolean)).toBe(false);
  });
});

describe('toplu işlem', () => {
  it('blok: uygun kartları gerekçeyle bloklar, zaten bloklu/arşivliyi atlar, bağlı müşteriye bildirir', async () => {
    seed([
      { id: 'c1', token: 'T1', status: 'UNUSED' },
      { id: 'c2', token: 'T2', status: 'ACTIVATED', customerId: 'u2' },
      { id: 'c3', token: 'T3', status: 'BLOCKED' },
      { id: 'c4', token: 'T4', status: 'BLOCKED', archivedAt: new Date() },
    ]);
    const r = await bulkCards({ action: 'block', ids: ['c1', 'c2', 'c3', 'c4'], reasonCode: 'LOST', notify: true }, actor, meta);
    expect(r.done).toBe(2);
    expect(r.skipped.map((s) => s.id).sort()).toEqual(['c3', 'c4']);
    expect(cards.get('c2')).toMatchObject({ status: 'BLOCKED', blockReason: 'Kayıp', customerId: 'u2' });
    expect(cardAudits).toHaveLength(2);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'CARDS_BLOCKED' });
    expect(notifications.map((n) => n.userId)).toEqual(['u2']);
  });

  it('blok kaldır: bağlı kart ACTIVATED, bağsız kart UNUSED olur ve blok alanları temizlenir', async () => {
    seed([
      { id: 'c1', token: 'T1', status: 'BLOCKED', customerId: 'u1', blockedAt: new Date(), blockReason: 'Kayıp' },
      { id: 'c2', token: 'T2', status: 'BLOCKED', blockedAt: new Date(), blockReason: 'Kayıp' },
      { id: 'c3', token: 'T3', status: 'UNUSED' },
    ]);
    const r = await bulkCards({ action: 'unblock', ids: ['c1', 'c2', 'c3'] }, actor, meta);
    expect(r.done).toBe(2);
    expect(cards.get('c1')).toMatchObject({ status: 'ACTIVATED', blockReason: null, blockedAt: null });
    expect(cards.get('c2')).toMatchObject({ status: 'UNUSED', blockReason: null });
    expect(r.skipped).toEqual([{ id: 'c3', token: 'T3', reason: 'Bloklu değil' }]);
  });

  it('arada değişen kart (koşullu yazım 0) atlanır ve denetime yazılmaz', async () => {
    seed([
      { id: 'c1', token: 'T1', status: 'UNUSED' },
      { id: 'c2', token: 'T2', status: 'UNUSED' },
    ]);
    conflictIds = new Set(['c2']);
    const r = await bulkCards({ action: 'archive', ids: ['c1', 'c2'] }, actor, meta);
    expect(r.done).toBe(1);
    expect(r.skipped[0]).toMatchObject({ id: 'c2' });
    expect(cardAudits).toHaveLength(1);
    expect(cards.get('c1')).toMatchObject({ status: 'BLOCKED' });
    expect(cards.get('c1')!.archivedAt).toBeInstanceOf(Date);
  });

  it('dryRun hiçbir şey yazmaz; parti hedefi partideki kartları seçer', async () => {
    seed([
      { id: 'c1', token: 'T1', status: 'UNUSED', batchId: 'B9' },
      { id: 'c2', token: 'T2', status: 'UNUSED', batchId: 'B1' },
    ]);
    const r = await bulkCards({ action: 'block', batchId: 'B9', reasonCode: 'SHIPMENT', dryRun: true }, actor, meta);
    expect(r).toMatchObject({ matched: 1, done: 1, dryRun: true });
    expect(cards.get('c1')!.status).toBe('UNUSED');
    expect(audits).toHaveLength(0);
  });
});

describe('üretim', () => {
  it('çift token yeniden üretilir, oluşturulan sayı createMany dönüşünden gelir, denetim aynı tx', async () => {
    const seq = ['SEED0000', 'A', 'A', 'DUP', 'B', 'C'];
    let i = 0;
    const make = () => seq[i++] ?? `X${i}`;
    const r = await generateBatch({ batchName: 'Ekim', quantity: 3 }, actor, meta, make);
    expect(r.created).toBe(3);
    expect(created.map((c) => c.token).sort()).toEqual(['A', 'B', 'C']);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'CARDS_GENERATED', entity: 'CardBatch' });
    expect(r.batch.id).toMatch(/^BATCH_\d{8}_/);
  });
});
