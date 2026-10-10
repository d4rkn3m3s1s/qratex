import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { archiveConversation, getConversation, updateConversation } from '@/lib/dealer-assistant/server';
import { ASSISTANT_PERIODS, TITLE_MAX } from '@/lib/dealer-assistant/types';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

/** GET — sohbet ayrıntısı (mesajlar, dayanak kartları, kaynaklar). Sahiplik DB'den. */
export const GET = defineRoute(
  { name: 'dealer.assistant.conversation', roles: ['DEALER'], tenant: 'dealer', module: 'ai_features', rateLimit: 'read', params: Params },
  async ({ tenant, params }) => {
    const detail = await getConversation(tenant.dealerId, params.id);
    if (!detail) throw new ApiError('NOT_FOUND', 'Sohbet bulunamadı.');
    return ok(detail);
  },
);

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    pinned: z.boolean().optional(),
    period: z.enum(ASSISTANT_PERIODS).optional(),
    rate: z.object({ messageId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), rating: z.union([z.literal(1), z.literal(-1), z.null()]) }).optional(),
    restore: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Değişiklik yok.' });

/** PATCH — yeniden adlandır, sabitle, dönem, yanıt değerlendirmesi ya da arşivden geri al. */
export const PATCH = defineRoute(
  { name: 'dealer.assistant.conversation.update', roles: ['DEALER'], tenant: 'dealer', module: 'ai_features', rateLimit: 'mutation', params: Params, schema: PatchBody },
  async ({ tenant, params, body }) => {
    if (body.restore) {
      await archiveConversation(tenant.dealerId, params.id, true);
      return ok({ id: params.id, restored: true });
    }
    return ok(await updateConversation(tenant.dealerId, params.id, body));
  },
);

/** DELETE — arşivle (fiziksel silme yok; PATCH `restore` ile geri alınır). */
export const DELETE = defineRoute(
  { name: 'dealer.assistant.conversation.archive', roles: ['DEALER'], tenant: 'dealer', module: 'ai_features', rateLimit: 'mutation', params: Params },
  async ({ tenant, params }) => {
    await archiveConversation(tenant.dealerId, params.id);
    return ok({ id: params.id, archived: true });
  },
);
