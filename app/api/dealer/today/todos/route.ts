/**
 * `POST /api/dealer/today/todos` — AI önerisini yapılacaklara ekle ya da yoksay.
 *
 * Eski copilot "Ekle" butonu kayıt oluşturmuyordu (SAHTE, copilot B2). Yalnız DEALER; geri
 * bildirim oturumdaki bayiye ait olmalı (aksi 404); aynı öneri iki kez eklenemez (409).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { TodoDuplicateError, TodoNotFoundError, createTodoFromSuggestion } from '@/lib/dealer-today/todos';

export const dynamic = 'force-dynamic';

const Body = z.object({
  feedbackId: z.string().min(1).max(64),
  text: z.string().trim().min(4).max(500),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dismiss: z.boolean().optional(),
});

export const POST = defineRoute(
  {
    name: 'dealer.today.todos.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    schema: Body,
  },
  async ({ tenant, body }) => {
    try {
      return ok(await createTodoFromSuggestion(tenant.dealerId, body), { status: 201 });
    } catch (error) {
      if (error instanceof TodoNotFoundError) throw new ApiError('NOT_FOUND', error.message);
      if (error instanceof TodoDuplicateError) throw new ApiError('CONFLICT', error.message);
      throw error;
    }
  }
);
