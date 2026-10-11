/**
 * GET  /api/admin/badges — Rozet kataloğu (sunucu filtre/arama/sıralama/sayfalama).
 * POST /api/admin/badges — Yeni rozet (zod, idempotent, denetimli).
 * Müşteri ucu `/api/gamification/badges` ile admin yönetimi ayrıldı (rapor Bulgu 3).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { badgeListQuerySchema, badgeUpsertSchema } from '@/lib/admin-badges/contract';
import { createBadge, listBadges } from '@/lib/admin-badges/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.badges.list', roles: ['ADMIN'], query: badgeListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listBadges(query))
);

export const POST = defineRoute(
  { name: 'admin.badges.create', roles: ['ADMIN'], schema: badgeUpsertSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createBadge(body, actorFromSession(session), request), { status: 201 })
);
