/** POST /api/admin/design-system/theme/rollback — bir yayından ÖNCEKİ temaya dön (iyimser kilit, denetimli, önbellek anında tazelenir). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { RollbackThemeBody } from '@/lib/design-system/theme-schemas';
import { rollbackTheme } from '@/lib/design-system/theme.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.designSystem.theme.rollback', roles: ['ADMIN'], schema: RollbackThemeBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await rollbackTheme(actionCtx(session, request), body))
);
