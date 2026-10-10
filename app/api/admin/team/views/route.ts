import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';

export const dynamic = 'force-dynamic';

/** GET — kendi görünümlerim + ekip geneline paylaşılanlar (kimin olduğu ve silinebilirlik bayrağıyla). */
export const GET = defineRoute(
  { name: 'team.views.list', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    const viewer = await requireTeamViewer(user.id);
    const views = await prisma.teamSavedView.findMany({
      where: { OR: [{ userId: viewer.userId }, { isShared: true }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, name: true, config: true, isShared: true, userId: true, user: { select: { name: true } } },
    });
    return {
      items: views.map((v) => ({
        id: v.id,
        name: v.name,
        config: v.config,
        isShared: v.isShared,
        ownerName: v.user?.name ?? null,
        mine: v.userId === viewer.userId,
      })),
    };
  }
);

/** Görünüm yapılandırması: yalnız bilinen filtre anahtarları (serbest JSON kabul edilmez). */
const configSchema = z
  .object({
    tab: z.string().max(20).optional(),
    department: z.string().max(60).optional(),
    status: z.string().max(20).optional(),
    priority: z.string().max(20).optional(),
    assignedTo: z.string().max(60).optional(),
    tag: z.string().max(40).optional(),
    q: z.string().max(120).optional(),
    mine: z.string().max(2).optional(),
    sort: z.string().max(20).optional(),
    group: z.string().max(20).optional(),
  })
  .strict();

const createBody = z.object({
  name: z.string().trim().min(1, 'Ad gerekli').max(60),
  config: configSchema,
  isShared: z.boolean().optional(),
});

/** POST — görünüm kaydet. Ekip geneline paylaşma yalnız yöneticide. */
export const POST = defineRoute(
  { name: 'team.views.create', roles: TEAM_ROUTE_ROLES, schema: createBody, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const viewer = await requireTeamViewer(user.id);
    if (body.isShared && !viewer.isManager) throw new ApiError('FORBIDDEN', 'Görünümü ekiple yalnız yönetici paylaşabilir.');
    const count = await prisma.teamSavedView.count({ where: { userId: viewer.userId } });
    if (count >= 30) throw new ApiError('CONFLICT', 'En fazla 30 görünüm kaydedebilirsin; eskilerden birini sil.');
    const view = await prisma.teamSavedView.create({
      data: { userId: viewer.userId, name: body.name, config: body.config as Prisma.InputJsonValue, isShared: !!body.isShared },
      select: { id: true, name: true, config: true, isShared: true },
    });
    return { item: { ...view, ownerName: viewer.name, mine: true } };
  }
);

const idQuery = z.object({ id: z.string().min(1).max(60) });

/** DELETE ?id= — yalnız sahibi siler (arayüz başkasınınkinde sil düğmesi göstermez). */
export const DELETE = defineRoute(
  { name: 'team.views.delete', roles: TEAM_ROUTE_ROLES, query: idQuery, rateLimit: 'mutation' },
  async ({ user, query }) => {
    const viewer = await requireTeamViewer(user.id);
    const existing = await prisma.teamSavedView.findUnique({ where: { id: query.id }, select: { userId: true } });
    if (!existing) throw new ApiError('NOT_FOUND', 'Görünüm bulunamadı.');
    if (existing.userId !== viewer.userId) throw new ApiError('FORBIDDEN', 'Yalnız kendi görünümünü silebilirsin.');
    await prisma.teamSavedView.delete({ where: { id: query.id } });
    return { deleted: true };
  }
);
