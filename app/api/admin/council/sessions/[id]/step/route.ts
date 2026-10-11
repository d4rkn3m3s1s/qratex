/**
 * POST /api/admin/council/sessions/[id]/step — sıradaki adımı (bir tartışma turu ya da sentez) çalıştırır.
 * Sunucu otoriter: adımı DB'den belirler, kilitle tek seferde çalıştırır, hep-ya-hiç kaydeder.
 * Adım en fazla iki ardışık LLM çağrısı süresi sürer (uzmanlar paralel + Kaptan).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { stepSession } from '@/lib/council/sessions.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.council.sessions.step', roles: ['ADMIN'], params, rateLimit: 'ai' },
  async ({ params, session }) => ok(await stepSession(params.id, actorFromSession(session)))
);
