/**
 * POST /api/admin/ai-ops/assistant — admin AI asistanı. Bağlam: dönem toplamları + bayi risk sıralaması.
 * LLM yalnız mevcut geçitten (`askAI` → guardAiCall + AIUsageLog). Hata/kota metni yanıt sayılmaz (503/429).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { assistantSchema } from '@/lib/admin-ai-ops/contract';
import { askAssistant } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = defineRoute(
  { name: 'admin.ai_ops.assistant', roles: ['ADMIN'], schema: assistantSchema, rateLimit: 'ai' },
  async ({ body, session }) => ok(await askAssistant(prisma, body, `admin:${session.user.id}`))
);
