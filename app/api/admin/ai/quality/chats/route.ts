/** GET /api/admin/ai/quality/chats — QRA sohbet kayıtları (PII maskeli önizleme, filtreli, sayfalı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { chatListQuerySchema } from '@/lib/ai-quality/contract';
import { listChats } from '@/lib/ai-quality/chats.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai.quality.chats.list', roles: ['ADMIN'], query: chatListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listChats(query))
);
