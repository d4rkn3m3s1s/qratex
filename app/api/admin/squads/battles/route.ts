/**
 * GET  /api/admin/squads/battles — savaş listesi (durum sekmesi, arama, köken, sayfalama + sayaçlar).
 * POST /api/admin/squads/battles — yönetici onur savaşı (ödülsüz; davet ya da hemen başlat).
 *   Sunucu doğrulamalı: klan ≠ klan, süre 1–168 saat, dondurulmuş klan yok, klan başına tek açık savaş.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { battleCreateSchema, battleListQuerySchema } from '@/lib/admin-squads/contract';
import { listBattles } from '@/lib/admin-squads/server';
import { createAdminBattle } from '@/lib/admin-squads/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.battles.list', roles: ['ADMIN'], query: battleListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listBattles(query))
);

export const POST = defineRoute(
  { name: 'admin.squads.battles.create', roles: ['ADMIN'], schema: battleCreateSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, user, request }) => ok(await createAdminBattle(body, { userId: user.id, ...getAuditRequestMeta(request) }), { status: 201 })
);
