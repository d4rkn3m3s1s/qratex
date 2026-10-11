/**
 * /admin/donations — sözleşme ve sunucu çekirdeği. Gerçek DB yok; prisma sahte.
 *
 * Kapsanan bulgular (docs/audit/2026-10-08/admin/admin_donations.md):
 *  - B4: goal 0 / perPoint 0 / bilinmeyen kategori reddedilir (müşteriyle aynı sözleşme).
 *  - B2: yaşam döngüsü mevcut alanlardan türetilir ("Soft Freeze" yok).
 *  - B8: durum/uzlaştırma denetim kaydıyla aynı transaction'da.
 *  - B14: uzlaştırma gerçek toplamla; arada bağış geldiyse 409.
 *  - B15: CSV hücre kaçışı (formül enjeksiyonu, ayraç) + BOM.
 *  - İyimser kilit: başka biri değiştirdiyse PATCH 409.
 */
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: async () => ({}) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/economy', () => ({ debitPoints: jest.fn(), InsufficientPointsError: class extends Error {} }));

import { buildProjectQs, impactFor, projectActionSchema, projectStatus, projectUpsertSchema, ratioText } from '@/lib/admin-donations/contract';
import { csvCell, exportTransactionsCsv, istanbulDay, lastDays, projectAction, statusWhere, transactionWhere, updateProject } from '@/lib/admin-donations/server';

const valid = {
  name: 'Temiz su',
  description: 'Köylere temiz içme suyu ulaştırmak için kuyu açıyoruz.',
  icon: '💧',
  category: 'water',
  goal: 10000,
  impact: { unit: 'litre', label: 'Temiz su', perPoint: 0.1 },
  tags: ['Temel İhtiyaç'],
  isFeatured: false,
  isActive: true,
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: null,
};

describe('projectUpsertSchema', () => {
  it('geçerli kampanyayı kabul eder', () => {
    expect(projectUpsertSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ['hedef 0', { goal: 0 }],
    ['oran 0', { impact: { ...valid.impact, perPoint: 0 } }],
    ['bilinmeyen kategori', { category: 'su' }],
    ['bitiş başlangıçtan önce', { endDate: '2026-09-01T00:00:00.000Z' }],
    ['tekrarlı etiket', { tags: ['Afrika', 'afrika'] }],
    ['boş ad', { name: ' ' }],
  ])('%s → reddedilir', (_n, over) => {
    expect(projectUpsertSchema.safeParse({ ...valid, ...over }).success).toBe(false);
  });
  it('arşiv/uzlaştırma gerekçe ister', () => {
    expect(projectActionSchema.safeParse({ action: 'archive' }).success).toBe(false);
    expect(projectActionSchema.safeParse({ action: 'archive', reason: 'Kampanya bitti' }).success).toBe(true);
    expect(projectActionSchema.safeParse({ action: 'activate' }).success).toBe(true);
  });
});

describe('türetilmiş durum', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const base = { isActive: true, archivedAt: null, startDate: '2026-10-01T00:00:00Z', endDate: null };
  it('arşiv > kapalı > planlı > süresi dolmuş > canlı', () => {
    expect(projectStatus({ ...base, archivedAt: '2026-10-05T00:00:00Z' }, now)).toBe('archived');
    expect(projectStatus({ ...base, isActive: false }, now)).toBe('inactive');
    expect(projectStatus({ ...base, startDate: '2026-11-01T00:00:00Z' }, now)).toBe('scheduled');
    expect(projectStatus({ ...base, endDate: '2026-10-10T00:00:00Z' }, now)).toBe('ended');
    expect(projectStatus(base, now)).toBe('live');
  });
  it('liste filtresi de aynı kuralı Prisma koşuluna çevirir', () => {
    expect(statusWhere('live', now)).toMatchObject({ archivedAt: null, isActive: true, startDate: { lte: now } });
    expect(statusWhere('archived', now)).toEqual({ archivedAt: { not: null } });
  });
  it('oran metni ve etki hesabı müşteriyle aynı (yuvarlama yok, 2 ondalık)', () => {
    expect(ratioText({ unit: 'litre', label: 'Su', perPoint: 0.1 })).toBe('100 puan = 10 litre');
    expect(impactFor(99, 0.01)).toBe(0.99);
  });
  it('liste sorgu dizesi kararlı', () => {
    expect(buildProjectQs({ page: 1, size: 20 })).toBe('sort=newest&page=1&size=20');
  });
});

describe('İstanbul günleri', () => {
  it('UTC 22:30 → ertesi İstanbul günü; son 30 gün eski→yeni', () => {
    expect(istanbulDay(new Date('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
    const d = lastDays(30, new Date('2026-10-11T09:00:00Z'));
    expect(d).toHaveLength(30);
    expect(d[29]).toBe('2026-10-11');
    expect(d[0]).toBe('2026-09-12');
  });
  it('işlem filtresi: bitiş günü dahil (ertesi gün 00:00 TSİ hariç sınır)', () => {
    const w = transactionWhere({ from: '2026-10-01', to: '2026-10-02' }) as { AND: Array<{ createdAt: Record<string, Date> }> };
    expect(w.AND[0].createdAt.gte.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(w.AND[1].createdAt.lt.toISOString()).toBe('2026-10-02T21:00:00.000Z');
  });
});

describe('CSV', () => {
  it('formül enjeksiyonu ve ayraç kaçışı', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x"y;')).toBe('"x""y;"');
  });
  it('BOM + başlık + makbuz no', async () => {
    const db = {
      donation: {
        findMany: jest.fn(async () => [
          {
            id: 'cldonation12345678',
            points: 150,
            message: '-tehlike',
            isPublic: false,
            createdAt: new Date('2026-10-10T10:00:00Z'),
            user: { id: 'u1', name: 'Ayşe', email: 'a@x.com' },
            project: { id: 'p1', name: 'Su', icon: '💧', category: 'water' },
          },
        ]),
      },
    };
    const r = await exportTransactionsCsv(db as never, {});
    expect(r.csv.startsWith('﻿Makbuz No;')).toBe(true);
    expect(r.csv).toContain('QX-B-12345678');
    expect(r.csv).toContain("'-tehlike");
    expect(r.rows).toBe(1);
  });
});

describe('yazma çekirdeği', () => {
  const actor = { id: 'admin1', type: 'user' as const };
  const project = {
    id: 'p1',
    name: 'Su',
    description: 'd',
    icon: '💧',
    category: 'water',
    goal: 1000,
    current: 3250,
    impact: { unit: 'litre', label: 'Su', perPoint: 0.1 },
    tags: [],
    isActive: true,
    isFeatured: false,
    archivedAt: null as Date | null,
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-05T00:00:00Z'),
  };
  function makeDb(over: Partial<typeof project> = {}, sum = 120) {
    const audit = jest.fn();
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...project, ...over, ...data }));
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      donationProject: {
        findUnique: jest.fn(async () => ({ ...project, ...over })),
        findUniqueOrThrow: jest.fn(async () => ({ ...project, ...over })),
        update,
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      donation: { aggregate: jest.fn(async () => ({ _sum: { points: sum } })) },
      auditLog: { create: audit },
    };
    return { db: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }, tx, audit, update };
  }

  it('uzlaştırma: ilerleme gerçek toplama eşitlenir + denetim (puan basılmaz)', async () => {
    const { db, audit, update } = makeDb();
    const r = await projectAction(db as never, 'p1', { action: 'reconcile', reason: 'Tohum verisi', expectedTotal: 120 }, actor);
    expect(r.current).toBe(120);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { current: 120 } }));
    const data = (audit.mock.calls[0] as unknown as [{ data: { action: string; newData: Record<string, unknown> } }])[0].data;
    expect(data.action).toBe('DONATION_PROJECT_RECONCILE');
    expect(data.newData).toMatchObject({ from: 3250, to: 120, reason: 'Tohum verisi' });
  });

  it('uzlaştırma: arada bağış geldiyse 409, yazma yok', async () => {
    const { db, update, audit } = makeDb({}, 150);
    await expect(projectAction(db as never, 'p1', { action: 'reconcile', reason: 'Tohum verisi', expectedTotal: 120 }, actor)).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('arşivdeki kampanya bağışa açılamaz; arşiv geçmişi korur (silme yok)', async () => {
    const archived = makeDb({ archivedAt: new Date('2026-10-06T00:00:00Z') });
    await expect(projectAction(archived.db as never, 'p1', { action: 'activate' }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    const live = makeDb();
    await projectAction(live.db as never, 'p1', { action: 'archive', reason: 'Kampanya bitti' }, actor);
    expect(live.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false, isFeatured: false, archivedAt: expect.any(Date) }) }));
  });

  it('PATCH: sürüm değiştiyse 409 ve denetim yazılmaz', async () => {
    const { db, audit } = makeDb();
    const values = projectUpsertSchema.parse(valid);
    await expect(updateProject(db as never, 'p1', { values, baseUpdatedAt: '2026-10-04T00:00:00.000Z' }, actor)).rejects.toMatchObject({ status: 409 });
    expect(audit).not.toHaveBeenCalled();
  });
});
