/**
 * GET   /api/admin/badges/[id] — Rozet ayrıntısı: 30 günlük kazanım serisi (İstanbul günü),
 *                                son kazananlar, değişiklik geçmişi.
 * PATCH /api/admin/badges/[id] — Düzenle (zod; koşul birleştirilir; karakterde koşul kilitli).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { getBadgeDetail, updateBadge } from '@/lib/admin-badges/server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.badges.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getBadgeDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.badges.update', roles: ['ADMIN'], params, schema: z.record(z.unknown()), rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateBadge(params.id, body, actorFromSession(session), request))
);
