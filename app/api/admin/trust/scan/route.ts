/** POST /api/admin/trust/scan — kuralları gerçek veriye uygular, tekilleştirilmiş vaka açar (kullanıcı durumuna dokunmaz). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { runScan } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.trust.scan', roles: ['ADMIN'], rateLimit: { max: 6, windowMs: 60_000, by: 'user' }, idempotent: true },
  async ({ session, request }) => ok(await runScan(actionCtx(session, request)))
);
