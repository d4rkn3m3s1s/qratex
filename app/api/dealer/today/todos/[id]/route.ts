/**
 * `PATCH /api/dealer/today/todos/[id]` — yapılacak maddesini tamamla / geri al.
 * Yalnız DEALER; kayıt oturumdaki bayiye ait olmalı (aksi 404). Silme yok.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { TodoNotFoundError, setTodoStatus } from '@/lib/dealer-today/todos';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'dealer.today.todos.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ status: z.enum(['done', 'pending']) }),
  },
  async ({ tenant, params, body }) => {
    try {
      return ok(await setTodoStatus(tenant.dealerId, params.id, body.status));
    } catch (error) {
      if (error instanceof TodoNotFoundError) throw new ApiError('NOT_FOUND', error.message);
      throw error;
    }
  }
);
