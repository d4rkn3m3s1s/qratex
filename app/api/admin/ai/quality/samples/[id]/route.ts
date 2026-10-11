/**
 * GET   /api/admin/ai/quality/samples/[id] — örnek detayı (maskeli tam metin, yapılandırılmış AI alanları, geçmiş)
 * PATCH /api/admin/ai/quality/samples/[id] — karar: review (alan bazlı) | skip | void | reopen
 *       İyimser kilit (expectedStatus + expectedReviewedAt) → 409; her karar denetim kaydına yazılır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { sampleActionSchema } from '@/lib/ai-quality/contract';
import { applySampleAction, getSampleDetail } from '@/lib/ai-quality/quality.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.ai.quality.samples.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getSampleDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.ai.quality.samples.action', roles: ['ADMIN'], params, schema: sampleActionSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await applySampleAction(params.id, body, actorFromSession(session), request))
);
