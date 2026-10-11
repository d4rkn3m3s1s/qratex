/**
 * GET   /api/admin/store/cosmetics/[id] — Ayrıntı: 30 gün edinim serisi, son sahipler, geçmiş.
 * PATCH /api/admin/store/cosmetics/[id] — Değişen alanlar + yüklendiği andaki değerler (409 çakışma, tür kilidi).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cosmeticPatchSchema } from '@/lib/admin-store/contract';
import { getCosmeticDetail, updateCosmetic } from '@/lib/admin-store/cosmetics.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.store.cosmetics.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getCosmeticDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.store.cosmetics.update', roles: ['ADMIN'], params, schema: cosmeticPatchSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateCosmetic(params.id, body, actorFromSession(session), request))
);
