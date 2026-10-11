/**
 * Tasarım Sistemi — sunucu mantığı (prisma mock): tema modeli (aile, hex, kontrast, palet çözümü),
 * yayın (tek transaction, iyimser kilit 409, değişiklik yok 400, tek denetim, anında önbellek),
 * geri alma (yalnız ThemeSettings kaydı, geçersiz önceki hâl reddi), erişilebilirlik listesi
 * (not zorunluluğu, 409, denetim) ve tercih özeti birleştirmesi.
 */
/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));
jest.mock('@/lib/redis', () => ({ cachedJson: jest.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()) }));
jest.mock('@/lib/seasonal-concept-core', () => ({
  ACTIVE_SEASONAL_CONCEPT_KEY: 'activeSeasonalConcept',
  readValidSeasonalCache: jest.fn(() => ({ concept: null })),
  resolveSeasonalConcept: jest.fn(),
}));

const tx = {
  settings: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
  auditLog: { create: jest.fn() },
};
const db = {
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  settings: { findMany: jest.fn(), findUnique: jest.fn() },
  auditLog: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { revalidateTag } from 'next/cache';
import { PublishThemeBody } from '@/lib/design-system/theme-schemas';
import {
  FAMILY_IDS,
  draftContrastReport,
  normalizeHex,
  paletteFor,
  readStoredCustomColors,
  resolvePaletteTokens,
  snapshotFromRows,
  isValidActiveTheme,
} from '@/lib/design-system/theme-model';
import { getThemeOverview, publishTheme, rollbackTheme, versionOf, THEME_AUDIT_ENTITY } from '@/lib/design-system/theme.server';
import { PatchChecklistBody, checklistProgress, readChecklistState } from '@/lib/design-system/a11y-checklist';
import { buildPrefsSummary, patchChecklistItem } from '@/lib/design-system/a11y.server';
import { PUBLIC_THEME_SETTINGS_CACHE_TAG } from '@/lib/theme-settings-keys';

const ctx = { actor: { id: 'admin1', email: 'a@x.com', role: 'ADMIN', name: 'Ada' }, request: null };
const T0 = new Date('2026-10-10T10:00:00.000Z');
const T1 = new Date('2026-10-10T11:00:00.000Z');

beforeEach(() => jest.clearAllMocks());

describe('tema modeli', () => {
  it('yalnız iki varyantlı aileler seçilebilir; tek varyantlı "light" yok', () => {
    expect(FAMILY_IDS).toContain('purple');
    expect(FAMILY_IDS).not.toContain('light');
    expect(FAMILY_IDS.some((id) => id.endsWith('Light'))).toBe(false);
  });

  it('hex normalleşir; #RGB genişler, yarım değer reddedilir', () => {
    expect(normalizeHex('#7c3')).toBe('#77CC33');
    expect(normalizeHex('7C3AED')).toBe('#7C3AED');
    expect(normalizeHex('#7c3a')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
  });

  it('yayın gövdesi: bilinmeyen tema, eski "light" ve geçersiz renk reddedilir', () => {
    const base = { baseVersion: null, draft: { activeTheme: 'blue', customColors: null, defaultMode: 'dark' } };
    expect(PublishThemeBody.safeParse(base).success).toBe(true);
    expect(PublishThemeBody.safeParse({ ...base, draft: { ...base.draft, activeTheme: 'light' } }).success).toBe(false);
    expect(PublishThemeBody.safeParse({ ...base, draft: { ...base.draft, activeTheme: '' } }).success).toBe(false);
    expect(PublishThemeBody.safeParse({ ...base, draft: { activeTheme: 'custom', customColors: null, defaultMode: 'system' } }).success).toBe(false);
    const bad = { ...base, draft: { activeTheme: 'custom', customColors: { primary: '#zzz', secondary: '#fff', accent: '#000' }, defaultMode: 'system' } };
    expect(PublishThemeBody.safeParse(bad).success).toBe(false);
    const half = { ...base, draft: { activeTheme: 'custom', customColors: { primary: '#fff', secondary: '#fff', accent: '#000', modes: { dark: { background: '#000' } } }, defaultMode: 'system' } };
    expect(PublishThemeBody.safeParse(half).success).toBe(false);
  });

  it('eski tek takım zemin/metin iki moda yayılır; geçersiz saklı tema işaretlenir', () => {
    const c = readStoredCustomColors({ primary: '#111111', secondary: '#222222', accent: '#333333', background: '#000000', foreground: '#ffffff' });
    expect(c?.modes?.light).toEqual({ background: '#000000', foreground: '#FFFFFF' });
    expect(isValidActiveTheme(snapshotFromRows([{ key: 'activeTheme', value: 'light' }]))).toBe(false);
    expect(isValidActiveTheme(snapshotFromRows([{ key: 'activeTheme', value: '' }]))).toBe(false);
    expect(isValidActiveTheme(snapshotFromRows([{ key: 'activeTheme', value: 'blue' }]))).toBe(true);
  });

  it('palet çözümü çalışma zamanıyla aynı türetme: kart zeminden ayrışır, dolgu üstü metin kontrasta göre', () => {
    const t = resolvePaletteTokens(paletteFor({ activeTheme: 'purple', customColors: null }, 'dark'), 'dark');
    expect(t.card).not.toBe(t.background);
    expect(t.primaryFg).toBe('0 0% 100%');
    const gold = resolvePaletteTokens(paletteFor({ activeTheme: 'royalGold', customColors: null }, 'dark'), 'dark');
    expect(gold.primaryFg).toBe('240 10% 10%'); // beyaz 2,10:1 idi → koyu mürekkep
  });

  it('kontrast raporu: çalışma zamanı düşük kontrastlı özel temayı da AA düzeyine düzeltir', () => {
    const r = draftContrastReport({ activeTheme: 'custom', customColors: { primary: '#FFFF00', secondary: '#EEEEEE', accent: '#DDDDDD' } });
    expect(r.failing).toBe(0);
    expect(r.light.find((c) => c.id === 'primary')?.pass).toBe(true);
  });
});

describe('tema yayını', () => {
  const rowsBefore = [
    { key: 'activeTheme', value: 'blue', updatedAt: T0 },
    { key: 'defaultMode', value: 'system', updatedAt: T0 },
  ];
  const draft = { activeTheme: 'green', customColors: null, defaultMode: 'dark' as const };

  it('tek transaction + koşullu güncelleme + tek denetim + anında önbellek; yanıt yeni satırları döndürür', async () => {
    tx.settings.findMany
      .mockResolvedValueOnce(rowsBefore)
      .mockResolvedValueOnce([
        { key: 'activeTheme', value: 'green', updatedAt: T1 },
        { key: 'defaultMode', value: 'dark', updatedAt: T1 },
      ]);
    tx.settings.updateMany.mockResolvedValue({ count: 1 });
    const r = await publishTheme(ctx, { draft, baseVersion: T0.toISOString() });
    expect(tx.settings.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.settings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'activeTheme', updatedAt: T0 } }));
    expect(tx.settings.create).not.toHaveBeenCalled(); // customColors null → satır yazılmaz
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.entity).toBe(THEME_AUDIT_ENTITY);
    expect(audit.oldData).toMatchObject({ activeTheme: 'blue', defaultMode: 'system' });
    expect(audit.newData.snapshot).toMatchObject({ activeTheme: 'green', defaultMode: 'dark' });
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_THEME_SETTINGS_CACHE_TAG, { expire: 0 });
    expect(r.entries).toEqual([
      { key: 'activeTheme', value: 'green' },
      { key: 'defaultMode', value: 'dark' },
    ]);
    expect(r.version).toBe(T1.toISOString());
  });

  it('sürüm uyuşmazlığı 409; hiçbir şey yazılmaz', async () => {
    tx.settings.findMany.mockResolvedValueOnce(rowsBefore);
    await expect(publishTheme(ctx, { draft, baseVersion: '2020-01-01T00:00:00.000Z' })).rejects.toMatchObject({ status: 409 });
    expect(tx.settings.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('eşzamanlı yazım (koşullu güncelleme 0 satır) 409', async () => {
    tx.settings.findMany.mockResolvedValueOnce(rowsBefore);
    tx.settings.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(publishTheme(ctx, { draft, baseVersion: T0.toISOString() })).rejects.toMatchObject({ status: 409 });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('zaten yayında olanı yeniden yayınlamak 400 (gürültü denetim kaydı yok)', async () => {
    tx.settings.findMany.mockResolvedValueOnce(rowsBefore);
    await expect(
      publishTheme(ctx, { draft: { activeTheme: 'blue', customColors: null, defaultMode: 'system' }, baseVersion: T0.toISOString() })
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('hiç satır yokken oluşturur (sürüm null)', async () => {
    tx.settings.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ key: 'activeTheme', value: 'green', updatedAt: T1 }]);
    await publishTheme(ctx, { draft, baseVersion: null });
    expect(tx.settings.create).toHaveBeenCalledWith({ data: { key: 'activeTheme', value: 'green', category: 'theme' } });
  });

  it('versionOf en yeni updatedAt', () => {
    expect(versionOf([{ updatedAt: T0 }, { updatedAt: T1 }])).toBe(T1.toISOString());
    expect(versionOf([])).toBeNull();
  });
});

describe('geri alma', () => {
  it('yalnız tema denetim kaydı kabul edilir', async () => {
    db.auditLog.findUnique.mockResolvedValueOnce({ id: 'a1', entity: 'settings', oldData: {} });
    await expect(rollbackTheme(ctx, { auditId: 'a1', baseVersion: null })).rejects.toMatchObject({ status: 404 });
  });

  it('önceki hâl geçersizse (eski "light") reddedilir', async () => {
    db.auditLog.findUnique.mockResolvedValueOnce({ id: 'a1', entity: THEME_AUDIT_ENTITY, oldData: { activeTheme: 'light', customColors: null, defaultMode: 'system' } });
    await expect(rollbackTheme(ctx, { auditId: 'a1', baseVersion: null })).rejects.toMatchObject({ status: 400 });
  });

  it('önceki hâli rollback eylemiyle yeniden yazar', async () => {
    db.auditLog.findUnique.mockResolvedValueOnce({ id: 'a1', entity: THEME_AUDIT_ENTITY, oldData: { activeTheme: 'blue', customColors: null, defaultMode: 'system' } });
    tx.settings.findMany
      .mockResolvedValueOnce([{ key: 'activeTheme', value: 'green', updatedAt: T1 }])
      .mockResolvedValueOnce([{ key: 'activeTheme', value: 'blue', updatedAt: T1 }]);
    tx.settings.updateMany.mockResolvedValue({ count: 1 });
    await rollbackTheme(ctx, { auditId: 'a1', baseVersion: T1.toISOString() });
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('theme.rollback');
    expect(audit.newData.rollbackOf).toBe('a1');
  });
});

describe('genel bakış', () => {
  it('geçersiz saklı değer işaretlenir, son yayınlayan okunur', async () => {
    db.settings.findMany.mockResolvedValueOnce([{ key: 'activeTheme', value: '', updatedAt: T0 }]);
    db.auditLog.findFirst.mockResolvedValueOnce({ createdAt: T1, actorSnapshot: { name: 'Ada' }, user: null });
    db.settings.findUnique.mockResolvedValueOnce(null);
    const o = await getThemeOverview();
    expect(o.valid).toBe(false);
    expect(o.lastPublished).toEqual({ at: T1.toISOString(), actor: 'Ada' });
    expect(o.version).toBe(T0.toISOString());
    expect(o.seasonal).toBeNull();
  });
});

describe('erişilebilirlik', () => {
  it('"Kaldı" not olmadan reddedilir', () => {
    expect(PatchChecklistBody.safeParse({ id: '1.4.3', status: 'fail', baseVersion: null }).success).toBe(false);
    expect(PatchChecklistBody.safeParse({ id: '1.4.3', status: 'fail', note: 'Mor Gece koyu kartta', baseVersion: null }).success).toBe(true);
    expect(PatchChecklistBody.safeParse({ id: '9.9.9', status: 'pass', baseVersion: null }).success).toBe(false);
  });

  it('ilerleme: geçti + kapsam dışı / toplam', () => {
    const s = readChecklistState({ '1.4.3': { status: 'pass' }, '2.1.1': { status: 'na' }, '2.4.7': { status: 'fail', note: 'x' }, bogus: { status: 'pass' } });
    const p = checklistProgress(s);
    expect(p.pass).toBe(1);
    expect(p.na).toBe(1);
    expect(p.fail).toBe(1);
    expect(p.untested).toBe(p.total - 3);
    expect(p.percent).toBe(Math.round((2 / p.total) * 100));
  });

  it('madde yazımı: iyimser kilit 409', async () => {
    tx.settings.findUnique.mockResolvedValueOnce({ value: {}, updatedAt: T1 });
    await expect(patchChecklistItem(ctx, { id: '1.4.3', status: 'pass', baseVersion: T0.toISOString() })).rejects.toMatchObject({ status: 409 });
  });

  it('madde yazımı: koşullu güncelleme + denetim', async () => {
    tx.settings.findUnique.mockResolvedValueOnce({ value: {}, updatedAt: T0 });
    tx.settings.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.settings.findUniqueOrThrow.mockResolvedValueOnce({ updatedAt: T1 });
    const r = await patchChecklistItem(ctx, { id: '1.4.3', status: 'pass', baseVersion: T0.toISOString() });
    expect(r.state['1.4.3']).toMatchObject({ status: 'pass', by: 'Ada' });
    expect(r.version).toBe(T1.toISOString());
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ entity: 'A11yChecklist', entityId: '1.4.3' });
  });

  it('tercih özeti rolleri birleştirir ve toplar', () => {
    const s = buildPrefsSummary(
      [{ role: 'CUSTOMER', saved: 10, high_contrast: 3, reduce_animations: 4, colorblind: 1, large_text: 2 }],
      [
        { role: 'CUSTOMER', n: 100 },
        { role: 'DEALER', n: 5 },
      ],
      T0
    );
    expect(s.rows.map((r) => r.role)).toEqual(['CUSTOMER', 'DEALER']);
    expect(s.rows[1]).toMatchObject({ users: 5, saved: 0 });
    expect(s.totals).toMatchObject({ users: 105, saved: 10, highContrast: 3, reduceAnimations: 4 });
  });
});
