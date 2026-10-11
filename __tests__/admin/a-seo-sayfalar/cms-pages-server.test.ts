/**
 * İçerik sayfaları (CMS) — sözleşme + sunucu mantığı (prisma mock).
 *  - Markdown alt kümesi: HTML/`javascript:` bağlantı üretmez, başlık çapaları tekil.
 *  - Eski içerik biçimleri v1'e yükselir; boş meta alanları yazılmaz.
 *  - Düzenleme iyimser kilitli (409); denetimde içerik bir kez (newData) saklanır.
 *  - Yayındaki sayfa silinemez; taslak silinir ve son içerik denetimde kalır.
 *  - Yayın/düzenleme public önbelleği anında sona erdirir; public okuma DB hatasında null (fail-safe).
 */
/** @jest-environment node */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));

type Row = Record<string, unknown>;
const pages = new Map<string, Row>();
const audits: Row[] = [];
let failRead = false;

const pageApi = {
  findUnique: jest.fn(async ({ where }: { where: Row }) => {
    const r = pages.get(where.id as string);
    return r ? { ...r } : null;
  }),
  findFirst: jest.fn(async ({ where }: { where: Row }) => {
    if (failRead) throw new Error('db down');
    return [...pages.values()].find((p) => p.slug === where.slug && p.isPublished === where.isPublished) ?? null;
  }),
  create: jest.fn(async ({ data }: { data: Row }) => {
    const row = { id: `p${pages.size + 1}`, meta: null, ...data, createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z') };
    pages.set(row.id as string, row);
    return { ...row };
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const r = pages.get(where.id as string);
    if (!r || (r.updatedAt as Date).getTime() !== (where.updatedAt as Date).getTime()) return { count: 0 };
    Object.assign(r, data, { updatedAt: new Date((r.updatedAt as Date).getTime() + 60_000) });
    return { count: 1 };
  }),
  deleteMany: jest.fn(async ({ where }: { where: Row }) => {
    const r = pages.get(where.id as string);
    if (!r || r.isPublished || (r.updatedAt as Date).getTime() !== (where.updatedAt as Date).getTime()) return { count: 0 };
    pages.delete(where.id as string);
    return { count: 1 };
  }),
};
const tx = { page: pageApi, auditLog: { create: jest.fn(async ({ data }: { data: Row }) => audits.push(data)) } };

jest.mock('@/lib/prisma', () => ({
  prisma: {
    page: pageApi,
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { revalidateTag } from 'next/cache';
import { cmsPageFormSchema, parseCmsMarkdown, plainExcerpt, readContent, safeHref } from '@/lib/cms-pages/contract';
import { createCmsPage, deleteCmsPage, getPublishedCmsPage, setCmsPublished, updateCmsPage } from '@/lib/cms-pages/pages.server';

const ctx = { actor: { id: 'u1', email: 'a@x.com', name: 'Admin', role: 'ADMIN' }, request: null };
const form = (o: Partial<Record<string, unknown>> = {}) =>
  cmsPageFormSchema.parse({ title: 'Hakkımızda', slug: 'hakkimizda', body: 'Biz QR tabanlı geri bildirim platformuyuz.', seoTitle: '', description: '', noindex: false, isPublished: false, ...o });

beforeEach(() => {
  pages.clear();
  audits.length = 0;
  failRead = false;
  jest.clearAllMocks();
});

describe('sözleşme', () => {
  it('markdown alt kümesi güvenli bloklara ayrışır', () => {
    const b = parseCmsMarkdown('## Biz kimiz\n\nMerhaba **dünya** [site](https://q.com) [kötü](javascript:alert(1))\n\n- a\n- b\n\n## Biz kimiz');
    expect(b[0]).toMatchObject({ t: 'h', level: 2, id: 'biz-kimiz' });
    expect(b[1]).toMatchObject({ t: 'p' });
    const inl = (b[1] as { inl: Array<{ t: string }> }).inl;
    expect(inl.filter((x) => x.t === 'link')).toHaveLength(1);
    expect(b[2]).toMatchObject({ t: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }]] });
    expect(b[3]).toMatchObject({ id: 'biz-kimiz-2' });
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('/sayfa/x')).toBe('/sayfa/x');
  });

  it('eski içerik biçimleri okunur; slug kayıtta kırpılır; yayında boş içerik reddedilir', () => {
    expect(readContent('düz metin')).toEqual({ body: 'düz metin', legacy: true });
    expect(readContent({ body: 'x' })).toEqual({ body: 'x', legacy: true });
    expect(readContent({ v: 1, format: 'markdown', body: 'x' })).toEqual({ body: 'x', legacy: false });
    expect(form({ slug: '-hakkimizda-' }).slug).toBe('hakkimizda');
    expect(cmsPageFormSchema.safeParse({ ...form(), body: 'kısa', isPublished: true }).success).toBe(false);
    expect(plainExcerpt('## Başlık\n\n**Kalın** metin [bağ](https://x.y)', 50)).toBe('Başlık Kalın metin bağ');
  });
});

describe('yazma', () => {
  it('oluşturma v1 içerik + yalnız dolu meta yazar; taslak public önbelleğe dokunmaz', async () => {
    const { page } = await createCmsPage(ctx, form({ description: 'Açıklama' }));
    expect(pages.get(page.id)).toMatchObject({ content: { v: 1, format: 'markdown' }, meta: { description: 'Açıklama' } });
    expect(audits[0]).toMatchObject({ action: 'CREATE_PAGE', entity: 'Page' });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('düzenleme iyimser kilitli; denetimde oldData yalnız değişen alan adları', async () => {
    const { page } = await createCmsPage(ctx, form());
    const r = await updateCmsPage(ctx, page.id, { ...form({ title: 'Biz Kimiz' }), expectedUpdatedAt: page.updatedAt });
    expect(r.changed).toEqual(['title']);
    expect(audits[1]).toMatchObject({ action: 'UPDATE_PAGE', oldData: { changed: ['Başlık'] }, newData: { title: 'Biz Kimiz' } });
    await expect(updateCmsPage(ctx, page.id, { ...form(), expectedUpdatedAt: page.updatedAt })).rejects.toMatchObject({ status: 409 });
  });

  it('yayına alma önbelleği anında sona erdirir; public okuma görür; yayından kaldırınca null', async () => {
    const { page } = await createCmsPage(ctx, form());
    const pub = await setCmsPublished(ctx, page.id, { expectedUpdatedAt: page.updatedAt, isPublished: true });
    expect(audits.at(-1)).toMatchObject({ action: 'PUBLISH_PAGE' });
    expect(revalidateTag).toHaveBeenCalledWith('cms-page:hakkimizda', { expire: 0 });
    expect(await getPublishedCmsPage('hakkimizda')).toMatchObject({ title: 'Hakkımızda' });
    await setCmsPublished(ctx, page.id, { expectedUpdatedAt: pub.page.updatedAt, isPublished: false });
    expect(await getPublishedCmsPage('hakkimizda')).toBeNull();
  });

  it('yayındaki sayfa silinemez; taslak silinir ve içerik denetimde kalır', async () => {
    const { page } = await createCmsPage(ctx, form({ isPublished: true }));
    await expect(deleteCmsPage(ctx, page.id, page.updatedAt)).rejects.toMatchObject({ status: 409 });
    const off = await setCmsPublished(ctx, page.id, { expectedUpdatedAt: page.updatedAt, isPublished: false });
    await deleteCmsPage(ctx, page.id, off.page.updatedAt);
    expect(pages.has(page.id)).toBe(false);
    expect(audits.at(-1)).toMatchObject({ action: 'DELETE_PAGE', newData: { body: expect.stringContaining('QR tabanlı') } });
  });

  it('public okuma DB hatasında null döner (fail-safe)', async () => {
    failRead = true;
    await expect(getPublishedCmsPage('x')).resolves.toBeNull();
  });
});
