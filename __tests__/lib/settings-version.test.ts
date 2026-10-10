/**
 * P0-28 — iyimser kilit (lib/settings-version.ts).
 * Saldırı/hata senaryosu: bayat ya da "yükleme hatası sonrası varsayılan" taslak, canlı ayarı
 * EZEMEMELİ; kilit altında sürüm uyuşmazsa hiçbir yazma yapılmamalı.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

import {
  NO_VERSION,
  VersionConflictError,
  nextUpdatedAt,
  readBaseVersion,
  readBaseVersionMap,
  stableStringify,
  versionFromContent,
  versionFromDate,
  writeVersionedSetting,
  writeVersionedSettingsBatch,
} from '@/lib/settings-version';

type Row = { id: string; key: string; value: unknown; updatedAt: Date; category?: string };

function makeTx(rows: Row[]) {
  const store = new Map(rows.map((r) => [r.key, { ...r }]));
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    settings: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
        const r = store.get(where.key);
        return r ? { ...r } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.map((k) => store.get(k)).filter(Boolean).map((r) => ({ ...(r as Row) }))
      ),
      update: jest.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown; updatedAt?: Date; category?: string } }) => {
        const r = store.get(where.key)!;
        const next = { ...r, value: data.value, updatedAt: data.updatedAt ?? new Date(), category: data.category ?? r.category };
        store.set(where.key, next);
        return { ...next };
      }),
      create: jest.fn(async ({ data }: { data: { key: string; value: unknown; category: string } }) => {
        const r = { id: `id-${data.key}`, key: data.key, value: data.value, category: data.category, updatedAt: new Date() };
        store.set(data.key, r);
        return { ...r };
      }),
    },
  };
  return { tx, store };
}

describe('sürüm yardımcıları', () => {
  it('versionFromDate: tarih → ISO, yok → none', () => {
    const d = new Date('2026-10-08T10:00:00.123Z');
    expect(versionFromDate(d)).toBe('2026-10-08T10:00:00.123Z');
    expect(versionFromDate(null)).toBe(NO_VERSION);
    expect(versionFromDate(undefined)).toBe(NO_VERSION);
    expect(versionFromDate(new Date('geçersiz'))).toBe(NO_VERSION);
  });

  it('stableStringify / versionFromContent anahtar sırasından bağımsız', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(versionFromContent({ a: 1, b: 2 })).toBe(versionFromContent({ b: 2, a: 1 }));
    expect(versionFromContent({ a: 1 })).not.toBe(versionFromContent({ a: 2 }));
    expect(versionFromContent({ a: 1 })).toMatch(/^h:[0-9a-f]{32}$/);
  });

  it('readBaseVersion yalnız dolu metni kabul eder', () => {
    expect(readBaseVersion({ baseVersion: ' v1 ' })).toBe('v1');
    expect(readBaseVersion({ baseVersion: '' })).toBeNull();
    expect(readBaseVersion({ baseVersion: 12 })).toBeNull();
    expect(readBaseVersion(null)).toBeNull();
    expect(readBaseVersion([])).toBeNull();
    expect(readBaseVersion({ baseVersion: 'x'.repeat(201) })).toBeNull();
    expect(readBaseVersionMap({ baseVersions: { a: 'v1', b: '', c: 3 } })).toEqual({ a: 'v1' });
  });

  it('nextUpdatedAt her zaman öncekinden büyüktür (aynı milisaniye)', () => {
    const prev = new Date('2026-10-08T10:00:00.000Z');
    expect(nextUpdatedAt(prev, new Date(prev.getTime())).getTime()).toBe(prev.getTime() + 1);
    expect(nextUpdatedAt(prev, new Date(prev.getTime() - 50)).getTime()).toBe(prev.getTime() + 1);
    const later = new Date(prev.getTime() + 999);
    expect(nextUpdatedAt(prev, later)).toBe(later);
  });
});

describe('writeVersionedSetting', () => {
  const T0 = new Date('2026-10-08T10:00:00.000Z');

  it('bayat baseVersion → VersionConflictError ve HİÇBİR yazma yok (kayıp güncelleme engellenir)', async () => {
    const { tx, store } = makeTx([{ id: 's1', key: 'points_matrix', value: { custom: true }, updatedAt: T0 }]);
    await expect(
      writeVersionedSetting(tx as never, { key: 'points_matrix', value: { custom: false }, category: 'gamification', baseVersion: '2026-10-08T09:00:00.000Z' })
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(tx.settings.update).not.toHaveBeenCalled();
    expect(tx.settings.create).not.toHaveBeenCalled();
    expect(store.get('points_matrix')!.value).toEqual({ custom: true });
  });

  it('"yükleme hatası → varsayılanlarla Kaydet": satır VARKEN none sürümüyle yazma reddedilir', async () => {
    const { tx } = makeTx([{ id: 's1', key: 'league_rules', value: [{ key: 'KOR' }], updatedAt: T0 }]);
    const err = await writeVersionedSetting(tx as never, {
      key: 'league_rules',
      value: [],
      category: 'gamification',
      baseVersion: NO_VERSION,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).currentVersion).toBe(T0.toISOString());
  });

  it('eşleşen sürüm → kilit alınır, yazılır, yeni sürüm döner, önceki değer audit için verilir', async () => {
    const { tx, store } = makeTx([{ id: 's1', key: 'discovery_config', value: { locations: [1] }, updatedAt: T0 }]);
    const res = await writeVersionedSetting(tx as never, {
      key: 'discovery_config',
      value: { locations: [1, 2] },
      category: 'growth',
      baseVersion: T0.toISOString(),
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(res.previous).toEqual({ locations: [1] });
    expect(res.created).toBe(false);
    expect(res.version).not.toBe(T0.toISOString());
    expect(new Date(res.version).getTime()).toBeGreaterThan(T0.getTime());
    expect(store.get('discovery_config')!.value).toEqual({ locations: [1, 2] });
  });

  it('satır yokken none sürümüyle oluşturur', async () => {
    const { tx } = makeTx([]);
    const res = await writeVersionedSetting(tx as never, { key: 'k', value: { a: 1 }, category: 'general', baseVersion: NO_VERSION });
    expect(res.created).toBe(true);
    expect(tx.settings.create).toHaveBeenCalled();
  });

  it('değer fonksiyonu kilit altında okunan GÜNCEL değerle çağrılır', async () => {
    const { tx } = makeTx([{ id: 's', key: 'sidebarNavGroups', value: { dealer: { groupLabels: { a: 'A' } } }, updatedAt: T0 }]);
    const build = jest.fn((prev: unknown) => ({ ...(prev as object), customer: {} }));
    const res = await writeVersionedSetting(tx as never, { key: 'sidebarNavGroups', value: build, category: 'admin', baseVersion: T0.toISOString() });
    expect(build).toHaveBeenCalledWith({ dealer: { groupLabels: { a: 'A' } } });
    expect(res.value).toEqual({ dealer: { groupLabels: { a: 'A' } }, customer: {} });
  });

  it('iki eşzamanlı yazma aynı sürümden başlarsa ikincisi 409 alır', async () => {
    const { tx } = makeTx([{ id: 's1', key: 'k', value: 1, updatedAt: T0 }]);
    const base = T0.toISOString();
    await writeVersionedSetting(tx as never, { key: 'k', value: 2, category: 'general', baseVersion: base });
    await expect(writeVersionedSetting(tx as never, { key: 'k', value: 3, category: 'general', baseVersion: base })).rejects.toBeInstanceOf(
      VersionConflictError
    );
  });
});

describe('writeVersionedSettingsBatch', () => {
  const T0 = new Date('2026-10-08T10:00:00.000Z');

  it('herhangi bir anahtar çakışırsa HİÇBİRİ yazılmaz', async () => {
    const { tx } = makeTx([
      { id: 'a', key: 'siteName', value: 'A', updatedAt: T0 },
      { id: 'b', key: 'enableMagicLink', value: true, updatedAt: T0 },
    ]);
    const err = await writeVersionedSettingsBatch(tx as never, [
      { key: 'siteName', value: 'B', categoryOnCreate: 'general', baseVersion: T0.toISOString() },
      { key: 'enableMagicLink', value: false, categoryOnCreate: 'general', baseVersion: NO_VERSION },
    ]).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).conflicts).toEqual([{ key: 'enableMagicLink', currentVersion: T0.toISOString() }]);
    expect(tx.settings.update).not.toHaveBeenCalled();
    expect(tx.settings.create).not.toHaveBeenCalled();
  });

  it('baseVersion vermeyen eski istemciler koşulsuz yazar; sürümler ve önceki değerler döner', async () => {
    const { tx } = makeTx([{ id: 'a', key: 'siteName', value: 'A', updatedAt: T0 }]);
    const res = await writeVersionedSettingsBatch(tx as never, [
      { key: 'siteName', value: 'B', categoryOnCreate: 'general' },
      { key: 'newKey', value: 1, categoryOnCreate: 'appearance', baseVersion: NO_VERSION },
    ]);
    expect(res.previous).toEqual({ siteName: 'A' });
    expect(Object.keys(res.versions).sort()).toEqual(['newKey', 'siteName']);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(res.count).toBe(2);
  });

  it('aynı anahtar iki kez gelirse sonuncusu yazılır, previous ilk değeri tutar', async () => {
    const { tx, store } = makeTx([{ id: 'a', key: 'k', value: 'old', updatedAt: T0 }]);
    const res = await writeVersionedSettingsBatch(tx as never, [
      { key: 'k', value: 'v1', categoryOnCreate: 'general' },
      { key: 'k', value: 'v2', categoryOnCreate: 'general' },
    ]);
    expect(store.get('k')!.value).toBe('v2');
    expect(res.previous).toEqual({ k: 'old' });
    expect(tx.settings.update).toHaveBeenCalledTimes(1);
  });
});
