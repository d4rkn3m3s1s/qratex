import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { NOT_INITIATIVE, TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { loadTeamMeta } from '@/lib/team/meta';
import { DEPARTMENT_COLORS } from '@/lib/team/constants';
import { slugifyTr } from '@/lib/team/slug';

export const dynamic = 'force-dynamic';

const listQuery = z.object({
  /** Silme/birleştirme etkisi önizlemesi (ConfirmAction). */
  impact: z.string().max(60).optional(),
});

async function departmentImpact(slug: string) {
  const [members, openTasks, allTasks, templates, automations] = await Promise.all([
    prisma.userDepartment.count({ where: { departmentSlug: slug } }),
    prisma.companyTask.count({ where: { AND: [NOT_INITIATIVE, { department: slug, archivedAt: null, status: { not: 'done' } }] } }),
    prisma.companyTask.count({ where: { department: slug } }),
    prisma.taskTemplate.count({ where: { department: slug } }),
    prisma.teamAutomation.count({ where: { department: slug } }),
  ]);
  return { members, openTasks, allTasks, templates, automations, referenced: members + allTasks + templates + automations > 0 };
}

/**
 * GET — departmanlar + ekip üyeleri + görüntüleyici yetenekleri (denetim Bulgu 4/9: bileşen
 * yetkiyi bilmiyordu, üye her düğmeye basıp 403 alıyordu). Sayımlar sunucuda tek `groupBy`.
 * Üyeler yalnız ad/avatar görür; e-posta yalnız yöneticiye döner.
 */
export const GET = defineRoute(
  { name: 'team.departments.list', roles: TEAM_ROUTE_ROLES, query: listQuery, rateLimit: 'read' },
  async ({ user, query }) => {
    const viewer = await requireTeamViewer(user.id);
    if (query.impact) {
      if (!viewer.isManager) throw new ApiError('FORBIDDEN', 'Bu işlem için ekip yöneticisi olmalısınız.');
      return { impact: await departmentImpact(query.impact) };
    }
    return loadTeamMeta(viewer);
  }
);

const HEX = /^#[0-9a-f]{6}$/i;

const createBody = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(60),
  description: z.string().trim().max(300).nullish(),
  color: z.string().regex(HEX, 'Geçersiz renk').optional(),
});

const DEFAULT_DEPARTMENTS: { name: string; color: string }[] = [
  { name: 'Dizayn ve Kullanıcı Deneyimi', color: DEPARTMENT_COLORS[0] },
  { name: 'İş Geliştirme, Strateji ve Büyüme', color: DEPARTMENT_COLORS[1] },
  { name: 'Üretim ve Geliştirme', color: DEPARTMENT_COLORS[2] },
  { name: 'Satış, Sponsorluk ve Pazarlama', color: DEPARTMENT_COLORS[3] },
  { name: 'Ar-Ge', color: DEPARTMENT_COLORS[4] },
  { name: 'Finans ve Hukuk', color: DEPARTMENT_COLORS[5] },
  { name: 'Sosyal Medya Yönetimi', color: DEPARTMENT_COLORS[6] },
  { name: 'Rehberlik Danışmanlığı', color: DEPARTMENT_COLORS[7] },
];

const seedQuery = z.object({ seed: z.enum(['1']).optional() });

/**
 * POST — yeni departman. Aynı slug'a düşen ad varsa 409 (eski `upsert` mevcut departmanı
 * sessizce yeniden adlandırıp açıklamasını siliyordu; denetim Bulgu 7/4). `?seed=1` varsayılan
 * 8 departmanı ekler (idempotent, audit'li).
 */
export const POST = defineRoute(
  { name: 'team.departments.create', roles: TEAM_ROUTE_ROLES, query: seedQuery, schema: createBody.optional(), rateLimit: 'mutation' },
  async ({ user, query, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    if (query.seed === '1') {
      let created = 0;
      for (let i = 0; i < DEFAULT_DEPARTMENTS.length; i++) {
        const dep = DEFAULT_DEPARTMENTS[i];
        const slug = slugifyTr(dep.name);
        const exists = await prisma.department.findUnique({ where: { slug }, select: { id: true } });
        if (exists) continue;
        await prisma.department.create({ data: { slug, name: dep.name, color: dep.color, order: i } });
        created++;
      }
      await prisma.auditLog.create({
        data: { userId: viewer.userId, action: 'seed', entity: 'department', newData: { created } as Prisma.InputJsonValue, ...getAuditRequestMeta(request) },
      });
      return { seeded: created };
    }

    if (!body) throw new ApiError('VALIDATION', 'Departman adı gerekli.');
    const d = body;
    const slug = slugifyTr(d.name);
    if (!slug) throw new ApiError('VALIDATION', 'Ad Latin harf ya da rakam içermeli.');
    const existing = await prisma.department.findUnique({ where: { slug }, select: { name: true } });
    if (existing) throw new ApiError('CONFLICT', `Bu ada çok benzeyen "${existing.name}" departmanı zaten var.`);
    const max = await prisma.department.aggregate({ _max: { order: true } });
    const dep = await prisma.department.create({
      data: {
        slug,
        name: d.name,
        description: d.description || null,
        color: d.color || DEPARTMENT_COLORS[0],
        order: (max._max.order ?? -1) + 1,
      },
    });
    await prisma.auditLog.create({
      data: { userId: viewer.userId, action: 'create', entity: 'department', entityId: dep.id, newData: d as Prisma.InputJsonValue, ...getAuditRequestMeta(request) },
    });
    return { department: dep };
  }
);

const patchBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullish(),
  color: z.string().regex(HEX, 'Geçersiz renk').optional(),
  order: z.number().int().min(0).max(1000).optional(),
  /** false = arşivle (yeni atama/filtre listesinden çıkar, veri korunur). */
  isActive: z.boolean().optional(),
  /** Sırayı bir adım yukarı/aşağı kaydır. */
  move: z.enum(['up', 'down']).optional(),
});
const slugQuery = z.object({ slug: z.string().min(1).max(60) });

/** PATCH ?slug= — departmanı düzenle / arşivle / sırala. Slug sabit kalır (referans bütünlüğü). */
export const PATCH = defineRoute(
  { name: 'team.departments.update', roles: TEAM_ROUTE_ROLES, query: slugQuery, schema: patchBody, rateLimit: 'mutation' },
  async ({ user, query, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const dep = await prisma.department.findUnique({ where: { slug: query.slug } });
    if (!dep) throw new ApiError('NOT_FOUND', 'Departman bulunamadı.');

    if (body.move) {
      const all = await prisma.department.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
      const idx = all.findIndex((x) => x.id === dep.id);
      const swap = body.move === 'up' ? idx - 1 : idx + 1;
      if (idx >= 0 && swap >= 0 && swap < all.length) {
        const reordered = [...all];
        [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
        await prisma.$transaction(reordered.map((x, i) => prisma.department.update({ where: { id: x.id }, data: { order: i } })));
      }
    }
    const data: Prisma.DepartmentUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.color !== undefined) data.color = body.color;
    if (body.order !== undefined) data.order = body.order;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    const updated = Object.keys(data).length ? await prisma.department.update({ where: { id: dep.id }, data }) : dep;
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: body.isActive === false ? 'archive' : body.isActive === true ? 'restore' : 'update',
        entity: 'department',
        entityId: dep.id,
        oldData: { name: dep.name, color: dep.color, isActive: dep.isActive } as Prisma.InputJsonValue,
        newData: body as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    return { department: updated };
  }
);

const deleteQuery = z.object({
  slug: z.string().min(1).max(60),
  /** Görev, şablon, otomasyon ve üyelikleri bu departmana taşıyarak sil. */
  mergeInto: z.string().min(1).max(60).optional(),
});

/**
 * DELETE ?slug=[&mergeInto=] — departmanı kaldırır. Referansı varsa ve hedef verilmediyse 409 +
 * etki özeti (denetim Bulgu 2/3: tek tıkla siliyor, görev/şablon/otomasyon ve birincil
 * departmanda bayat slug bırakıyordu). Taşıma ve silme TEK işlemdedir.
 */
export const DELETE = defineRoute(
  { name: 'team.departments.delete', roles: TEAM_ROUTE_ROLES, query: deleteQuery, rateLimit: 'mutation' },
  async ({ user, query, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const dep = await prisma.department.findUnique({ where: { slug: query.slug } });
    if (!dep) throw new ApiError('NOT_FOUND', 'Departman bulunamadı.');
    const impact = await departmentImpact(dep.slug);
    const target = query.mergeInto;
    if (target === dep.slug) throw new ApiError('VALIDATION', 'Departman kendisiyle birleştirilemez.');
    if (target) {
      const t = await prisma.department.findUnique({ where: { slug: target }, select: { isActive: true } });
      if (!t || !t.isActive) throw new ApiError('VALIDATION', 'Hedef departman bulunamadı ya da arşivli.');
    } else if (impact.referenced) {
      throw new ApiError('CONFLICT', 'Bu departman kullanımda. Arşivleyin ya da başka bir departmanla birleştirin.', {
        details: impact,
      });
    }

    await prisma.$transaction(async (tx) => {
      const to = target ?? null;
      await tx.companyTask.updateMany({ where: { department: dep.slug }, data: { department: to } });
      await tx.taskTemplate.updateMany({ where: { department: dep.slug }, data: { department: to } });
      await tx.teamAutomation.updateMany({ where: { department: dep.slug }, data: { department: to } });
      if (to) {
        const links = await tx.userDepartment.findMany({ where: { departmentSlug: dep.slug }, select: { userId: true } });
        if (links.length) {
          await tx.userDepartment.createMany({ data: links.map((l) => ({ userId: l.userId, departmentSlug: to })), skipDuplicates: true });
        }
      }
      await tx.user.updateMany({ where: { adminDepartment: dep.slug }, data: { adminDepartment: to } });
      await tx.userDepartment.deleteMany({ where: { departmentSlug: dep.slug } });
      await tx.department.delete({ where: { id: dep.id } });
      await tx.auditLog.create({
        data: {
          userId: viewer.userId,
          action: to ? 'merge' : 'delete',
          entity: 'department',
          entityId: dep.id,
          oldData: { slug: dep.slug, name: dep.name } as Prisma.InputJsonValue,
          newData: { mergeInto: to, impact } as Prisma.InputJsonValue,
          ...getAuditRequestMeta(request),
        },
      });
    });
    return { deleted: true, mergedInto: target ?? null, impact };
  }
);
