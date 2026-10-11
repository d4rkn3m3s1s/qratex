/**
 * Özellik ve Deney Kontrolü — sunucu mantığı (prisma mock): modül aç/kapa (etkisiz anahtar kilidi,
 * iyimser kilit 409, aynı işlemde denetim, önbellek tazeleme), kademeli açılış (yalnız kapılı modül,
 * yetim kayıt kilidi), deney yaşam döngüsü (geçiş kuralları, başlamış deneyde varyant kilidi,
 * taslak silme), atama denetleyicisinin varyant ucuyla aynı hesabı vermesi ve modül kapısının
 * açılış kuralını uygulaması.
 */
/** @jest-environment node */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));
jest.mock('@/lib/redis', () => ({ cachedJson: jest.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()) }));

const cfgStore: { experiments: Record<string, unknown>[] } = { experiments: [] };
jest.mock('@/lib/innovation-config', () => ({
  INNOVATION_PLATFORM_SETTINGS_KEY: 'innovationPlatform',
  getInnovationPlatformConfig: jest.fn(async () => ({ campaignAb: { defaultSplitPercentForB: 50, experiments: cfgStore.experiments } })),
}));

const tx = {
  settings: { findUnique: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn() },
  auditLog: { create: jest.fn() },
  featureFlag: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
};
const db = {
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  settings: { findUnique: jest.fn() },
  featureFlag: { findMany: jest.fn() },
  user: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(async () => []) },
  analyticsEvent: { create: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { revalidateTag } from 'next/cache';
import { diffLegacyModules, enforcementOf, patchModule } from '@/lib/admin-flags/modules.server';
import { upsertRollout } from '@/lib/admin-flags/flags.server';
import { actOnExperiment, applyDimensionFields, checkAssignment, createExperiment, statusOf } from '@/lib/admin-flags/experiments.server';
import { ROLLOUT_CACHE_TAG } from '@/lib/admin-flags/rollout.server';
import { MODULE_GATE_CACHE_TAG, assertModuleEnabled } from '@/lib/module-gate';
import { pickAbVariant } from '@/lib/innovation-ab';
import { rolloutBucket } from '@/lib/admin-flags/rollout';
import bindings from '@/lib/data/module-gate-bindings.json';

const ctx = { actor: { id: 'admin1', email: 'a@x.com', role: 'ADMIN', name: 'Ada' }, request: null };
const T0 = new Date('2026-10-10T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  cfgStore.experiments = [];
});

describe('modüller', () => {
  it('önbellek etiketi modül kapısıyla aynı', () => {
    expect(ROLLOUT_CACHE_TAG).toBe(MODULE_GATE_CACHE_TAG);
  });

  it('zorlama seviyesi bağlardan türetilir', () => {
    expect(enforcementOf({ api: [{ endpoint: '/x', methods: ['GET'], file: 'f' }], pages: [], server: [], landing: [], menu: ['m'] })).toBe('api');
    expect(enforcementOf({ api: [], pages: [], server: [], landing: [], menu: ['m'] })).toBe('menu');
    expect(enforcementOf({ api: [], pages: [], server: [], landing: [], menu: [] })).toBe('none');
  });

  it('eski Ayar Merkezi yazımından modül bazlı fark çıkarır', () => {
    expect(diffLegacyModules({ squads: true, quests: true }, { squads: false, quests: true })).toEqual([{ key: 'squads', from: true, to: false }]);
  });

  it('etkisiz anahtar kapatılamaz (409)', async () => {
    const inert = ['webhooks', 'seo_engine', 'observability', 'audit_logs'].find((k) => !(bindings as { keys: Record<string, unknown> }).keys[k]);
    expect(inert).toBeDefined();
    await expect(patchModule(ctx, inert!, { enabled: false, reason: 'test gerekçesi', baseVersion: null })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('iyimser kilit: sürüm farklıysa 409, yazım yok', async () => {
    tx.settings.findUnique.mockResolvedValue({ value: {}, updatedAt: T0 });
    await expect(patchModule(ctx, 'squads', { enabled: false, reason: 'olay müdahalesi', baseVersion: '2020-01-01T00:00:00.000Z' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(tx.settings.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('kapatma: koşullu yazım + aynı işlemde denetim + kapı önbelleği tazelenir', async () => {
    tx.settings.findUnique.mockResolvedValue({ value: { squads: true }, updatedAt: T0 });
    tx.settings.updateMany.mockResolvedValue({ count: 1 });
    tx.settings.findUniqueOrThrow.mockResolvedValue({ updatedAt: new Date('2026-10-10T10:05:00.000Z') });
    const res = await patchModule(ctx, 'squads', { enabled: false, reason: 'olay müdahalesi', baseVersion: T0.toISOString() });
    expect(res).toEqual({ key: 'squads', enabled: false, version: '2026-10-10T10:05:00.000Z' });
    expect(tx.settings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'moduleControls', updatedAt: T0 } }));
    expect(tx.settings.updateMany.mock.calls[0][0].data.value.squads).toBe(false);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'module.disable', entity: 'ModuleControl', entityId: 'squads' }) })
    );
    expect(revalidateTag).toHaveBeenCalledWith(MODULE_GATE_CACHE_TAG, { expire: 0 });
  });

  it('değişiklik yoksa 400', async () => {
    tx.settings.findUnique.mockResolvedValue({ value: { squads: true }, updatedAt: T0 });
    await expect(patchModule(ctx, 'squads', { enabled: true, reason: 'gereksiz', baseVersion: T0.toISOString() })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('kademeli açılış', () => {
  const body = { active: true, percent: 20, allowUserIds: [] as string[], expiresAt: null, note: null, reason: 'ilk deneme', baseUpdatedAt: null as string | null };

  it('kapısı olmayan modülde reddedilir', async () => {
    await expect(upsertRollout(ctx, 'landing_marquee', body)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('katalog dışı anahtar 404', async () => {
    await expect(upsertRollout(ctx, 'dark_mode', body)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('yeni kural oluşturur ve denetler', async () => {
    tx.featureFlag.findUnique.mockResolvedValue(null);
    tx.featureFlag.create.mockResolvedValue({ id: 'ff1' });
    await expect(upsertRollout(ctx, 'squads', body)).resolves.toBe('ff1');
    expect(tx.featureFlag.create.mock.calls[0][0].data).toMatchObject({ key: 'squads', isEnabled: true, metadata: { kind: 'module_rollout', percent: 20 } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'rollout.create', entity: 'FeatureFlag', entityId: 'squads' });
  });

  it('aynı anahtarda arşivlenmemiş yetim kayıt varsa 409', async () => {
    tx.featureFlag.findUnique.mockResolvedValue({ id: 'old', key: 'squads', isEnabled: true, metadata: null, updatedAt: T0, expiresAt: null });
    await expect(upsertRollout(ctx, 'squads', body)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allowlist’te bilinmeyen kullanıcı doğrulama hatası', async () => {
    db.user.count.mockResolvedValue(0);
    await expect(upsertRollout(ctx, 'squads', { ...body, allowUserIds: ['ghost-user-1'] })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('modül kapısı + kademeli açılış', () => {
  beforeEach(() => {
    db.settings.findUnique.mockResolvedValue(null);
    db.featureFlag.findMany.mockResolvedValue([{ key: 'squads', isEnabled: true, expiresAt: null, metadata: { kind: 'module_rollout', percent: 0, allowUserIds: ['vip'] } }]);
  });

  it('kapsam dışı kullanıcı 403 + engelleme kaydı; allowlist geçer', async () => {
    const res = await assertModuleEnabled('squads', { userId: 'someone' });
    expect(res?.status).toBe(403);
    expect(db.analyticsEvent.create.mock.calls[0][0].data.data.reason).toBe('module_rollout_excluded');
    expect(await assertModuleEnabled('squads', { userId: 'vip' })).toBeNull();
  });

  it('oturumsuz engelleme DB’ye yazılmaz', async () => {
    const res = await assertModuleEnabled('squads', {});
    expect(res?.status).toBe(403);
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('feature_flags kapalıyken kurallar yok sayılır', async () => {
    db.settings.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key === 'moduleControls' ? { value: { feature_flags: false } } : null));
    expect(await assertModuleEnabled('squads', { userId: 'someone' })).toBeNull();
  });
});

describe('deneyler', () => {
  const version = T0.toISOString();
  const okWrite = () => {
    tx.settings.findUnique.mockResolvedValue({ updatedAt: T0 });
    tx.settings.updateMany.mockResolvedValue({ count: 1 });
    tx.settings.findUniqueOrThrow.mockResolvedValue({ updatedAt: new Date('2026-10-10T11:00:00.000Z') });
  };
  const written = () => tx.settings.updateMany.mock.calls[0][0].data.value.campaignAb.experiments as Record<string, unknown>[];

  it('taslak olarak doğar, aktif değildir', async () => {
    okWrite();
    await createExperiment(ctx, { id: 'cta-metni', name: 'CTA metni', dimension: 'copy', hypothesis: null, primaryMetric: null, variantA: 'Kazan', variantB: 'Hemen kazan', splitPercentB: 50, baseVersion: version });
    expect(written()[0]).toMatchObject({ id: 'cta-metni', status: 'draft', active: false, ownerId: 'admin1' });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'experiment.create', entity: 'Experiment' });
  });

  it('aynı anahtar 409', async () => {
    okWrite();
    cfgStore.experiments = [{ id: 'cta-metni', name: 'x', variantA: 'a', variantB: 'b', active: false, status: 'draft' }];
    await expect(
      createExperiment(ctx, { id: 'cta-metni', name: 'CTA metni', dimension: 'copy', hypothesis: null, primaryMetric: null, variantA: 'a', variantB: 'b', splitPercentB: 50, baseVersion: version })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('başlat → çalışıyor + aktif + başlangıç; geçersiz geçiş 409', async () => {
    okWrite();
    cfgStore.experiments = [{ id: 'e1', name: 'E1', variantA: 'a', variantB: 'b', active: false, status: 'draft' }];
    await actOnExperiment(ctx, 'e1', { action: 'start', reason: 'hazırız artık', baseVersion: version });
    expect(written()[0]).toMatchObject({ status: 'running', active: true });
    expect(typeof written()[0].startedAt).toBe('string');
    jest.clearAllMocks();
    okWrite();
    await expect(actOnExperiment(ctx, 'e1', { action: 'resume', reason: 'olmaz bu', baseVersion: version })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('başlamış deneyde varyant değişikliği 409; ad değişikliği serbest', async () => {
    okWrite();
    cfgStore.experiments = [{ id: 'e1', name: 'E1', variantA: 'a', variantB: 'b', active: true, status: 'running', splitPercentB: 50, dimension: 'copy' }];
    const edit = { action: 'edit' as const, name: 'E1 yeni', dimension: 'copy' as const, hypothesis: null, primaryMetric: null, variantA: 'a', variantB: 'b', splitPercentB: 50, baseVersion: version };
    await expect(actOnExperiment(ctx, 'e1', { ...edit, variantB: 'değişti' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await actOnExperiment(ctx, 'e1', edit);
    expect(written()[0]).toMatchObject({ name: 'E1 yeni', variantB: 'b' });
  });

  it('yalnız taslak silinir', async () => {
    okWrite();
    cfgStore.experiments = [{ id: 'e1', name: 'E1', variantA: 'a', variantB: 'b', active: true, status: 'running' }];
    await expect(actOnExperiment(ctx, 'e1', { action: 'delete', baseVersion: version })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('tamamla: pasif + kazanan + karar notu', async () => {
    okWrite();
    cfgStore.experiments = [{ id: 'e1', name: 'E1', variantA: 'a', variantB: 'b', active: true, status: 'running' }];
    await actOnExperiment(ctx, 'e1', { action: 'complete', winner: 'B', reason: 'B anlamlı kazandı', baseVersion: version });
    expect(written()[0]).toMatchObject({ status: 'completed', active: false, winner: 'B', decisionNote: 'B anlamlı kazandı' });
  });

  it('eski kayıtların durumu `active`ten türer; boyut alanları varyant ucunun okuduğu yere yazılır', () => {
    expect(statusOf({ id: 'x', name: 'x', variantA: 'a', variantB: 'b', active: true })).toBe('running');
    expect(statusOf({ id: 'x', name: 'x', variantA: 'a', variantB: 'b', active: false, status: 'running' })).toBe('paused');
    const r = applyDimensionFields({ id: 'x', name: 'x', variantA: '', variantB: '', active: false, pushTitleA: 'eski' }, 'push_hour', '18:00', '19:30');
    expect(r).toMatchObject({ pushHourA: '18:00', pushHourB: '19:30' });
    expect(r.pushTitleA).toBeUndefined();
  });

  it('atama denetleyicisi varyant ucuyla (pickAbVariant) aynı sonucu verir', async () => {
    cfgStore.experiments = [{ id: 'e1', name: 'E1', variantA: 'a', variantB: 'b', active: true, status: 'running', splitPercentB: 37 }];
    for (const uid of ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6']) {
      db.user.findFirst.mockResolvedValue({ id: uid, name: null, email: `${uid}@x.com` });
      const res = await checkAssignment('e1', uid);
      const cfg = { campaignAb: { defaultSplitPercentForB: 50, experiments: cfgStore.experiments } } as unknown as Parameters<typeof pickAbVariant>[0];
      expect(res.variant).toBe(pickAbVariant(cfg, 'e1', uid).variant);
    }
    expect(rolloutBucket('a', 'b')).toBeGreaterThanOrEqual(0);
  });
});
