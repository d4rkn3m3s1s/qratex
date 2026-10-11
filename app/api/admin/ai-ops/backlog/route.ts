/**
 * GET  /api/admin/ai-ops/backlog — analiz kuyruğu özeti (bekleyen, hak bitmiş, politika engelli, sahte).
 * POST /api/admin/ai-ops/backlog — kuyruk işlemleri: process | retry_one | requeue_exhausted | clear_synthetic.
 *   Hepsi ai-retry cron'uyla aynı hattı kullanır; hiçbiri sahte AI sinyali yazmaz. Denetim kaydı zorunlu.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { backlogActionSchema } from '@/lib/admin-ai-ops/contract';
import { getBacklogSummary, runBacklogAction } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = defineRoute({ name: 'admin.ai_ops.backlog', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getBacklogSummary(prisma)));

export const POST = defineRoute(
  {
    name: 'admin.ai_ops.backlog.action',
    roles: ['ADMIN'],
    schema: backlogActionSchema,
    // LLM tetikleyebilen yazma: dakikada 6 (çift tıklama / döngü koruması).
    rateLimit: { max: 6, windowMs: 60_000, by: 'user-or-ip' },
  },
  async ({ body, session, request }) => ok(await runBacklogAction(prisma, body, actorFromSession(session), request))
);
