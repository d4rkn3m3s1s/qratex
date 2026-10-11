/** GET/POST /api/admin/integrations/keys — API anahtarları (hash'li, kapsamlı, süreli). Ham anahtar yalnız POST yanıtında. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { CreateKeyBody, KeyListQuery } from '@/lib/integrations/contract';
import { createKey, listKeys } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.integrations.keys.list', roles: ['ADMIN'], query: KeyListQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listKeys(query))
);

export const POST = defineRoute(
  { name: 'admin.integrations.keys.create', roles: ['ADMIN'], schema: CreateKeyBody, rateLimit: 'sensitive', idempotent: true },
  async ({ body, session, request }) => ok(await createKey(ctxFrom(session, request), body), { status: 201 })
);
