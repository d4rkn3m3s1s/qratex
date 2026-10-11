/**
 * SEO Motoru — sözleşme + sunucu mantığı (prisma mock).
 *  - Tek şema: boş Site URL reddedilir (D2/P0-39), boş override alanı yazılmaz, desteklenmeyen yol reddedilir.
 *  - Okuma onarımı: bozuk alan varsayılana, eski override satırı düşer.
 *  - Kayıt: iyimser kilit 409, tehlikeli değişiklik onaysız 428, aynı işlemde denetim, önbellek anında sona erer.
 *  - Geri yükleme: `restore` newData'yı, `undo` oldData'yı yazar; bozuk Site URL'li sürüm reddedilir.
 *  - Sağlık: SSRF sınırı (yabancı host'a istek yok), noindex kritik, ağırlıklı skor.
 */
/** @jest-environment node */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));
jest.mock('@/lib/site-config', () => ({ siteUrl: 'https://qratex.com' }));

type Row = Record<string, unknown>;
const settings = new Map<string, Row>();
const audits: Row[] = [];

const tx = {
  settings: {
    findUnique: jest.fn(async ({ where }: { where: Row }) => { const r = settings.get(where.key as string); return r ? { ...r } : null; }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const s = settings.get(where.key as string);
      if (!s) return { count: 0 };
      if (where.updatedAt && (where.updatedAt as Date).getTime() !== (s.updatedAt as Date).getTime()) return { count: 0 };
      Object.assign(s, data, { updatedAt: new Date((s.updatedAt as Date).getTime() + 1000) });
      return { count: 1 };
    }),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { id: 'set1', ...data, updatedAt: new Date('2026-10-10T10:00:00Z') };
      settings.set(data.key as string, row);
      return row;
    }),
  },
  auditLog: { create: jest.fn(async ({ data }: { data: Row }) => audits.push({ id: `a${audits.length + 1}`, createdAt: new Date(), ...data })) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    settings: {
      findUnique: jest.fn(async ({ where }: { where: Row }) => settings.get(where.key as string) ?? null),
      upsert: jest.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const s = settings.get(where.key as string);
        if (s) Object.assign(s, update);
        else settings.set(where.key as string, { id: 'h1', ...create, updatedAt: new Date() });
      }),
    },
    auditLog: {
      findFirst: jest.fn(async ({ where }: { where: Row }) => {
        if (where.id) return audits.find((a) => a.id === where.id) ?? null;
        return audits.length ? { ...audits[audits.length - 1], user: null } : null;
      }),
      findMany: jest.fn(async () => [...audits].reverse().map((a) => ({ ...a, user: null }))),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { revalidateTag } from 'next/cache';
import { SEO_DEFAULTS } from '@/lib/seo-settings';
import { parseSeoPayload, renderRobotsTxt, seoPayloadSchema, type SeoPayload } from '@/lib/admin-seo/contract';
import {
  buildHealthChecks,
  getSeoState,
  listSeoHistory,
  normalizeStoredPayload,
  restoreSeoVersion,
  saveSeo,
  scoreChecks,
} from '@/lib/admin-seo/seo.server';

const ctx = { actor: { id: 'u1', email: 'a@x.com', name: 'Admin', role: 'ADMIN' }, request: null };
const valid = (): SeoPayload => normalizeStoredPayload(null).payload;

beforeEach(() => {
  settings.clear();
  audits.length = 0;
  jest.clearAllMocks();
});

describe('sözleşme', () => {
  it('boş ya da şemasız Site URL reddedilir (siteyi düşüremez)', () => {
    const p = valid();
    expect(parseSeoPayload({ ...p, global: { ...p.global, siteUrl: '' } }).ok).toBe(false);
    expect(parseSeoPayload({ ...p, global: { ...p.global, siteUrl: 'javascript:alert(1)' } }).ok).toBe(false);
    const ok = parseSeoPayload({ ...p, global: { ...p.global, siteUrl: 'https://qratex.com///' } });
    expect(ok.ok && ok.data.global.siteUrl).toBe('https://qratex.com');
  });

  it('boş override alanı yazılmaz; desteklenmeyen yol ve tekrar reddedilir', () => {
    const p = valid();
    const r = seoPayloadSchema.parse({ ...p, pageOverrides: [{ path: '/guven', title: 'Güven merkezi', description: '' }] });
    expect(r.pageOverrides[0]).toEqual({ path: '/guven', title: 'Güven merkezi' });
    expect(parseSeoPayload({ ...p, pageOverrides: [{ path: '', title: 'x' }] }).ok).toBe(false);
    expect(parseSeoPayload({ ...p, pageOverrides: [{ path: '/blog/yazi' }] }).ok).toBe(false);
    expect(parseSeoPayload({ ...p, pageOverrides: [{ path: '/guven', title: 'a' }, { path: '/guven', title: 'b' }] }).ok).toBe(false);
  });

  it('tip-bozuk içe aktarma (string robotsIndex, string keywords) reddedilir', () => {
    const p = valid();
    expect(parseSeoPayload({ ...p, global: { ...p.global, robotsIndex: 'false' } }).ok).toBe(false);
    expect(parseSeoPayload({ ...p, global: { ...p.global, keywords: 'a,b' } }).ok).toBe(false);
    expect(parseSeoPayload({ ...p, global: { ...p.global, extraSitemapUrls: [{ url: '/x', lastModified: 'dün' }] } }).ok).toBe(false);
  });

  it('robots.txt önizlemesi app/robots.ts ile aynı: boş liste varsayılana döner, demo tümünü engeller', () => {
    const g = { ...valid().global, robotsDisallow: [] };
    expect(renderRobotsTxt(g, { demo: false, base: 'https://q.com' })).toContain('Disallow: /admin/');
    expect(renderRobotsTxt(g, { demo: true, base: 'https://q.com' })).toMatch(/Disallow: \/\n/);
  });
});

describe('okuma onarımı', () => {
  it('bozuk alan varsayılana çekilir, eski/boş override düşer ve raporlanır', () => {
    const { payload, repairedKeys } = normalizeStoredPayload({
      global: { siteUrl: '', keywords: 'a,b', defaultTitle: 'Yeterince uzun başlık' },
      pageOverrides: [{ path: 'guven/', title: 'G', description: '' }, { path: '', title: '', description: '' }, { path: '/yok', title: 'x' }],
    });
    expect(payload.global.siteUrl).toBe('https://qratex.com');
    expect(payload.global.keywords).toEqual(SEO_DEFAULTS.keywords);
    expect(payload.global.defaultTitle).toBe('Yeterince uzun başlık');
    expect(payload.pageOverrides).toEqual([{ path: '/guven', title: 'G' }]);
    expect(repairedKeys).toEqual(expect.arrayContaining(['siteUrl', 'keywords', 'pageOverrides']));
  });
});

describe('kayıt', () => {
  it('ilk kayıt oluşturur, denetim yazar, önbelleği anında sona erdirir', async () => {
    const s = await saveSeo(ctx, { payload: valid(), baseUpdatedAt: null });
    expect(s.updatedAt).toBeTruthy();
    expect(audits[0]).toMatchObject({ action: 'create', entity: 'settings', userId: 'u1' });
    expect(revalidateTag).toHaveBeenCalledWith('seo', { expire: 0 });
  });

  it('eski sürüme dayanan kayıt 409 (kayıp güncelleme yok)', async () => {
    const first = await saveSeo(ctx, { payload: valid(), baseUpdatedAt: null });
    const p = valid();
    p.global.siteName = 'Yeni Ad';
    await saveSeo(ctx, { payload: p, baseUpdatedAt: first.updatedAt });
    await expect(saveSeo(ctx, { payload: valid(), baseUpdatedAt: first.updatedAt })).rejects.toMatchObject({ status: 409 });
    await expect(saveSeo(ctx, { payload: valid(), baseUpdatedAt: null })).rejects.toMatchObject({ status: 409 });
  });

  it('noindex / Disallow: / onaysız 428; onaylı kaydedilir', async () => {
    const first = await saveSeo(ctx, { payload: valid(), baseUpdatedAt: null });
    const p = valid();
    p.global.robotsIndex = false;
    p.global.robotsDisallow = ['/'];
    await expect(saveSeo(ctx, { payload: p, baseUpdatedAt: first.updatedAt })).rejects.toMatchObject({
      status: 428,
      details: { flags: expect.arrayContaining([expect.objectContaining({ key: 'robotsIndex' }), expect.objectContaining({ key: 'robotsDisallow' })]) },
    });
    const ok = await saveSeo(ctx, { payload: p, baseUpdatedAt: first.updatedAt, confirmDangerous: true });
    expect(ok.payload.global.robotsIndex).toBe(false);
    // zaten kapalı olan ayar yeniden onay istemez
    const again = { ...ok.payload, global: { ...ok.payload.global, siteName: 'Başka' } };
    await expect(saveSeo(ctx, { payload: again, baseUpdatedAt: ok.updatedAt })).resolves.toBeTruthy();
  });
});

describe('geçmiş ve geri yükleme', () => {
  it('geçmiş alan bazlı fark döner; restore newData, undo oldData yazar', async () => {
    const s1 = await saveSeo(ctx, { payload: valid(), baseUpdatedAt: null });
    const p = valid();
    p.global.siteName = 'İkinci';
    const s2 = await saveSeo(ctx, { payload: p, baseUpdatedAt: s1.updatedAt });
    const h = await listSeoHistory({ limit: 10 });
    expect(h.entries[0].changes).toEqual([expect.objectContaining({ key: 'siteName', after: 'İkinci' })]);
    expect(h.entries[1].action).toBe('create');

    const undone = await restoreSeoVersion(ctx, { auditLogId: 'a2', mode: 'undo' });
    expect(undone.payload.global.siteName).toBe(SEO_DEFAULTS.siteName);
    const restored = await restoreSeoVersion(ctx, { auditLogId: 'a2', mode: 'restore', baseUpdatedAt: undone.updatedAt });
    expect(restored.payload.global.siteName).toBe('İkinci');
    expect(audits.at(-1)).toMatchObject({ action: 'restore' });
    expect(s2).toBeTruthy();
  });

  it('ilk kaydı geri almak (oldData yok) 404; bozuk Site URL’li sürüm reddedilir', async () => {
    await saveSeo(ctx, { payload: valid(), baseUpdatedAt: null });
    await expect(restoreSeoVersion(ctx, { auditLogId: 'a1', mode: 'undo' })).rejects.toMatchObject({ status: 404 });
    audits.push({ id: 'bad', entity: 'settings', entityId: 'set1', oldData: null, newData: { global: { siteUrl: '' } } });
    await expect(restoreSeoVersion(ctx, { auditLogId: 'bad', mode: 'restore' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('sağlık', () => {
  it('yabancı host’a istek atmaz (SSRF), noindex kritik başarısız', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, body: 'Sitemap: x <urlset><loc>a</loc>', contentType: 'image/png' }));
    const p = valid();
    p.global.siteUrl = 'https://evil.example';
    p.global.robotsIndex = false;
    const checks = await buildHealthChecks({ payload: p, repairedKeys: [], demoSite: false }, fetcher, new Set(['qratex.com']));
    // Yalnız kendi alan adımızdaki OG görseli denetlenir; evil.example'a hiç istek gitmez.
    expect(fetcher.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual(['https://qratex.com/logo/logo.png']);
    expect(checks.find((c) => c.key === 'robots')).toMatchObject({ tested: false });
    expect(checks.find((c) => c.key === 'robotsIndex')).toMatchObject({ passed: false, severity: 'critical' });
  });

  it('kendi host’unda robots/sitemap/OG denetlenir; skor ağırlıklı', async () => {
    const fetcher = jest.fn(async (url: string) =>
      url.endsWith('robots.txt')
        ? { ok: true, status: 200, body: 'Sitemap: https://qratex.com/sitemap.xml', contentType: 'text/plain' }
        : url.endsWith('sitemap.xml')
          ? { ok: true, status: 200, body: '<urlset><loc>a</loc><loc>b</loc></urlset>', contentType: 'application/xml' }
          : { ok: true, status: 200, body: '', contentType: 'image/png' }
    );
    const checks = await buildHealthChecks({ payload: valid(), repairedKeys: [], demoSite: false }, fetcher, new Set(['qratex.com']));
    expect(checks.find((c) => c.key === 'sitemap')).toMatchObject({ passed: true, detail: '2 adres' });
    expect(checks.find((c) => c.key === 'ogImage')).toMatchObject({ passed: true });
    expect(scoreChecks([{ key: 'a', label: '', passed: false, tested: true, detail: '', severity: 'critical' }, { key: 'b', label: '', passed: true, tested: true, detail: '', severity: 'info' }, { key: 'c', label: '', passed: false, tested: false, detail: '', severity: 'critical' }])).toBe(25);
  });

  it('getSeoState hiç kayıt yokken varsayılan + updatedAt null', async () => {
    const s = await getSeoState();
    expect(s.updatedAt).toBeNull();
    expect(s.lastChange).toBeNull();
  });
});
