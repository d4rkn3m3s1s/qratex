/**
 * /api/admin/inbox/[id]
 *  GET    — mail + konuşmanın tamamı (YAN ETKİSİZ; okundu işaretlemesi PATCH ile).
 *  PATCH  — { seen?, archived? } okundu/okunmadı, arşivle/geri al.
 *  DELETE — kalıcı silme (ekler depolamadan da silinir; denetimli).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { inboxPatchSchema } from '@/lib/mail-center/inbox-contract';
import { deleteInboxMessage, getInboxDetail, patchInboxMessage } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(40) });

export const GET = defineRoute(
  { name: 'admin.inbox.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getInboxDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.inbox.patch', roles: ['ADMIN'], params, schema: inboxPatchSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) =>
    ok(await patchInboxMessage({ id: params.id, seen: body.seen, archived: body.archived, session, meta: getAuditRequestMeta(request) }))
);

export const DELETE = defineRoute(
  { name: 'admin.inbox.delete', roles: ['ADMIN'], params, rateLimit: 'mutation' },
  async ({ params, session, request }) => {
    await deleteInboxMessage({ id: params.id, session, meta: getAuditRequestMeta(request) });
    return ok({ id: params.id, deleted: true });
  }
);
