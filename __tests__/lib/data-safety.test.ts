/**
 * lib/data-safety (arşiv sözleşmesi, demo kapısı), lib/cards/lifecycle (kart durum makinesi)
 * ve lib/demo-cafes-seed (P0-27: gerçek hesabı ezmez, bilinen şifre yok, defterli puan).
 * Gerçek DB'ye GİDİLMEZ.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock(),
  isPrismaConnectivityError: () => false,
}));
const mockMint = jest.fn(async () => ({ credited: 0 }));
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...(a as [])) }));
jest.mock('@/lib/password', () => ({ hashPassword: jest.fn(async (p: string) => `hash:${p}`) }));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';
import {
  archivedListFilter,
  decideArchive,
  impactTotal,
  readArchiveIntent,
  type DeletionImpact,
} from '@/lib/data-safety/archive';
import { isDemoSeedAllowed } from '@/lib/data-safety/demo-guard';
import { checkAssign, checkStatusChange, checkUnassign } from '@/lib/cards/lifecycle';
import { seedDemoCafes } from '@/lib/demo-cafes-seed';

const db = prisma as unknown as PrismaMock;

const impact = (values: number[], blockers?: string[]): DeletionImpact => ({
  entity: 'X',
  entityId: '1',
  items: values.map((value, i) => ({ key: `k${i}`, label: `l${i}`, value })),
  ...(blockers ? { blockers } : {}),
});

describe('arşiv sözleşmesi', () => {
  it('bağlı veri + onay yok → confirm; onay → proceed; dryRun → preview; engel → blocked', () => {
    expect(decideArchive(impact([3]), { confirmed: false, dryRun: false })).toBe('confirm');
    expect(decideArchive(impact([3]), { confirmed: true, dryRun: false })).toBe('proceed');
    expect(decideArchive(impact([0]), { confirmed: false, dryRun: false })).toBe('proceed');
    expect(decideArchive(impact([3]), { confirmed: true, dryRun: true })).toBe('preview');
    expect(decideArchive(impact([0], ['yasak']), { confirmed: true, dryRun: false })).toBe('blocked');
  });

  it('negatif/NaN etki değerleri toplamı şişirmez', () => {
    expect(impactTotal(impact([-5, Number.NaN, 2]))).toBe(2);
  });

  it('onay ve önizleme sorgu ya da gövdeden okunur', () => {
    expect(readArchiveIntent({ url: 'http://x/a?confirm=archive' })).toEqual({ confirmed: true, dryRun: false });
    expect(readArchiveIntent({ url: 'http://x/a?confirm=anonymize&dryRun=1' })).toEqual({ confirmed: true, dryRun: true });
    expect(readArchiveIntent({ url: 'http://x/a?confirm=hayir' })).toEqual({ confirmed: false, dryRun: false });
    expect(readArchiveIntent({ url: 'http://x/a' }, { confirm: true })).toEqual({ confirmed: true, dryRun: false });
  });

  it('liste filtresi varsayılan olarak arşivi gizler', () => {
    expect(archivedListFilter({ url: 'http://x/a' })).toEqual({ archivedAt: null });
    expect(archivedListFilter({ url: 'http://x/a?archived=only' })).toEqual({ archivedAt: { not: null } });
    expect(archivedListFilter({ url: 'http://x/a?archived=include' })).toEqual({});
  });
});

describe('demo kapısı', () => {
  it('üretimde bayraksız kapalı, bayrakla açık; geliştirmede açık', () => {
    expect(isDemoSeedAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(isDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' })).toBe(true);
    expect(isDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'yes' })).toBe(false);
    expect(isDemoSeedAllowed({ NODE_ENV: 'development' })).toBe(true);
  });
});

describe('kart durum makinesi', () => {
  const card = (status: 'UNUSED' | 'ACTIVATED' | 'BLOCKED', customerId: string | null, archivedAt: Date | null = null) => ({ status, customerId, archivedAt });

  it('bloklu kart müşteriden kaldırılamaz; aktif kart kaldırılabilir', () => {
    expect(checkUnassign(card('BLOCKED', 'c1')).ok).toBe(false);
    expect(checkUnassign(card('ACTIVATED', 'c1')).ok).toBe(true);
    expect(checkUnassign(card('UNUSED', null)).ok).toBe(false);
  });

  it('arşivlenmiş kart terminaldir', () => {
    const archived = card('BLOCKED', null, new Date());
    expect(checkStatusChange(archived, 'UNUSED')).toMatchObject({ ok: false, code: 'CARD_ARCHIVED' });
    expect(checkAssign(archived).ok).toBe(false);
    expect(checkUnassign(card('ACTIVATED', 'c1', new Date())).ok).toBe(false);
  });

  it('blok kaldırma müşteri bağına göre tek hedefe gider', () => {
    expect(checkStatusChange(card('BLOCKED', 'c1'), 'ACTIVATED').ok).toBe(true);
    expect(checkStatusChange(card('BLOCKED', 'c1'), 'UNUSED').ok).toBe(false);
    expect(checkStatusChange(card('BLOCKED', null), 'UNUSED').ok).toBe(true);
    expect(checkStatusChange(card('BLOCKED', null), 'ACTIVATED').ok).toBe(false);
  });

  it('UNUSED→ACTIVATED ve ACTIVATED→UNUSED durum değişikliğiyle yapılamaz', () => {
    expect(checkStatusChange(card('UNUSED', null), 'ACTIVATED').ok).toBe(false);
    expect(checkStatusChange(card('ACTIVATED', 'c1'), 'UNUSED').ok).toBe(false);
    expect(checkStatusChange(card('ACTIVATED', 'c1'), 'BLOCKED').ok).toBe(true);
  });
});

describe('demo kafe tohumu (P0-27)', () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    db.__reset();
    mockMint.mockClear();
    delete process.env.DEMO_CAFE_PASSWORD;
  });
  afterAll(() => {
    process.env = ENV;
  });

  it('bilinen şifre yok, hesaplar isDemo, başlangıç puanı defterli basılır', async () => {
    db.user.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    const res = await seedDemoCafes('admin-1');
    expect(res.cafes).toBe(3);
    for (const [args] of db.user.create.mock.calls) {
      expect(args.data.isDemo).toBe(true);
      expect(args.data.password).toBeNull();
      expect(args.data.points).toBeUndefined(); // defter dışı puan yazılmaz
    }
    expect(mockMint).toHaveBeenCalled();
    const mintArgs = mockMint.mock.calls[0] as unknown as [unknown, { source: string; idempotencyKey: string }];
    expect(mintArgs[1].source).toBe('demo_seed');
    expect(mintArgs[1].idempotencyKey).toMatch(/^demo_seed:/);
  });

  it('aynı e-postada GERÇEK hesap varsa ezmez, atlar', async () => {
    db.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === 'cafe-aroma@qratex.com' ? { id: 'real-dealer', isDemo: false } : null
    );
    db.user.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    const res = await seedDemoCafes('admin-1');
    expect(res.skipped).toContain('cafe-aroma@qratex.com');
    expect(res.cafes).toBe(2);
    expect(db.user.update.mock.calls.find(([a]) => a.where.id === 'real-dealer')).toBeUndefined();
  });

  it('eski sürümün demo hesabında bilinen şifre kaldırılır', async () => {
    db.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === 'demo-musteri-1@qratex.com' ? { id: 'demo-customer-1', isDemo: false } : null
    );
    db.user.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id }));
    await seedDemoCafes('admin-1');
    const upd = db.user.update.mock.calls.find(([a]) => a.where.id === 'demo-customer-1');
    expect(upd?.[0].data).toEqual({ isDemo: true, password: null });
  });
});
