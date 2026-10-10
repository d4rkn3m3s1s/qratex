import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { slugifyTr } from '@/lib/team/slug';

export const dynamic = 'force-dynamic';

/**
 * Etiket havuzu. Denetim Bulgu 16: havuz hiçbir yerde okunmuyordu (kartlar adı hash'leyip renk
 * üretiyordu). Artık görev formu bu listeden öneri sunar, kart rengi havuzdaki renkten gelir.
 */
export const GET = defineRoute(
  { name: 'team.tags.list', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    await requireTeamViewer(user.id);
    const tags = await prisma.teamTag.findMany({ orderBy: { label: 'asc' }, take: 200, select: { slug: true, label: true, color: true } });
    return { items: tags };
  }
);

const upsertBody = z.object({
  label: z.string().trim().min(1, 'Etiket adı gerekli').max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Geçersiz renk').optional(),
});

/** POST — etiket ekle ya da rengini/adını güncelle (aynı slug). Yönetici. */
export const POST = defineRoute(
  { name: 'team.tags.upsert', roles: TEAM_ROUTE_ROLES, schema: upsertBody, rateLimit: 'mutation' },
  async ({ user, body }) => {
    await requireTeamViewer(user.id, { manager: true });
    const slug = slugifyTr(body.label);
    if (!slug) throw new ApiError('VALIDATION', 'Etiket Latin harf ya da rakam içermeli.');
    const tag = await prisma.teamTag.upsert({
      where: { slug },
      create: { slug, label: body.label, color: body.color ?? '#6d28d9' },
      update: { label: body.label, ...(body.color ? { color: body.color } : {}) },
      select: { slug: true, label: true, color: true },
    });
    return { item: tag };
  }
);

const slugQuery = z.object({ slug: z.string().min(1).max(60) });

/** DELETE ?slug= — havuzdan kaldır (görevlerdeki etiket metni korunur). Yönetici. */
export const DELETE = defineRoute(
  { name: 'team.tags.delete', roles: TEAM_ROUTE_ROLES, query: slugQuery, rateLimit: 'mutation' },
  async ({ user, query }) => {
    await requireTeamViewer(user.id, { manager: true });
    const res = await prisma.teamTag.deleteMany({ where: { slug: query.slug } });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Etiket bulunamadı.');
    return { deleted: true };
  }
);
