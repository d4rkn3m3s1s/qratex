/**
 * İçerik sayfaları (CMS) sunucu mantığı — admin CRUD + public okuma.
 *
 * - Liste: özet `select` + sayfalama + durum filtresi + sayaçlar (tam içerik listede dönmez).
 * - Yazma: paylaşılan zod, `updatedAt` koşullu yazım (409), slug yarışı P2002 → 409 (defineRoute),
 *   denetim izi: `newData` = sürüm (başlık/slug/gövde), `oldData` = yalnız değişen alan adları
 *   (içerik iki kez kopyalanmaz). Silme yalnız taslakta; yayındaki sayfa önce yayından kaldırılır.
 * - Yayın: public okuma `unstable_cache` + `cms-page:<slug>` etiketi; her yazımda ANINDA sona erer.
 *   Public yardımcılar try/catch + varsayılan (build-time DB fail-safe).
 */
import { revalidateTag, unstable_cache } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  CMS_CACHE_TAG,
  cmsActionLabel,
  cmsPageTag,
  plainExcerpt,
  readContent,
  readMeta,
  writeContent,
  writeMeta,
  type CmsHistoryEntry,
  type CmsListQuery,
  type CmsMeta,
  type CmsPageDetail,
  type CmsPageFormParsed,
  type CmsPageList,
  type CmsPageSummary,
} from './contract';

export interface CmsCtx {
  actor: AuditActor;
  request: { headers: { get(name: string): string | null } } | null;
}

const ENTITY = 'Page';

type Row = {
  id: string;
  slug: string;
  title: string;
  content: Prisma.JsonValue;
  meta: Prisma.JsonValue | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const ROW_SELECT = { id: true, slug: true, title: true, content: true, meta: true, isPublished: true, createdAt: true, updatedAt: true } as const;

function actorLabel(row: { actorSnapshot?: unknown; user?: { name: string | null; email: string } | null }): string | null {
  if (row.user) return row.user.name || row.user.email;
  const snap = row.actorSnapshot as { name?: string | null; email?: string | null } | null | undefined;
  return snap?.name || snap?.email || null;
}

export function toDetail(row: Row): CmsPageDetail {
  const { body, legacy } = readContent(row.content);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body,
    meta: readMeta(row.meta),
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    legacyFormat: legacy,
  };
}

function invalidate(...slugs: string[]) {
  revalidateTag(CMS_CACHE_TAG, { expire: 0 });
  for (const s of new Set(slugs)) revalidateTag(cmsPageTag(s), { expire: 0 });
}

// ───────────────────────────── Admin okuma ─────────────────────────────

export async function listCmsPages(q: CmsListQuery): Promise<CmsPageList> {
  const where: Prisma.PageWhereInput = {};
  if (q.status === 'published') where.isPublished = true;
  if (q.status === 'draft') where.isPublished = false;
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { slug: { contains: q.q.toLocaleLowerCase('tr-TR'), mode: 'insensitive' } },
    ];
  }
  const [rows, total, published, all] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: q.sort === 'title' ? [{ title: 'asc' }] : [{ updatedAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: ROW_SELECT,
    }),
    prisma.page.count({ where }),
    prisma.page.count({ where: { isPublished: true } }),
    prisma.page.count(),
  ]);
  const ids = rows.map((r) => r.id);
  const lastAudits = ids.length
    ? await prisma.auditLog.findMany({
        where: { entity: ENTITY, entityId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: ids.length * 3,
        select: { entityId: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const editor = new Map<string, string | null>();
  for (const a of lastAudits) if (a.entityId && !editor.has(a.entityId)) editor.set(a.entityId, actorLabel(a));
  const items: CmsPageSummary[] = (rows as Row[]).map((r) => {
    const { body } = readContent(r.content);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      isPublished: r.isPublished,
      noindex: readMeta(r.meta).noindex === true,
      excerpt: plainExcerpt(body, 180),
      length: body.length,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      lastEditor: editor.get(r.id) ?? null,
    };
  });
  return { items, total, page: q.page, pageSize: q.pageSize, counts: { all, published, draft: all - published } };
}

export async function getCmsPage(id: string): Promise<CmsPageDetail> {
  const row = (await prisma.page.findUnique({ where: { id }, select: ROW_SELECT })) as Row | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Sayfa bulunamadı.');
  return toDetail(row);
}

export async function getCmsHistory(id: string): Promise<{ items: CmsHistoryEntry[] }> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: ENTITY, entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, action: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
  });
  return {
    items: rows.map((r) => {
      const nd = (r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData) ? r.newData : {}) as Record<string, unknown>;
      const od = (r.oldData && typeof r.oldData === 'object' && !Array.isArray(r.oldData) ? r.oldData : {}) as Record<string, unknown>;
      const changed = Array.isArray(od.changed) ? (od.changed as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      const body = typeof nd.body === 'string' ? nd.body : readContent(nd.content).body;
      const version =
        typeof nd.title === 'string' && typeof nd.slug === 'string' && (typeof nd.body === 'string' || nd.content != null)
          ? { title: nd.title, slug: nd.slug, body }
          : null;
      return {
        id: r.id,
        action: r.action,
        actionLabel: cmsActionLabel(r.action),
        createdAt: r.createdAt.toISOString(),
        actor: actorLabel(r),
        changed,
        version,
      };
    }),
  };
}

// ───────────────────────────── Admin yazma ─────────────────────────────

const FIELD_NAMES: Record<string, string> = { title: 'Başlık', slug: 'Adres', body: 'İçerik', meta: 'SEO', isPublished: 'Yayın durumu' };

function versionOf(v: { title: string; slug: string; body: string; meta: CmsMeta; isPublished: boolean }) {
  return { title: v.title, slug: v.slug, body: v.body, meta: v.meta, isPublished: v.isPublished };
}

export async function createCmsPage(ctx: CmsCtx, input: CmsPageFormParsed): Promise<{ page: CmsPageDetail }> {
  const meta = writeMeta(input);
  const page = await prisma.$transaction(async (tx) => {
    const created = (await tx.page.create({
      data: {
        title: input.title,
        slug: input.slug,
        content: writeContent(input.body),
        meta: meta as Prisma.InputJsonValue,
        isPublished: input.isPublished,
      },
      select: ROW_SELECT,
    })) as Row;
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'CREATE_PAGE', entity: ENTITY, entityId: created.id, oldData: null, newData: versionOf({ ...input, meta }) },
        ctx.request
      ),
    });
    return created;
  });
  if (page.isPublished) invalidate(page.slug);
  return { page: toDetail(page) };
}

export async function updateCmsPage(
  ctx: CmsCtx,
  id: string,
  input: CmsPageFormParsed & { expectedUpdatedAt: string }
): Promise<{ page: CmsPageDetail; changed: string[] }> {
  const meta = writeMeta(input);
  const result = await prisma.$transaction(async (tx) => {
    const existing = (await tx.page.findUnique({ where: { id }, select: ROW_SELECT })) as Row | null;
    if (!existing) throw new ApiError('NOT_FOUND', 'Sayfa bulunamadı.');
    const before = toDetail(existing);
    const changed: string[] = [];
    if (before.title !== input.title) changed.push('title');
    if (before.slug !== input.slug) changed.push('slug');
    if (before.body !== input.body || before.legacyFormat) changed.push('body');
    if (JSON.stringify(before.meta) !== JSON.stringify(meta)) changed.push('meta');
    if (before.isPublished !== input.isPublished) changed.push('isPublished');
    const res = await tx.page.updateMany({
      where: { id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        title: input.title,
        slug: input.slug,
        content: writeContent(input.body),
        meta: meta as Prisma.InputJsonValue,
        isPublished: input.isPublished,
      },
    });
    if (res.count === 0) throw new ApiError('CONFLICT', 'Bu sayfa siz düzenlerken başka biri tarafından değiştirildi.');
    const updated = (await tx.page.findUnique({ where: { id }, select: ROW_SELECT })) as Row;
    if (changed.length) {
      const action =
        changed.length === 1 && changed[0] === 'isPublished' ? (input.isPublished ? 'PUBLISH_PAGE' : 'UNPUBLISH_PAGE') : 'UPDATE_PAGE';
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          {
            action,
            entity: ENTITY,
            entityId: id,
            oldData: { changed: changed.map((c) => FIELD_NAMES[c] ?? c), slug: before.slug, isPublished: before.isPublished },
            newData: versionOf({ ...input, meta }),
          },
          ctx.request
        ),
      });
    }
    return { updated, before, changed };
  });
  if (result.changed.length && (result.before.isPublished || result.updated.isPublished)) invalidate(result.before.slug, result.updated.slug);
  return { page: toDetail(result.updated), changed: result.changed };
}

export async function setCmsPublished(
  ctx: CmsCtx,
  id: string,
  input: { expectedUpdatedAt: string; isPublished: boolean }
): Promise<{ page: CmsPageDetail }> {
  const current = await getCmsPage(id);
  if (current.isPublished === input.isPublished) return { page: current };
  if (input.isPublished && current.body.trim().length < 20) {
    throw new ApiError('VALIDATION', 'İçeriği 20 karakterden kısa bir sayfa yayına alınamaz.', {
      details: [{ path: 'body', message: 'Yayındaki bir sayfanın içeriği en az 20 karakter olmalı' }],
    });
  }
  const { page } = await updateCmsPage(ctx, id, {
    title: current.title,
    slug: current.slug,
    body: current.body,
    seoTitle: current.meta.seoTitle ?? '',
    description: current.meta.description ?? '',
    noindex: current.meta.noindex === true,
    isPublished: input.isPublished,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
  return { page };
}

/** Yalnız TASLAK silinir (yayındaki sayfa önce yayından kaldırılır). İçerik denetim izinde kalır. */
export async function deleteCmsPage(ctx: CmsCtx, id: string, expectedUpdatedAt: string): Promise<{ id: string }> {
  await prisma.$transaction(async (tx) => {
    const existing = (await tx.page.findUnique({ where: { id }, select: ROW_SELECT })) as Row | null;
    if (!existing) throw new ApiError('NOT_FOUND', 'Sayfa bulunamadı.');
    if (existing.isPublished) {
      throw new ApiError('CONFLICT', 'Yayındaki sayfa silinemez. Önce yayından kaldırın.', { details: { reason: 'PUBLISHED' } });
    }
    const res = await tx.page.deleteMany({ where: { id, updatedAt: new Date(expectedUpdatedAt), isPublished: false } });
    if (res.count === 0) throw new ApiError('CONFLICT', 'Sayfa siz bakarken değişti. Listeyi yenileyip tekrar deneyin.');
    const d = toDetail(existing);
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'DELETE_PAGE', entity: ENTITY, entityId: id, oldData: { changed: ['Silindi'] }, newData: versionOf(d) },
        ctx.request
      ),
    });
  });
  return { id };
}

// ───────────────────────────── Public okuma (fail-safe) ─────────────────────────────

export interface PublicCmsPage {
  slug: string;
  title: string;
  body: string;
  meta: CmsMeta;
  updatedAt: string;
}

async function loadPublished(slug: string): Promise<PublicCmsPage | null> {
  try {
    const row = (await prisma.page.findFirst({ where: { slug, isPublished: true }, select: ROW_SELECT })) as Row | null;
    if (!row) return null;
    const d = toDetail(row);
    return { slug: d.slug, title: d.title, body: d.body, meta: d.meta, updatedAt: d.updatedAt };
  } catch (err) {
    console.error('[cms] yayındaki sayfa okunamadı:', err);
    return null;
  }
}

export function getPublishedCmsPage(slug: string): Promise<PublicCmsPage | null> {
  return unstable_cache(() => loadPublished(slug), ['cms-page', slug], { revalidate: 3600, tags: [CMS_CACHE_TAG, cmsPageTag(slug)] })();
}

/** Sitemap için yayındaki, indekslenebilir sayfalar. DB erişilemezse boş liste. */
export async function listPublishedCmsForSitemap(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  try {
    const rows = await prisma.page.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true, meta: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    return rows.filter((r) => readMeta(r.meta).noindex !== true).map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }));
  } catch {
    return [];
  }
}
