/**
 * /admin/discovery — sözleşme, keşif hesabı saf parçaları ve yazma çekirdeği.
 * Gerçek DB yok; prisma sahte.
 *
 * Kapsanan bulgular (docs/audit/2026-10-08/admin/admin_discovery.md):
 *  - Bulgu 9: gerçek şema (0/0, indirim aralığı, protokol, tarih sırası, tekil kimlik).
 *  - Bulgu 4: açık/kapalı İstanbul saatiyle; bilinmeyen saat → null (09–23 varsayımı yok).
 *  - Bulgu 3: profil saati/konumu önceliklidir.
 *  - Bulgu 2: DEALER olmayan kimlik yazılamaz.
 *  - C2: sürüm uyuşmazlığı → 409, yazma/denetim yok.
 */
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: async () => ({}) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

import {
  discoveryConfigSchema,
  isoToIstanbulInput,
  istanbulInputToIso,
  isSafeLink,
  parseCoordinates,
  sponsorStatus,
} from '@/lib/admin-discovery/contract';
import { liveSponsored, normalizeCategoryLabel, resolveOpenNow, scheduleFromFallback } from '@/lib/discovery/compute.server';
import { assertDealersExist, saveDiscovery, toEditable } from '@/lib/admin-discovery/server';

const loc = (over: Record<string, unknown> = {}) => ({ dealerId: 'd1', latitude: 41.01, longitude: 28.97, categories: ['Kahve'], ...over });
const sp = (over: Record<string, unknown> = {}) => ({ id: 'sp_1', title: 'Kahve günleri', priority: 1, isActive: true, ...over });

describe('discoveryConfigSchema', () => {
  it('geçerli ayarı kabul eder, kategoriyi Türkçe küçültür, başlık varsayılanını doldurur', () => {
    const r = discoveryConfigSchema.parse({ locations: [loc({ categories: ['TATLI', 'Kahve', 'kahve'] })], sponsored: [sp()] });
    expect(r.locations[0].categories).toEqual(['tatlı', 'kahve']);
    expect(r.weeklyHighlights.foodLabel).toBe('En Güzel Yemek');
  });

  it('0/0 koordinatını, aralık dışı indirimi, tehlikeli bağlantıyı ve ters tarihi reddeder', () => {
    expect(discoveryConfigSchema.safeParse({ locations: [loc({ latitude: 0, longitude: 0 })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp({ discountRate: 500 })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp({ linkUrl: 'javascript:alert(1)' })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp({ linkUrl: 'http://x.com' })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp({ startsAt: '2026-10-10T10:00:00Z', endsAt: '2026-10-09T10:00:00Z' })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp({ startsAt: 'yarın' })] }).success).toBe(false);
  });

  it('tekrarlanan işletme ve sponsor kimliğini, saati olup günü olmayan satırı reddeder', () => {
    expect(discoveryConfigSchema.safeParse({ locations: [loc(), loc()] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ sponsored: [sp(), sp()] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ locations: [loc({ opensAt: '09:00', closesAt: '18:00', daysOfWeek: [] })] }).success).toBe(false);
    expect(discoveryConfigSchema.safeParse({ locations: [loc({ opensAt: '09:00' })] }).success).toBe(false);
  });

  it('güvenli bağlantılar: https ve uygulama içi yol', () => {
    expect(isSafeLink('https://qratex.com/a')).toBe(true);
    expect(isSafeLink('/customer/places')).toBe(true);
    expect(isSafeLink('//evil.com')).toBe(false);
  });
});

describe('parseCoordinates', () => {
  it.each([
    ['41.0082, 28.9784', 41.0082, 28.9784],
    ['https://www.google.com/maps/place/X/@41.0369,28.985,17z', 41.0369, 28.985],
    ['https://www.google.com/maps/place/X/data=!3d41.1!4d29.02', 41.1, 29.02],
    ['https://maps.google.com/?q=40.99,29.03', 40.99, 29.03],
  ])('%s', (input, lat, lng) => {
    expect(parseCoordinates(input)).toEqual({ latitude: lat, longitude: lng });
  });
  it('kısa bağlantı, 0/0 ve aralık dışı → null', () => {
    expect(parseCoordinates('https://maps.app.goo.gl/abc')).toBeNull();
    expect(parseCoordinates('0,0')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
  });
});

describe('İstanbul saati', () => {
  it('datetime-local ↔ ISO gidiş-dönüş (UTC+3)', () => {
    expect(istanbulInputToIso('2026-10-11T09:30')).toBe('2026-10-11T06:30:00.000Z');
    expect(isoToIstanbulInput('2026-10-11T06:30:00.000Z')).toBe('2026-10-11T09:30');
  });

  it('yedek 09:00–23:00: 10:30 TSİ (07:30 UTC) AÇIK, 00:30 TSİ KAPALI (eski UTC hatası tersini veriyordu)', () => {
    const fb = { opensAt: '09:00', closesAt: '23:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
    expect(resolveOpenNow({ businessHours: null, holidayMode: false }, fb, new Date('2026-10-12T07:30:00Z'))).toMatchObject({ isOpenNow: true, source: 'fallback' });
    expect(resolveOpenNow({ businessHours: null, holidayMode: false }, fb, new Date('2026-10-11T21:30:00Z'))).toMatchObject({ isOpenNow: false });
  });

  it('gün sınırı İstanbul gününe göre: Pazartesi 01:00 TSİ (Pazar 22:00 UTC) yalnız-Pazartesi programında', () => {
    const fb = { opensAt: '00:00', closesAt: '02:00', daysOfWeek: [1] };
    expect(resolveOpenNow({ businessHours: null, holidayMode: false }, fb, new Date('2026-10-11T22:00:00Z')).isOpenNow).toBe(true);
  });

  it('saat bilgisi yoksa null; tatil modu kapalı; profil yedeği ezer', () => {
    expect(resolveOpenNow({ businessHours: null, holidayMode: false }, undefined, new Date()).isOpenNow).toBeNull();
    expect(resolveOpenNow({ businessHours: null, holidayMode: true }, undefined, new Date())).toMatchObject({ isOpenNow: false, holiday: true });
    const r = resolveOpenNow({ businessHours: 'Her gün 10:00-12:00', holidayMode: false }, { opensAt: '00:00', closesAt: '23:59', daysOfWeek: [] }, new Date('2026-10-12T12:00:00Z'));
    expect(r).toMatchObject({ isOpenNow: false, source: 'profile' });
  });

  it('gece yarısını aşan yedek saat', () => {
    const s = scheduleFromFallback({ opensAt: '18:00', closesAt: '02:00', daysOfWeek: [5] });
    expect(s?.[5]).toEqual([{ open: 1080, close: 120 }]);
  });
});

describe('sponsor yayını', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it('durum ve yayındaki liste; geçersiz tarihli kayıt yayında sayılmaz', () => {
    expect(sponsorStatus({ isActive: false }, now)).toBe('off');
    expect(sponsorStatus({ isActive: true, startsAt: '2026-10-12T00:00:00Z' }, now)).toBe('scheduled');
    expect(sponsorStatus({ isActive: true, endsAt: '2026-10-10T00:00:00Z' }, now)).toBe('ended');
    const list = liveSponsored(
      [
        { id: 'a', title: 'A', priority: 1, isActive: true },
        { id: 'b', title: 'B', priority: 5, isActive: true },
        { id: 'c', title: 'C', priority: 9, isActive: true, startsAt: 'bozuk' },
      ],
      now
    );
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('kategori Türkçe normalize', () => {
    expect(normalizeCategoryLabel('TATLI')).toBe('tatlı');
    expect(normalizeCategoryLabel('Coffee shop')).toBe('kahve');
  });
});

describe('toEditable', () => {
  it('işletmesi/başlığı olmayan satırları sayar', () => {
    const r = toEditable({ locations: [loc(), { latitude: 1 }], sponsored: [sp(), { id: 'x' }] });
    expect(r.droppedRows).toBe(2);
    expect(r.config.locations).toHaveLength(1);
  });
});

describe('yazma çekirdeği', () => {
  const actor = { id: 'admin1', type: 'user' as const };

  it('DEALER olmayan kimlik → VALIDATION, yazma yok', async () => {
    const db = { user: { findMany: jest.fn(async () => [{ id: 'd1' }]) } };
    const config = discoveryConfigSchema.parse({ locations: [loc(), loc({ dealerId: 'cust1' })] });
    await expect(assertDealersExist(db as never, config)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('sürüm uyuşmazlığı → 409, denetim yazılmaz', async () => {
    const audit = jest.fn();
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      settings: { findUnique: jest.fn(async () => ({ id: 's1', value: {}, updatedAt: new Date('2026-10-01T00:00:00Z') })), update: jest.fn(), create: jest.fn() },
      auditLog: { create: audit },
    };
    const db = { user: { findMany: jest.fn(async () => [{ id: 'd1' }]) }, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    await expect(saveDiscovery(db as never, { config: discoveryConfigSchema.parse({ locations: [loc()] }), baseVersion: 'none' }, actor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(tx.settings.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('doğru sürümle yazar + aynı transaction’da denetim kaydı', async () => {
    const T = new Date('2026-10-01T00:00:00Z');
    const audit = jest.fn();
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      settings: {
        findUnique: jest.fn(async () => ({ id: 's1', value: { locations: [] }, updatedAt: T })),
        update: jest.fn(async () => ({ id: 's1', key: 'discovery_config', updatedAt: new Date('2026-10-02T00:00:00Z') })),
        create: jest.fn(),
      },
      auditLog: { create: audit },
    };
    const db = { user: { findMany: jest.fn(async () => [{ id: 'd1' }]) }, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const r = await saveDiscovery(db as never, { config: discoveryConfigSchema.parse({ locations: [loc()] }), baseVersion: T.toISOString(), restoredFrom: 'audit1' }, actor);
    expect(r.version).toBe('2026-10-02T00:00:00.000Z');
    expect(audit).toHaveBeenCalledTimes(1);
    const data = (audit.mock.calls[0] as unknown as [{ data: { action: string; newData: Record<string, unknown> } }])[0].data;
    expect(data.action).toBe('UPDATE_DISCOVERY_CONFIG');
    expect(data.newData._restoredFrom).toBe('audit1');
  });
});
