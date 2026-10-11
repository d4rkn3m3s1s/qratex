/** GET /api/admin/design-system/a11y — erişilebilirlik tercihi benimsenmesi (rol kırılımı, 10 dk önbellek) + el ile doğrulama listesi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getChecklist, getPrefsSummary } from '@/lib/design-system/a11y.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.designSystem.a11y.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => {
  const [prefs, checklist] = await Promise.all([getPrefsSummary(), getChecklist()]);
  return ok({ prefs, checklist });
});
