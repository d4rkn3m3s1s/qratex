/**
 * Navigasyon Stüdyosu — sözleşme + sunucu çekirdeği + düzenleyici ağacı (prisma mock).
 *  - Varsayılana eşit değer saklanmaz (bulgu: dondurulmuş atamalar).
 *  - C2: baseVersions yok → 428; sürüm uyuşmazlığı → 409; hiçbir şey yazılmaz.
 *  - Yalnız değişen anahtar yazılır; tek denetim satırı; kabuk önbelleği tazelenir.
 *  - Varsayılan reddet: bilinmeyen öğe/grup/görünürlük anahtarı → VALIDATION.
 *  - Ağaç: gruba taşınan öğe grubun SONUNA yerleşir (grup konumu kaymaz).
 */
/** @jest-environment node */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }));

type Row = { id: string; key: string; value: unknown; updatedAt: Date; category?: string };
const settings = new Map<string, Row>();
const audits: Array<Record<string, unknown>> = [];

const tx = {
  $executeRaw: jest.fn(async () => 1),
  settings: {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
      const r = settings.get(where.key);
      return r ? { ...r } : null;
    }),
    update: jest.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown; updatedAt: Date } }) => {
      const r = settings.get(where.key)!;
      Object.assign(r, data);
      return r;
    }),
    create: jest.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
      const r = { id: `s-${data.key}`, ...data, updatedAt: new Date('2026-10-11T09:00:00Z') };
      settings.set(data.key, r);
      return r;
    }),
  },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      audits.push({ id: `a${audits.length + 1}`, createdAt: new Date(), ...data });
      return data;
    }),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    settings: { findMany: jest.fn(async () => Array.from(settings.values())) },
    auditLog: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [...audits].reverse().map((a) => ({ ...a, user: null }))),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { revalidateTag } from 'next/cache';
import { defaultOrder, emptyRoleConfig, pruneRoleConfig, describeRoleDiff } from '@/lib/admin-navigation/contract';
import { getNavigationState, listNavigationHistory, saveNavigation } from '@/lib/admin-navigation/navigation.server';
import { buildEditorNodes, flattenNodes, moveToGroup } from '@/components/admin/a-navigasyon-studyosu/tree';

const actor = { id: 'admin1', email: 'a@x.com', role: 'ADMIN', type: 'user' as const };
const T0 = new Date('2026-10-10T10:00:00.000Z');

beforeEach(() => {
  settings.clear();
  audits.length = 0;
  jest.clearAllMocks();
});

describe('sözleşme', () => {
  it('varsayılana eşit sıra/grup/ad saklanmaz', () => {
    const cfg = pruneRoleConfig('dealer', {
      order: defaultOrder('dealer'),
      groupLabels: { marketing: { tr: 'Pazarlama', en: '  ' } },
      itemGroups: { 'dealer.campaigns': 'marketing' },
      hidden: [],
    });
    expect(cfg).toEqual(emptyRoleConfig());
  });

  it('admin rolünde görünürlük tutulmaz; fark özeti okunur', () => {
    expect(pruneRoleConfig('admin', { ...emptyRoleConfig(), hidden: ['x'] }).hidden).toEqual([]);
    const lines = describeRoleDiff('dealer', emptyRoleConfig(), { ...emptyRoleConfig(), hidden: ['offers'], itemGroups: { 'dealer.offers': '' } });
    expect(lines.some((l) => l.startsWith('Gizlendi: '))).toBe(true);
    expect(lines.some((l) => l.includes('Pazarlama → Grupsuz'))).toBe(true);
  });
});

describe('saveNavigation', () => {
  const change = { ...emptyRoleConfig(), itemGroups: { 'dealer.offers': '' }, hidden: ['surveys'] };

  it('baseVersions yoksa 428, hiçbir şey yazılmaz', async () => {
    await expect(saveNavigation({ actor }, { roles: { dealer: change } })).rejects.toMatchObject({ status: 428 });
    expect(settings.size).toBe(0);
    expect(audits).toHaveLength(0);
  });

  it('sürüm uyuşmazlığında 409', async () => {
    settings.set('sidebarNavGroups', { id: 'g', key: 'sidebarNavGroups', value: {}, updatedAt: T0 });
    await expect(
      saveNavigation({ actor }, { roles: { dealer: change }, baseVersions: { order: 'none', groups: '2026-01-01T00:00:00.000Z', visibility: 'none' } })
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(audits).toHaveLength(0);
  });

  it('yalnız değişen anahtarlar yazılır, tek denetim satırı, önbellek tazelenir', async () => {
    settings.set('sidebarNavGroups', { id: 'g', key: 'sidebarNavGroups', value: { customer: { itemGroups: {} } }, updatedAt: T0 });
    const state = await saveNavigation(
      { actor },
      { roles: { dealer: change }, baseVersions: { order: 'none', groups: T0.toISOString(), visibility: 'none' } }
    );
    expect(settings.has('sidebarNavOrder')).toBe(false); // sıra değişmedi → yazılmadı
    expect(settings.get('sidebarNavGroups')!.value).toEqual({ dealer: { itemGroups: { 'dealer.offers': '' } } });
    const vis = settings.get('menuVisibility')!.value as { dealer: Record<string, boolean>; customer: Record<string, boolean> };
    expect(vis.dealer.surveys).toBe(false);
    expect(vis.dealer.offers).toBe(true);
    expect(Object.values(vis.customer).every(Boolean)).toBe(true);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'navigation_studio_publish', userId: 'admin1' });
    expect(revalidateTag).toHaveBeenCalledWith('nav-settings', 'max');
    expect(state.roles.dealer.hidden).toEqual(['surveys']);
    expect(state.roles.dealer.itemGroups).toEqual({ 'dealer.offers': '' });
  });

  it('değişiklik yoksa yazmaz ve sürüm istemez', async () => {
    await saveNavigation({ actor }, { roles: { dealer: emptyRoleConfig() } });
    expect(audits).toHaveLength(0);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('bilinmeyen kimlikler ve admin görünürlüğü reddedilir', async () => {
    await expect(
      saveNavigation({ actor }, { roles: { dealer: { ...emptyRoleConfig(), order: ['dealer.yok'] } }, baseVersions: { order: 'none' } })
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      saveNavigation({ actor }, { roles: { dealer: { ...emptyRoleConfig(), itemGroups: { 'dealer.offers': 'olmayan' } } } })
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveNavigation({ actor }, { roles: { admin: { ...emptyRoleConfig(), hidden: ['users'] } } })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(saveNavigation({ actor }, { roles: { customer: { ...emptyRoleConfig(), hidden: ['olmayan_anahtar'] } } })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('okuma: eski kimlikler kayda göç eder, sürümler ve kapalı modüller döner', async () => {
    settings.set('sidebarNavOrder', { id: 'o', key: 'sidebarNavOrder', value: { customer: ['/customer/nearby', 'dashboard'] }, updatedAt: T0 });
    settings.set('moduleControls', { id: 'm', key: 'moduleControls', value: { discovery: false }, updatedAt: T0 });
    const state = await getNavigationState();
    expect(state.roles.customer.order.slice(0, 2)).toEqual(['customer.places', 'customer.home']);
    expect(state.versions.order).toBe(T0.toISOString());
    expect(state.versions.groups).toBe('none');
    expect(state.modulesOff.customer).toContain('discovery');
  });

  it('geçmiş: yayın kaydı fark + geri yüklenebilir parça üretir', async () => {
    await saveNavigation({ actor }, { roles: { dealer: change }, baseVersions: { order: 'none', groups: 'none', visibility: 'none' } });
    const page = await listNavigationHistory({ limit: 10 });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].actionLabel).toBe('Navigasyon yayınlandı');
    expect(page.entries[0].changes.some((c) => c.startsWith('Bayi · Gizlendi'))).toBe(true);
    expect(page.entries[0].snapshot.dealer).toMatchObject({ hidden: ['surveys'], itemGroups: { 'dealer.offers': '' } });
  });
});

describe('düzenleyici ağacı', () => {
  it('gruba taşınan öğe grubun sonuna yerleşir, grubun konumu değişmez', () => {
    const cfg = emptyRoleConfig();
    const nodes = buildEditorNodes('dealer', cfg);
    const marketingIndex = nodes.findIndex((n) => n.kind === 'group' && n.groupId === 'marketing');
    const moved = moveToGroup(nodes, 'dealer.customers', 'automation');
    const order = flattenNodes(moved);
    const next = buildEditorNodes('dealer', { ...cfg, order, itemGroups: { 'dealer.customers': 'automation' } });
    const auto = next.find((n) => n.kind === 'group' && n.groupId === 'automation');
    expect(auto && auto.kind === 'group' ? auto.items.at(-1)?.route.id : null).toBe('dealer.customers');
    expect(next.findIndex((n) => n.kind === 'group' && n.groupId === 'marketing')).toBe(marketingIndex - 1);
    // Alt sayfalar üst sayfasının ardından kalır.
    expect(order.indexOf('dealer.inbox.remedy')).toBe(order.indexOf('dealer.inbox') + 1);
  });
});
