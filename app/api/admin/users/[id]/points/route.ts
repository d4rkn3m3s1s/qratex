/**
 * POST /api/admin/users/[id]/points — bakiye düzeltmesi (`adjustPointsByAdmin`).
 * Gerekçe kodu + açıklama zorunlu; |miktar| ≤ 100.000; günlük toplam 10.000'i aşan pozitif
 * düzeltme ikinci yöneticinin imzalı onay belirtecini ister (SECOND_APPROVAL_REQUIRED).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { adjustPointsSchema, idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx, adjustPoints } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.users.points',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: adjustPointsSchema,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
  },
  async ({ params, body, session, request }) => ok(await adjustPoints(actionCtx(session, request), params.id, body))
);
