/** PATCH /api/admin/design-system/a11y/checklist — tek kriterin durumunu/notunu yaz (iyimser kilit 409, "Kaldı" için not zorunlu, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { PatchChecklistBody } from '@/lib/design-system/a11y-checklist';
import { patchChecklistItem } from '@/lib/design-system/a11y.server';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  { name: 'admin.designSystem.a11y.checklist', roles: ['ADMIN'], schema: PatchChecklistBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await patchChecklistItem(actionCtx(session, request), body))
);
