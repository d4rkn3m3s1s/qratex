/** GET /api/admin/ai/quality/chats/export — filtreli, PII maskeli CSV (en çok 5000 satır, BOM); denetim kaydı yazılır. */
import { defineRoute } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { chatListQuerySchema } from '@/lib/ai-quality/contract';
import { exportChatsCsv } from '@/lib/ai-quality/chats.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai.quality.chats.export', roles: ['ADMIN'], query: chatListQuerySchema, rateLimit: 'sensitive' },
  async ({ query, session, request }) => {
    const { csv } = await exportChatsCsv(query, actorFromSession(session), request);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qra-sohbet-${day}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
);
