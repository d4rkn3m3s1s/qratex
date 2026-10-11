/**
 * Ayarlar kayıt defteri + platform ayarları sunucu mantığı (prisma/redis mock).
 *  - Kayıt defteri: her anahtarın okuyucu dosyası VAR ve anahtarı GERÇEKTEN okuyor (sahte ayar giremez).
 *  - Kayıt: bilinmeyen anahtar / bozuk değer 400; bayat sürüm 409; anahtar başına standart denetim.
 *  - Bakım: Redis yokken açılamaz; açılınca Redis'e yayınlanır; proxy kancası ADMIN'i muaf tutar.
 *  - Geri alma: yalnız standart kayıt; önizleme yazmaz; uygulama önceki değeri yazar + REVERT denetimi.
 *  - Okuyucular: DB hatasında güvenli varsayılan.
 */
/** @jest-environment node */
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ MODULE_GATE_CACHE_TAG: 'module-gate-settings' }));
jest.mock('@/lib/seo-settings', () => ({
  getSeoSettingsFull: async () => ({ global: { siteName: 'QRateX', siteUrl: 'https://qratex.com' }, pageOverrides: {} }),
}));
jest.mock('@/lib/seasonal-concept-core', () => ({ getActiveSeasonalConcept: async () => null }));
jest.mock('@/lib/mail-sender', () => ({ getMailDeliverySummary: () => ({ configured: true, smtp: true, resend: false }) }));
jest.mock('@/lib/admin-gate', () => ({
  loadAdminGate: async () => ({ question: 'Soru?', isDefaultAnswer: false, cfgVer: 3, updatedAt: null }),
  publicGateView: (g: Record<string, unknown>) => g,
  ADMIN_GATE_AUDIT: { FAILED: 'ADMIN_GATE_FAILED', LOCKED: 'ADMIN_GATE_LOCKED' },
}));

const redisStore = new Map<string, unknown>();
let redisOn = true;
jest.mock('@/lib/redis', () => ({
  isRedisConfigured: () => redisOn,
  redisGetJson: jest.fn(async (k: string) => (redisOn ? redisStore.get(k) ?? null : null)),
  redisSetJson: jest.fn(async (k: string, v: unknown) => {
    if (redisOn) redisStore.set(k, v);
  }),
}));

let getTokenRole: string | null = null;
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn(async () => (getTokenRole ? { role: getTokenRole } : null)) }));

type Row = { id: string; key: string; value: unknown; category: string; updatedAt: Date };
const settings = new Map<string, Row>();
const audits: Array<Record<string, unknown>> = [];
let failSettings = false;
let clock = Date.parse('2026-10-11T10:00:00Z');

const settingsApi = {
  findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
    if (failSettings) throw new Error('db down');
    const r = settings.get(where.key);
    return r ? { ...r } : null;
  }),
  findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) => {
    if (failSettings) throw new Error('db down');
    return where.key.in
      .map((k) => settings.get(k))
      .filter((r): r is Row => !!r)
      .map((r) => ({ ...r }));
  }),
  update: jest.fn(async ({ where, data }: { where: { key: string }; data: Partial<Row> }) => {
    const r = settings.get(where.key)!;
    Object.assign(r, data);
    return { ...r };
  }),
  create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'updatedAt'> }) => {
    clock += 1000;
    const r: Row = { id: `s-${data.key}`, ...data, updatedAt: new Date(clock) };
    settings.set(data.key, r);
    return { ...r };
  }),
};
const auditApi = {
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `a${audits.length + 1}`, createdAt: new Date(clock), user: null, ...data };
    audits.push(row);
    return row;
  }),
  count: jest.fn(async () => 0),
  findUnique: jest.fn(async ({ where }: { where: { id: string } }) => audits.find((a) => a.id === where.id) ?? null),
  findMany: jest.fn(async () => [...audits].reverse()),
};
const tx = { settings: settingsApi, auditLog: auditApi, $executeRaw: jest.fn(async () => 1) };

jest.mock('@/lib/prisma', () => ({
  prisma: {
    settings: settingsApi,
    auditLog: auditApi,
    account: { count: jest.fn(async () => 4) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

import { NextRequest } from 'next/server';
import { PLATFORM_SETTINGS, PLATFORM_SETTING_KEYS, SETTINGS_KEYS, validatePlatformSetting } from '@/lib/platform-settings/registry';
import { getPlatformSettingsState, listPlatformHistory, revertPlatformSetting, savePlatformSettings } from '@/lib/platform-settings/server';
import { getMaintenanceState, isRegistrationOpen } from '@/lib/platform-settings/flags';
import { __resetMaintenanceMemo, maintenanceBlock, maintenanceScope, MAINTENANCE_REDIS_KEY } from '@/lib/platform-settings/maintenance-edge';

const ctx = { actor: { id: 'admin1', type: 'user' as const }, request: null };

beforeEach(() => {
  settings.clear();
  audits.length = 0;
  redisStore.clear();
  redisOn = true;
  failSettings = false;
  getTokenRole = null;
  __resetMaintenanceMemo();
});

describe('kayıt defteri', () => {
  it('her anahtarın okuyucusu var ve anahtarı gerçekten okuyor (okuyucusuz ayar giremez)', () => {
    const root = path.resolve(__dirname, '../../..');
    const readerFn = /isRegistrationOpen|isGoogleSignInEnabled|getMaintenanceState|maintenanceBlock|readMaintenanceEdge|SETTINGS_KEYS\./;
    for (const key of PLATFORM_SETTING_KEYS) {
      const entry = PLATFORM_SETTINGS[key];
      expect(entry.readers.length).toBeGreaterThan(0);
      for (const rel of entry.readers) expect(fs.existsSync(path.join(root, rel))).toBe(true);
      const hit = entry.readers.some((rel) => {
        const src = fs.readFileSync(path.join(root, rel), 'utf8');
        return src.includes(key) || readerFn.test(src);
      });
      expect(hit).toBe(true);
    }
  });

  it('eski sahte anahtar adları kullanılmıyor (dağıtımda eski "kapalı" değer etki kazanmasın)', () => {
    expect(PLATFORM_SETTING_KEYS).not.toContain('maintenanceMode');
    expect(PLATFORM_SETTING_KEYS).not.toContain('enableRegistration');
    expect(PLATFORM_SETTING_KEYS).not.toContain('enableGoogleAuth');
  });

  it('doğrulama: bozuk bakım değeri ve bilinmeyen efekt reddedilir', () => {
    expect(validatePlatformSetting(SETTINGS_KEYS.maintenance, { enabled: 'evet' }).ok).toBe(false);
    expect(validatePlatformSetting(SETTINGS_KEYS.backgroundEffect, 'lazer').ok).toBe(false);
    expect(validatePlatformSetting(SETTINGS_KEYS.backgroundEffect, 'aurora').ok).toBe(true);
  });
});

describe('okuma', () => {
  it('satır yokken kayıt defteri varsayılanları + "none" sürümü; bağlam doldurulur', async () => {
    const s = await getPlatformSettingsState();
    expect(s.values[SETTINGS_KEYS.registrationOpen]).toBe(true);
    expect(s.values[SETTINGS_KEYS.maintenance].enabled).toBe(false);
    expect(s.versions[SETTINGS_KEYS.registrationOpen]).toBe('none');
    expect(s.context.gate?.cfgVer).toBe(3);
    expect(s.context.googleLinkedUsers).toBe(4);
    expect(s.context.seo?.siteName).toBe('QRateX');
  });

  it('kayıt defteri okunamazsa FIRLATIR (sayfa varsayılanla açılmaz)', async () => {
    failSettings = true;
    await expect(getPlatformSettingsState()).rejects.toThrow();
  });

  it('bakım Redis kaydı eksikse onarılır', async () => {
    const s = await getPlatformSettingsState();
    expect(s.context.maintenanceEdge).toBe('repaired');
    expect(redisStore.get(MAINTENANCE_REDIS_KEY)).toEqual({ enabled: false, message: '', plannedEndAt: null });
    const again = await getPlatformSettingsState();
    expect(again.context.maintenanceEdge).toBe('synced');
  });
});

describe('kayıt', () => {
  it('bilinmeyen anahtar ve bozuk değer → VALIDATION, yazma yok', async () => {
    await expect(
      savePlatformSettings(ctx, { changes: [{ key: 'openaiApiKey', value: 'sk-x', baseVersion: 'none' }] })
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      savePlatformSettings(ctx, { changes: [{ key: SETTINGS_KEYS.googleAuth, value: 'hayır', baseVersion: 'none' }] })
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(settings.size).toBe(0);
    expect(audits).toHaveLength(0);
  });

  it('doğru sürüm → yazar, anahtar başına standart denetim kaydı', async () => {
    const s = await savePlatformSettings(ctx, {
      changes: [
        { key: SETTINGS_KEYS.registrationOpen, value: false, baseVersion: 'none' },
        { key: SETTINGS_KEYS.backgroundEffect, value: 'aurora', baseVersion: 'none' },
      ],
    });
    expect(s.values[SETTINGS_KEYS.registrationOpen]).toBe(false);
    expect(s.values[SETTINGS_KEYS.backgroundEffect]).toBe('aurora');
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      action: 'platform_setting_update',
      entity: 'settings',
      entityId: SETTINGS_KEYS.registrationOpen,
      oldData: { settingKey: SETTINGS_KEYS.registrationOpen },
      newData: { settingKey: SETTINGS_KEYS.registrationOpen, value: false },
    });
  });

  it('bayat sürüm → 409 VERSION_CONFLICT, yazma yok', async () => {
    await savePlatformSettings(ctx, { changes: [{ key: SETTINGS_KEYS.googleAuth, value: false, baseVersion: 'none' }] });
    await expect(
      savePlatformSettings(ctx, { changes: [{ key: SETTINGS_KEYS.googleAuth, value: true, baseVersion: 'none' }] })
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(settings.get(SETTINGS_KEYS.googleAuth)?.value).toBe(false);
  });

  it('Redis yokken bakım AÇILAMAZ (sahte anahtar olmaz)', async () => {
    redisOn = false;
    await expect(
      savePlatformSettings(ctx, {
        changes: [{ key: SETTINGS_KEYS.maintenance, value: { enabled: true, message: '', plannedEndAt: null }, baseVersion: 'none' }],
      })
    ).rejects.toMatchObject({ code: 'MAINTENANCE_UNAVAILABLE' });
    expect(settings.has(SETTINGS_KEYS.maintenance)).toBe(false);
  });

  it('bakım açılınca Redis yayınlanır; proxy paneli yönlendirir, API 503, ADMIN muaf', async () => {
    await savePlatformSettings(ctx, {
      changes: [{ key: SETTINGS_KEYS.maintenance, value: { enabled: true, message: 'Bakım', plannedEndAt: null }, baseVersion: 'none' }],
    });
    expect(redisStore.get(MAINTENANCE_REDIS_KEY)).toMatchObject({ enabled: true, message: 'Bakım' });

    __resetMaintenanceMemo();
    getTokenRole = 'CUSTOMER';
    const api = await maintenanceBlock(new NextRequest('https://x.test/api/customer/me'));
    expect(api?.status).toBe(503);
    const page = await maintenanceBlock(new NextRequest('https://x.test/dealer/campaigns'));
    expect(page?.status).toBe(307);
    expect(page?.headers.get('location')).toContain('/bakim');

    getTokenRole = 'ADMIN';
    expect(await maintenanceBlock(new NextRequest('https://x.test/customer'))).toBeNull();
    getTokenRole = 'CUSTOMER';
    expect(await maintenanceBlock(new NextRequest('https://x.test/'))).toBeNull();
  });

  it('bakım kapsamı yalnız panel yolları', () => {
    expect(maintenanceScope('/customer')).toBe('page');
    expect(maintenanceScope('/dealer/x')).toBe('page');
    expect(maintenanceScope('/api/dealer/x')).toBe('api');
    expect(maintenanceScope('/api/admin/x')).toBeNull();
    expect(maintenanceScope('/api/auth/session')).toBeNull();
    expect(maintenanceScope('/customers-guide')).toBeNull();
  });
});

describe('geçmiş ve geri alma', () => {
  it('standart kayıt geri alınabilir: önizleme yazmaz, uygulama önceki değeri yazar', async () => {
    await savePlatformSettings(ctx, { changes: [{ key: SETTINGS_KEYS.magicLink, value: true, baseVersion: 'none' }] });
    const st = await getPlatformSettingsState();
    await savePlatformSettings(ctx, {
      changes: [{ key: SETTINGS_KEYS.magicLink, value: false, baseVersion: st.versions[SETTINGS_KEYS.magicLink] }],
    });
    const second = audits[1];
    const dry = await revertPlatformSetting(ctx, { auditLogId: second.id as string, dryRun: true });
    expect(dry.state).toBeNull();
    expect(dry.preview).toMatchObject({ current: false, target: true });
    expect(audits).toHaveLength(2);

    const res = await revertPlatformSetting(ctx, { auditLogId: second.id as string, baseVersion: dry.preview.currentVersion });
    expect(res.state?.values[SETTINGS_KEYS.magicLink]).toBe(true);
    expect(audits[2]).toMatchObject({ action: 'platform_setting_revert', newData: { revertOf: second.id } });

    const history = await listPlatformHistory({ limit: 10 });
    expect(history.items[0].revertible).toBe(true);
  });

  it('standart olmayan kayıt reddedilir (B3: çöp satır açılmaz)', async () => {
    audits.push({ id: 'legacy', action: 'update_modules', entity: 'settings', entityId: null, oldData: { donations: true } });
    await expect(revertPlatformSetting(ctx, { auditLogId: 'legacy', dryRun: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(settings.size).toBe(0);
  });

  it('geri alma sürüm olmadan yapılmaz (428)', async () => {
    await savePlatformSettings(ctx, { changes: [{ key: SETTINGS_KEYS.registrationOpen, value: false, baseVersion: 'none' }] });
    await expect(revertPlatformSetting(ctx, { auditLogId: audits[0].id as string })).rejects.toMatchObject({ status: 428 });
  });
});

describe('okuyucular', () => {
  it('DB hatasında güvenli varsayılan (kayıt açık, bakım kapalı)', async () => {
    failSettings = true;
    await expect(isRegistrationOpen()).resolves.toBe(true);
    await expect(getMaintenanceState()).resolves.toMatchObject({ enabled: false });
  });
});
