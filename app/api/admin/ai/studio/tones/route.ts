/**
 * GET  /api/admin/ai/studio/tones — yerleşik + DB üslupları, kullanım sayıları, kataloğa düşmeyen anahtarlar.
 * POST /api/admin/ai/studio/tones — yeni üslup (ya da yerleşik ailenin etkinleştirilmesi); anahtar benzersiz → 409.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { toneCreateSchema } from '@/lib/ai-studio/contract';
import { createTone, getTonesState } from '@/lib/ai-studio/tones.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai-studio.tones', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getTonesState()));

export const POST = defineRoute(
  { name: 'admin.ai-studio.tones.create', roles: ['ADMIN'], schema: toneCreateSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createTone(body, actorFromSession(session), request), { status: 201 })
);
