/**
 * POST /api/dealer/inbox/actions — durum/atama işlemi (tekli ya da toplu, en fazla 50 kayıt).
 *
 *   { keys: string[], action: 'resolve'|'reopen'|'assign'|'unassign'|'viewed', assigneeId?: string }
 *
 * Kapatma kayda bağlı açık vakaları kapatır (yoksa kapanmış bir gelen kutusu vakası açar),
 * atama vaka üzerinden yapılır (yalnız işletme sahibi ya da AKTİF personel atanabilir).
 * Sonuç kayıt başına `{ key, ok, error? }` — kısmi başarı görünürdür.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { applyInboxAction, INBOX_BULK_MAX, InboxError } from '@/lib/dealer-inbox/server';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  keys: z
    .array(z.string().regex(/^(qr|cr)-[A-Za-z0-9_-]{1,64}$/, 'Geçersiz kayıt anahtarı.'))
    .min(1, 'En az bir kayıt seçin.')
    .max(INBOX_BULK_MAX, `Tek seferde en fazla ${INBOX_BULK_MAX} kayıt işlenebilir.`),
  action: z.enum(['resolve', 'reopen', 'assign', 'unassign', 'viewed'], {
    errorMap: () => ({ message: 'Geçersiz işlem.' }),
  }),
  assigneeId: z.string().max(64).nullable().optional(),
});

export const POST = defineRoute(
  {
    name: 'dealer.inbox.actions',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    schema: bodySchema,
  },
  async ({ body, tenant, user }) => {
    try {
      const results = await applyInboxAction({
        dealerId: tenant.dealerId,
        actorId: user.id,
        keys: body.keys,
        action: body.action,
        assigneeId: body.assigneeId ?? null,
      });
      return ok({ results, okCount: results.filter((r) => r.ok).length, failCount: results.filter((r) => !r.ok).length });
    } catch (err) {
      if (err instanceof InboxError) throw new ApiError(err.code, err.message, { status: err.status, details: err.details });
      throw err;
    }
  }
);
